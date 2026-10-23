"""Chingu Care AI TV hub: the small server the Fire TV app and the family's phone page talk to.

Run:  .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8797
The Android TV emulator reaches it at http://10.0.2.2:8797.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import os
import time
import uuid
import wave
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import household as hh
from companion import Companion, Session

ROOT = Path(__file__).parent
CACHE = ROOT / ".cache" / "tts"
DATA = ROOT / ".data"  # the household's routine and recent notes; HUB_MEMORY=off keeps them in memory only
CACHE.mkdir(parents=True, exist_ok=True)
VOICE = Path(os.environ.get("PIPER_VOICE", ROOT / "voices" / "en_US-ljspeech-high.onnx"))
MAX_UPLOAD = 8 * 1024 * 1024

# DEMO_START=HH:MM[:SS] starts the household's clock at that time today, so a demo
# recorded in the evening can still show the parent's morning. Unset = real time.
_demo_start = os.environ.get("DEMO_START")
_offset = timedelta(0)
if _demo_start:
    _h, _m, _s = ([int(x) for x in _demo_start.split(":")] + [0])[:3]
    _real = datetime.now()
    _offset = _real.replace(hour=_h, minute=_m, second=_s, microsecond=0) - _real


def hub_now() -> datetime:
    return datetime.now() + _offset

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # REMINDER_CLOCK=off leaves reminders to /api/demo/remind, for a recorded demo with exact timing.
    clock = None if os.environ.get("REMINDER_CLOCK") == "off" else asyncio.create_task(reminder_clock())
    watch = asyncio.create_task(routine_watch())
    yield
    watch.cancel()
    if clock:
        clock.cancel()


app = FastAPI(title="Chingu Care AI TV hub", lifespan=lifespan)
app.mount("/media", StaticFiles(directory=ROOT / "media"), name="media")


def _iso(minutes_ago: int = 0) -> str:
    return (hub_now() - timedelta(minutes=minutes_ago)).isoformat(timespec="seconds")


def _family(fid: str) -> dict:
    return next(m for m in hh.FAMILY if m["id"] == fid)


class Hub:
    """Everything the demo household has, in memory; restart the hub to reset."""

    def __init__(self) -> None:
        self.events: list[dict] = []
        self.cond = asyncio.Condition()
        self.sessions: dict[str, Session] = {}
        self.lang = "en"
        self.data = DATA / "household.json"
        saved = json.loads(self.data.read_text()) if self.data.exists() else {}
        # The routine log: 14 invented demo days on first run, then each real day the TV records.
        self.log: list[dict] = saved.get("log") or hh.routine_log(today=hub_now().date())
        today = self._today_entry()
        self.today: dict = {"tv_on": today.get("tv_on"), "checkin": today.get("checkin")}
        self.doses: dict[str, dict] = {m["id"]: {"status": "due", "at": None} for m in hh.MEDICINES}
        self.messages = [
            {
                "id": f"m{i}",
                "from": p["from"],
                "from_name": _family(p["from"])["name"],
                "text": p["text"],
                "photo": p["photo"],
                "video": p.get("video"),
                "at": _iso(p["minutes_ago"]),
                "seen": False,
            }
            for i, p in enumerate(hh.POSTCARDS)
        ]
        self.notes: list[dict] = saved.get("notes", [])
        self.timeline: list[dict] = []

    def _today_entry(self) -> dict:
        day = hub_now().date()
        for entry in self.log:
            if entry["date"] == day.isoformat():
                return entry
        entry = {"date": day.isoformat(), "weekend": day.weekday() >= 5, "tv_on": None, "checkin": None}
        self.log.append(entry)
        return entry

    def record_today(self, key: str, hhmm: str) -> None:
        """Write today's TV-on or check-in time into the routine log and keep it on disk."""
        self._today_entry()[key] = hhmm
        self.today[key] = hhmm
        self.save()

    def save(self) -> None:
        if os.environ.get("HUB_MEMORY") == "off":
            return
        DATA.mkdir(parents=True, exist_ok=True)
        self.data.write_text(json.dumps({"log": self.log[-60:], "notes": self.notes[:20]}, ensure_ascii=False, indent=1))

    async def emit(self, kind: str, data: dict, audience: str = "all") -> dict:
        async with self.cond:
            event = {"id": len(self.events) + 1, "kind": kind, "audience": audience, "at": _iso(), "data": data}
            self.events.append(event)
            self.timeline.insert(0, event)
            self.cond.notify_all()
        return event

    def state(self) -> dict:
        routine = hh.learn_routine(self.log, now=hub_now())
        return {
            "demo_notice": hh.DEMO_NOTICE,
            "lang": self.lang,
            "parent": hh.PARENT,
            "family": hh.FAMILY,
            "medicines": [{**m, **self.doses[m["id"]]} for m in hh.MEDICINES],
            "messages": self.messages,
            "notes": self.notes,
            "routine": {**routine, "today": self.today, "log": self.log},
            "companion_live": companion.live,
            "last_event": len(self.events),
            "clock": hub_now().isoformat(timespec="seconds"),
        }


