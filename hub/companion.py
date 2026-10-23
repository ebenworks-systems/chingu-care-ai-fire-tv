"""The check-in conversation: the companion's turns, the emergency check and the family note.

The model is any OpenAI-compatible chat endpoint (LLM_BASE_URL, LLM_API_KEY,
LLM_MODEL). Ebenworks runs it on Njere Engine. Without an endpoint the hub
falls back to a scripted companion, so the TV app runs anywhere.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from dataclasses import dataclass, field

import httpx

AI_NOTICE = {
    "en": "Hello, this is your AI companion.",
    "ko": "안녕하세요, AI 친구입니다.",
}

PERSONA = """You are the AI care companion in Chingu Care AI, talking with an older parent on their living-room TV.
Rules:
- The app has already said "Hello, this is your AI companion." Do not introduce yourself or give yourself a name; if you must refer to the service, call it Chingu Care AI.
- Reply in {language} only, in one or two short, warm sentences (at most 25 words). The parent reads your words in large type on the TV and hears them aloud.
- After the check-in the family automatically receives a short note written from this conversation. If the parent wants the family told something, say it will be in today's note.
- Ask one simple question at a time. Good subjects: sleep, meals, how the body feels, plans for today, the family, what they enjoyed watching.
- Do not diagnose, prescribe or give medical advice. If the parent mentions feeling unwell, suggest they rest and tell family or a doctor.
- If asked whether you are a person, say first: "I'm an AI companion, not a person."
- Never pretend to be family. Never invent facts about the family beyond what you are told.
Context you may use: the parent is {name}, {age}, living in {city}. Family: {family}. Today's medicines: {medicines}.
Answer with JSON only, with exactly these keys: {{"reply": "<your words>", "suggestions": ["<short answer the parent could give>", "<another>", "<another>"]}}.
The three suggestions are things the PARENT might say next, each under 6 words, written as the parent speaking."""

NOTE_PROMPT = """Write the note the family receives after this check-in between an AI companion and an older parent.
Rules: one or two sentences in English, a paraphrase in the third person using the parent's first name, never a transcript or a quote.
Mention health only if the parent raised it. Do not add facts that are not in the conversation.
Answer with JSON only, with exactly these keys: {"body": "<note>", "mood_signal": "good" | "okay" | "low" | null, "flags": [], "includes_health": true | false}.
mood_signal is null unless the parent said how they feel. flags may contain "scam_mention" if someone asked the parent for money or bank details, otherwise it is empty."""

CHECK_PROMPT = """You check one sentence an older parent said to an AI companion for signs of a medical emergency or danger (chest pain, cannot breathe, a fall and cannot get up, stroke signs, severe bleeding, thoughts of self-harm, a fire).
Answer with JSON only, with exactly these keys: {"emergency": true | false, "kind": "<short label or empty>"}."""

# A small phrase table that runs before every reply, beside the model check.
# Scores follow the main product's idea: 3 or more is an emergency, 2 a caution.
PHRASES = [
    (r"\bchest (pain|hurts?|is tight|feels tight|tight)|\b(pain|pressure) in (my|the) chest|\bchest.{0,20}(pressure|squeez)", 3.0, "chest pain"),
    (r"\b(can'?t|cannot) breathe|\bshort of breath", 3.0, "breathing"),
    (r"\b(fell|fallen|fall) (down|over)?.*\b(can'?t|cannot) (get|stand) up", 3.0, "fall"),
    (r"\bi (fell|have fallen|had a fall)", 2.0, "fall"),
    (r"\b(face|arm) (is )?(numb|drooping)|\bslurr", 3.0, "stroke signs"),
    (r"\b(kill myself|end my life|want to die)", 3.0, "self-harm"),
    (r"\bdizzy|\bfaint", 2.0, "dizziness"),
    (r"\bfire\b|\bsmoke\b", 2.0, "fire"),
    (r"가슴.*(아파|통증)|숨.*(못|차)", 3.0, "chest or breathing"),
    (r"넘어졌|쓰러졌", 2.0, "fall"),
]

EMERGENCY_SCRIPT = {
    "en": "Please call {n} right now. I can't make the call for you. I have told your family.",
    "ko": "지금 바로 {n}에 전화해 주세요. 제가 대신 전화할 수는 없어요. 가족에게 알렸어요.",
}
CAUTION_LINE = {
    "en": "If you feel very unwell, please don't wait. Call {n} right away.",
    "ko": "많이 불편하시면 기다리지 마시고 바로 {n}에 전화해 주세요.",
}

SCRIPTED = {
    "en": [
        ("How did you sleep last night?", ["I slept well", "Not very well", "I woke up a lot"]),
        ("That's good to hear. Have you had breakfast yet?", ["Yes, rice and soup", "Not yet", "Just tea"]),
        ("What would you like to do today?", ["Watch my drama", "Go for a walk", "Call my daughter"]),
        ("That sounds lovely. Ji-woo sent you a photo this morning. Shall we look at it after this?", ["Yes, please", "Later", "Thank you"]),
    ],
    "ko": [
        ("어젯밤에 잘 주무셨어요?", ["잘 잤어요", "잘 못 잤어요", "자주 깼어요"]),
        ("다행이에요. 아침은 드셨어요?", ["네, 밥 먹었어요", "아직이요", "차만 마셨어요"]),
        ("오늘은 무엇을 하고 싶으세요?", ["드라마 볼래요", "산책할래요", "딸한테 전화할래요"]),
        ("좋네요. 지우 씨가 아침에 사진을 보냈어요. 이따가 같이 볼까요?", ["네, 좋아요", "나중에요", "고마워요"]),
    ],
}


@dataclass
class Session:
    id: str
    lang: str = "en"
    turns: list[dict] = field(default_factory=list)
    scripted_step: int = 0
    emergency: dict | None = None
    memory: list[dict] = field(default_factory=list)
    now: str = ""  # the household's local time, so "earlier today" and "yesterday" come out right


class Companion:
    def __init__(self, household: dict):
        self.base = (os.environ.get("LLM_BASE_URL") or "").rstrip("/")
        self.key = os.environ.get("LLM_API_KEY") or os.environ.get("NJERE_API_KEY") or ""
        self.model = os.environ.get("LLM_MODEL", "sonnet")
        self.check_model = os.environ.get("LLM_CHECK_MODEL", "haiku")
        self.household = household
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(30.0))

    @property
    def live(self) -> bool:
        return bool(self.base and self.key)

    async def _chat(self, messages: list[dict], model: str, max_tokens: int = 400) -> dict | None:
        """One chat call that must return a JSON object; None on any failure."""
        if not self.live:
            return None
        url = self.base + ("/chat/completions" if self.base.endswith("/v1") else "/v1/chat/completions")
        try:
            r = await self.client.post(
                url,
                headers={"Authorization": f"Bearer {self.key}"},
                json={"model": model, "messages": messages, "max_tokens": max_tokens},
            )
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"] or ""
            match = re.search(r"\{.*\}", text, re.S)
            return json.loads(match.group(0)) if match else None
        except (httpx.HTTPError, KeyError, ValueError, IndexError):
            return None

    def _persona(self, lang: str, memory: list[dict] | None = None, now: str = "") -> str:
        h = self.household
        recall = f"\nIt is now {now} where the parent lives." if now else ""
        if memory:
            recall += "\nNotes your family received after earlier check-ins (newest first):\n" + "\n".join(
                f'- {m["at"][:16].replace("T", " ")}: {m["body"]}' for m in memory
            ) + "\nIf one of them mentions something to follow up (how they felt, a pain, a plan), ask about it in your first question, briefly and kindly."
        return PERSONA.format(
            language="Korean" if lang == "ko" else "English",
            name=h["parent"]["name"],
            age=h["parent"]["age"],
            city=h["parent"]["city"],
            family=", ".join(f'{m["name"]} ({m["relation"]}, in {m["city"]})' for m in h["family"]),
            medicines=", ".join(f'{m["name"]} at {m["time"]}' for m in h["medicines"]),
        ) + recall

    @staticmethod
    def phrase_score(text: str) -> tuple[float, str]:
        best, kind = 0.0, ""
        low = text.lower()
        for pattern, score, label in PHRASES:
            if re.search(pattern, low) and score > best:
                best, kind = score, label
        return best, kind

    async def check(self, text: str) -> dict:
        """Check one sentence: the phrase table first, the model beside it."""
        score, kind = self.phrase_score(text)
        model = await self._chat(
            [{"role": "system", "content": CHECK_PROMPT}, {"role": "user", "content": text}],
            self.check_model,
            max_tokens=60,
        )
        if model and model.get("emergency") is True:
            score = max(score, 3.0)
            kind = kind or str(model.get("kind") or "emergency")
        level = "emergency" if score >= 3.0 else "caution" if score >= 2.0 else None
        return {"level": level, "kind": kind, "score": score, "model_checked": model is not None}

    async def open(self, session: Session) -> dict:
        lang = session.lang
        opening = None
        if self.live:
            opening = await self._chat(
                [
                    {"role": "system", "content": self._persona(lang, session.memory, session.now)},
                    {"role": "user", "content": "(The parent just pressed Talk on the remote to start a check-in. Greet them by first name and ask your first question."
                     + (" Your first question must follow up on the most recent note above, naming what it mentioned.)" if session.memory else ")")},
                ],
                self.model,
            )
        if opening and opening.get("reply"):
            reply, suggestions = opening["reply"], opening.get("suggestions") or []
        else:
            reply, suggestions = SCRIPTED[lang][0]
            session.scripted_step = 1
        session.turns.append({"role": "assistant", "content": reply})
        return {"notice": AI_NOTICE[lang], "reply": reply, "suggestions": suggestions[:3], "source": "model" if opening else "scripted"}

    async def turn(self, session: Session, text: str) -> dict:
        lang = session.lang
        number = self.household["parent"]["emergency_number"]
        session.turns.append({"role": "user", "content": text})
        check_task = asyncio.create_task(self.check(text))
        reply_task = None
        if self.live:
            reply_task = asyncio.create_task(
                self._chat([{"role": "system", "content": self._persona(lang, session.memory, session.now)}, *session.turns], self.model)
            )
        check = await check_task
        if check["level"] == "emergency":
            if reply_task:
                reply_task.cancel()
            session.emergency = {**check, "number": number}
            reply = EMERGENCY_SCRIPT[lang].format(n=number)
            session.turns.append({"role": "assistant", "content": reply})
            return {"reply": reply, "suggestions": [], "emergency": session.emergency, "source": "safety"}
        result = await reply_task if reply_task else None
        if result and result.get("reply"):
            reply, suggestions, source = result["reply"], result.get("suggestions") or [], "model"
        else:
            script = SCRIPTED[lang]
            step = min(session.scripted_step, len(script) - 1)
            reply, suggestions = script[step]
            session.scripted_step += 1
            source = "scripted"
        if check["level"] == "caution":
            reply = CAUTION_LINE[lang].format(n=number) + " " + reply
        session.turns.append({"role": "assistant", "content": reply})
        return {"reply": reply, "suggestions": suggestions[:3], "emergency": None, "caution": check["level"] == "caution", "source": source}

    async def note(self, session: Session) -> dict:
        first = self.household["parent"]["first"]
        transcript = "\n".join(
            f'{"Parent" if t["role"] == "user" else "Companion"}: {t["content"]}' for t in session.turns
        )
        result = await self._chat(
            [
                {"role": "system", "content": NOTE_PROMPT},
                {"role": "user", "content": f"Parent's first name: {first}\n\n{transcript}"},
            ],
            self.model,
            max_tokens=200,
        )
        if not result or not result.get("body"):
            said = [t["content"] for t in session.turns if t["role"] == "user"]
            result = {
                "body": f"{first} talked with Chingu for a few minutes and answered {len(said)} questions about her day.",
                "mood_signal": None,
                "flags": [],
                "includes_health": False,
            }
        if session.emergency:
            result["flags"] = sorted(set(result.get("flags") or []) | {"emergency"})
        result["ai_label"] = "Written by AI from the conversation."
        return result
