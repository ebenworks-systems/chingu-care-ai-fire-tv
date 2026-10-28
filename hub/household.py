"""The demo household: invented people and data, clearly marked as such.

Nothing here belongs to a real user. The routine log is generated from a fixed
seed so every run of the demo learns the same pattern.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta
from statistics import median

DEMO_NOTICE = "Demo household. Invented people and data."

PARENT = {
    "name": "Park Young-hee",
    "first": "Young-hee",
    "first_ko": "영희",
    "age": 76,
    "city": "Los Angeles",
    "emergency_number": "911",
}

FAMILY = [
    {"id": "jiwoo", "name": "Ji-woo", "relation": "daughter", "city": "Seoul", "city_ko": "서울", "photo": "/media/people/jiwoo.webp"},
    {"id": "daniel", "name": "Daniel", "relation": "son", "city": "Seattle", "city_ko": "시애틀", "photo": "/media/people/daniel.webp"},
]

MEDICINES = [
    {"id": "bp", "name": "Blood pressure tablet", "name_ko": "혈압약", "time": "09:00", "note": "With breakfast", "note_ko": "아침 식사와 함께"},
    {"id": "vitd", "name": "Vitamin D", "name_ko": "비타민 D", "time": "13:00", "note": "After lunch", "note_ko": "점심 식사 후"},
    {"id": "night", "name": "Evening tablet", "name_ko": "저녁 약", "time": "20:00", "note": "With water", "note_ko": "물과 함께"},
]

# Family postcards already on the TV when the demo starts. Photos are generated
# illustrations stored in hub/media; no real person is shown.
POSTCARDS = [
    {
        "from": "jiwoo",
        "text": "My morning walk for you, Mom: the river path from your visit, then the persimmons.",
        "photo": "/media/river.jpg",
        "video": "/media/jiwoo-postcard.mp4",
        "minutes_ago": 35,
    },
    {
        "from": "jiwoo",
        "text": "The persimmons on Grandma's old street are ripe again. I bought some for you in my head!",
        "photo": "/media/persimmons.jpg",
        "minutes_ago": 95,
    },
    {
        "from": "daniel",
        "text": "Mina drew this for you at school today. She says it is your garden.",
        "photo": "/media/drawing.jpg",
        "minutes_ago": 400,
    },
    {
        "from": "jiwoo",
        "text": "Hangang park this morning. Walking where we used to walk.",
        "photo": "/media/river.jpg",
        "minutes_ago": 1500,
    },
]


def routine_log(days: int = 14, seed: int = 7, today: date | None = None) -> list[dict]:
    """Fourteen days of TV-on and check-in times for the demo parent.

    Weekdays the TV comes on around 07:40 for the morning news, weekends
    around 08:30; the check-in usually happens 60 to 90 minutes later.
    """
    rng = random.Random(seed)
    today = today or date.today()
    log = []
    for back in range(days, 0, -1):
        day = today - timedelta(days=back)
        weekend = day.weekday() >= 5
        base = 8 * 60 + 30 if weekend else 7 * 60 + 40
        tv_on = base + rng.randint(-12, 14)
        checkin = tv_on + rng.randint(55, 95)
        log.append(
            {
                "date": day.isoformat(),
                "weekend": weekend,
                "tv_on": f"{tv_on // 60:02d}:{tv_on % 60:02d}",
                "checkin": f"{checkin // 60:02d}:{checkin % 60:02d}",
            }
        )
    return log


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _hhmm(minutes: float) -> str:
    minutes = int(round(minutes))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def learn_routine(log: list[dict], now: datetime | None = None) -> dict:
    """Learn the household's usual morning from the TV's own activity log.

    Returns the usual TV-on time and check-in time for today's kind of day
    (weekday or weekend), and the time after which a quiet TV becomes a
    gentle note to the family: the latest TV-on time seen plus 90 minutes.
    """
    now = now or datetime.now()
    weekend = now.weekday() >= 5
    # Learn from the last 14 days before today; today is what gets compared with them.
    past = [d for d in log if d["date"] < now.date().isoformat() and d.get("tv_on")][-14:] or log
    log = past
    same = [d for d in log if d["weekend"] == weekend] or log
    on = [_minutes(d["tv_on"]) for d in same]
    chk = [_minutes(d["checkin"]) - _minutes(d["tv_on"]) for d in same if d.get("checkin")] or [75]
    usual_on = median(on)
    return {
        "days_learned": len(log),
        "kind_of_day": "weekend" if weekend else "weekday",
        "usual_tv_on": _hhmm(usual_on),
        "usual_checkin": _hhmm(usual_on + median(chk)),
        "quiet_after": _hhmm(max(on) + 90),
    }


def quiet_tv_note(routine: dict, tv_on_today: str | None, now: datetime) -> dict | None:
    """The gentle note for the family when the TV has stayed off past the learned hour.

    Returns None while the TV has come on today or the hour has not passed yet.
    """
    if tv_on_today or now.strftime("%H:%M") < routine["quiet_after"]:
        return None
    return {"usual_tv_on": routine["usual_tv_on"], "quiet_after": routine["quiet_after"], "days_learned": routine["days_learned"]}


SNOOZE_MINUTES = 10
MISSED_AFTER_MINUTES = 30  # as in Chingu Care AI's phone apps: no answer in 30 minutes tells the family


def reminder_actions(medicines: list[dict], doses: dict[str, dict], now: datetime) -> list[tuple[str, str]]:
    """What the medicine clock does at `now`: ("remind", id) or ("missed", id).

    A dose is reminded at its set time and again when a snooze ends; if a reminder
    goes unanswered for MISSED_AFTER_MINUTES the family is told once.
    """
    hhmm = now.strftime("%H:%M")
    actions = []
    for med in medicines:
        dose = doses[med["id"]]
        if dose["status"] == "taken":
            continue
        if dose["status"] == "due" and not dose.get("reminded_at") and med["time"] <= hhmm:
            actions.append(("remind", med["id"]))
        elif dose["status"] == "snoozed" and dose["at"] and dose["at"] <= hhmm:
            actions.append(("remind", med["id"]))
        elif dose.get("reminded_at") and not dose.get("missed_sent"):
            asked = datetime.fromisoformat(dose["reminded_at"])
            if (now - asked).total_seconds() >= MISSED_AFTER_MINUTES * 60:
                actions.append(("missed", med["id"]))
    return actions