hub = Hub()
companion = Companion({"parent": hh.PARENT, "family": hh.FAMILY, "medicines": hh.MEDICINES})


@app.get("/api/state")
async def state():
    return hub.state()


@app.get("/api/events")
async def events(after: int = 0, wait: float = 20.0, audience: str = "tv"):
    """Long poll: returns events after `after`, waiting up to `wait` seconds for one."""
    wait = max(0.0, min(wait, 25.0))

    def pick():
        return [e for e in hub.events[after:] if e["audience"] in ("all", audience)]

    async with hub.cond:
        if not pick() and wait:
            try:
                await asyncio.wait_for(hub.cond.wait_for(lambda: len(hub.events) > after), timeout=wait)
            except asyncio.TimeoutError:
                pass
    return {"events": pick(), "last": len(hub.events)}


class LangIn(BaseModel):
    lang: str


@app.post("/api/lang")
async def set_lang(body: LangIn):
    if body.lang not in ("en", "ko"):
        raise HTTPException(400, "lang must be en or ko")
    hub.lang = body.lang
    return {"lang": hub.lang}


@app.post("/api/activity/tv-on")
async def tv_on():
    """The TV app reports that it came to the front: the routine's signal for today."""
    if not hub.today["tv_on"]:
        hub.record_today("tv_on", hub_now().strftime("%H:%M"))
        await hub.emit("tv_on", {"at": hub.today["tv_on"]}, audience="family")
    return hub.today


# --- The check-in conversation --------------------------------------------


class TurnIn(BaseModel):
    session: str
    text: str


@app.post("/api/checkin/start")
async def checkin_start():
    sid = uuid.uuid4().hex[:12]
    session = Session(
        id=sid,
        lang=hub.lang,
        memory=[{"at": n["at"], "body": n["body"]} for n in hub.notes[:3]],
        now=hub_now().strftime("%A %d %B %Y, %H:%M"),
    )
    hub.sessions[sid] = session
    opened = await companion.open(session)
    return {"session": sid, **opened}


@app.post("/api/checkin/turn")
async def checkin_turn(body: TurnIn):
    session = hub.sessions.get(body.session)
    if not session:
        raise HTTPException(404, "no such check-in")
    text = body.text.strip()[:400]
    if not text:
        raise HTTPException(400, "empty answer")
    result = await companion.turn(session, text)
    if result.get("emergency"):
        await hub.emit(
            "emergency",
            {"kind": result["emergency"]["kind"], "said": text, "number": result["emergency"]["number"]},
        )
    return result


class EndIn(BaseModel):
    session: str


@app.post("/api/checkin/end")
async def checkin_end(body: EndIn):
    session = hub.sessions.pop(body.session, None)
    if not session:
        raise HTTPException(404, "no such check-in")
    note = await companion.note(session)
    note.update(
        {
            "id": f"n{len(hub.notes) + 1}",
            "at": _iso(),
            "minutes": max(1, len([t for t in session.turns if t["role"] == "user"])),
            "sent_to": [m["name"] for m in hh.FAMILY],
        }
    )
    hub.notes.insert(0, note)
    hub.record_today("checkin", hub_now().strftime("%H:%M"))
    await hub.emit("note", note, audience="family")
    return note


# --- One-press buttons on the remote ---------------------------------------


@app.post("/api/ok")
async def im_ok():
    await hub.emit("ok", {"name": hh.PARENT["first"]}, audience="family")
    return {"sent_to": [m["name"] for m in hh.FAMILY]}


@app.post("/api/help")
async def help_alert():
    await hub.emit("help", {"name": hh.PARENT["first"], "number": hh.PARENT["emergency_number"]})
    return {"sent_to": [m["name"] for m in hh.FAMILY], "number": hh.PARENT["emergency_number"]}


# --- Medicines -------------------------------------------------------------


@app.post("/api/medicine/{mid}/taken")
async def taken(mid: str):
    if mid not in hub.doses:
        raise HTTPException(404, "no such medicine")
    hub.doses[mid] = {"status": "taken", "at": hub_now().strftime("%H:%M"), "reminded_at": hub.doses[mid].get("reminded_at")}
    med = next(m for m in hh.MEDICINES if m["id"] == mid)
    await hub.emit("taken", {"id": mid, "name": med["name"], "at": hub.doses[mid]["at"]}, audience="family")
    return hub.doses[mid]


@app.post("/api/medicine/{mid}/snooze")
async def snooze(mid: str):
    if mid not in hub.doses:
        raise HTTPException(404, "no such medicine")
    hub.doses[mid] = {"status": "snoozed", "at": (hub_now() + timedelta(minutes=hh.SNOOZE_MINUTES)).strftime("%H:%M")}
    return hub.doses[mid]


