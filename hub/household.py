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
    {"id": "jiwoo", "name": "Ji-woo", "relation": "daughter", "city": "Seoul"},
    {"id": "daniel", "name": "Daniel", "relation": "son", "city": "Seattle"},
]

MEDICINES = [
    {"id": "bp", "name": "Blood pressure tablet", "name_ko": "혈압약", "time": "09:00", "note": "With breakfast"},
    {"id": "vitd", "name": "Vitamin D", "name_ko": "비타민 D", "time": "13:00", "note": "After lunch"},
    {"id": "night", "name": "Evening tablet", "name_ko": "저녁 약", "time": "20:00", "note": "With water"},
]

# Family postcards already on the TV when the demo starts. Photos are generated
# illustrations stored in hub/media; no real person is shown.
POSTCARDS = [
    {
        "from": "jiwoo",
        "text": "A walk by the river for you, Mom. Same path as your visit.",
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
    same = [d for d in log if d["weekend"] == weekend] or log
    on = [_minutes(d["tv_on"]) for d in same]
    chk = [_minutes(d["checkin"]) - _minutes(d["tv_on"]) for d in same]
    usual_on = median(on)
    return {
        "days_learned": len(log),
        "kind_of_day": "weekend" if weekend else "weekday",
        "usual_tv_on": _hhmm(usual_on),
        "usual_checkin": _hhmm(usual_on + median(chk)),
        "quiet_after": _hhmm(max(on) + 90),
    }