@app.post("/api/demo/remind/{mid}")
async def demo_remind(mid: str):
    """Fires a medicine reminder now. In the product the hub's clock fires it at the set time."""
    med = next((m for m in hh.MEDICINES if m["id"] == mid), None)
    if not med:
        raise HTTPException(404, "no such medicine")
    hub.doses[mid] = {"status": "due", "at": None, "reminded_at": hub_now().isoformat(timespec="seconds")}
    await hub.emit("reminder", med, audience="tv")
    return med


async def routine_watch():
    """Once a day, a gentle note to the family if the TV stays off past the learned hour."""
    sent_for = None
    while True:
        now = hub_now()
        note = hh.quiet_tv_note(hh.learn_routine(hub.log, now=now), hub.today["tv_on"], now)
        if note and sent_for != now.date():
            sent_for = now.date()
            await hub.emit("quiet", note, audience="family")
        await asyncio.sleep(30)


async def reminder_clock():
    """Fires each medicine reminder at its time and again after a snooze; tells the family about a missed dose."""
    while True:
        now = hub_now()
        for action, mid in hh.reminder_actions(hh.MEDICINES, hub.doses, now):
            med = next(m for m in hh.MEDICINES if m["id"] == mid)
            if action == "remind":
                hub.doses[mid].update({"status": "due", "reminded_at": now.isoformat(timespec="seconds")})
                await hub.emit("reminder", med, audience="tv")
            else:
                hub.doses[mid]["missed_sent"] = True
                await hub.emit("missed", {"id": mid, "name": med["name"], "time": med["time"]}, audience="family")
        await asyncio.sleep(20)




# --- The family channel ----------------------------------------------------


class MessageIn(BaseModel):
    sender: str = "jiwoo"
    text: str
    photo: str | None = None


@app.post("/api/family/message")
async def family_message(body: MessageIn):
    if body.sender not in {m["id"] for m in hh.FAMILY}:
        raise HTTPException(400, "unknown family member")
    text = body.text.strip()[:280]
    if not text:
        raise HTTPException(400, "empty message")
    photo = body.photo if body.photo and body.photo.startswith("/media/") else None
    msg = {
        "id": f"m{len(hub.messages) + 1}",
        "from": body.sender,
        "from_name": _family(body.sender)["name"],
        "text": text,
        "photo": photo,
        "at": _iso(),
        "seen": False,
    }
    hub.messages.insert(0, msg)
    await hub.emit("message", msg, audience="tv")
    return msg


@app.post("/api/family/message/{mid}/seen")
async def message_seen(mid: str):
    for m in hub.messages:
        if m["id"] == mid and not m["seen"]:
            m["seen"] = True
            await hub.emit("seen", {"id": mid, "from_name": m["from_name"]}, audience="family")
    return {"ok": True}


# --- Voice: speech out (Piper) and speech in (faster-whisper) ---------------

_piper = None
_whisper = None


def _tts_file(text: str) -> Path:
    global _piper
    digest = hashlib.sha1(f"{VOICE.name}|{text}".encode()).hexdigest()[:20]
    path = CACHE / f"{digest}.wav"
    if path.exists():
        return path
    if _piper is None:
        from piper import PiperVoice

        _piper = PiperVoice.load(str(VOICE))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        _piper.synthesize_wav(text, wav)
    path.write_bytes(buf.getvalue())
    return path


@app.get("/api/tts")
async def tts(text: str):
    text = text.strip()[:600]
    if not text:
        raise HTTPException(400, "empty text")
    path = await asyncio.to_thread(_tts_file, text)
    # A record of what the TV was told to say and when, used to put the same audio in the demo film.
    with open(CACHE.parent / "spoken.jsonl", "a", encoding="utf-8") as log:
        log.write(json.dumps({"t": time.time(), "file": path.name, "text": text}) + "\n")
    return FileResponse(path, media_type="audio/wav")


@app.post("/api/asr")
async def asr(audio: UploadFile):
    global _whisper
    data = await audio.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "recording too long")

    def run() -> str:
        global _whisper
        if _whisper is None:
            from faster_whisper import WhisperModel

            _whisper = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device=os.environ.get("WHISPER_DEVICE", "cpu"), compute_type="int8")
        segments, _ = _whisper.transcribe(io.BytesIO(data), language=None if hub.lang == "ko" else "en", vad_filter=True)
        return " ".join(s.text.strip() for s in segments).strip()

    text = await asyncio.to_thread(run)
    return {"text": text}


# --- Pages -----------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
@app.get("/family", response_class=HTMLResponse)
async def family_page():
    return HTMLResponse((ROOT / "family" / "index.html").read_text(encoding="utf-8"))


@app.get("/healthz")
async def healthz():
    return {"ok": True, "companion": "model" if companion.live else "scripted", "time": time.time()}


@app.middleware("http")
async def cap_body(request: Request, call_next):
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > MAX_UPLOAD:
        return JSONResponse({"detail": "request too large"}, status_code=413)
    return await call_next(request)
