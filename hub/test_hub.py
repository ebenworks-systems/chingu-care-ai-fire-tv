"""Hub tests. They run without a model: the scripted companion answers.

    .venv/bin/python -m pytest -q
"""

import os
from datetime import date, datetime

os.environ.pop("LLM_BASE_URL", None)
os.environ.pop("LLM_API_KEY", None)
os.environ.pop("NJERE_API_KEY", None)

from fastapi.testclient import TestClient  # noqa: E402

import household as hh  # noqa: E402
from companion import Companion  # noqa: E402
from server import app  # noqa: E402

client = TestClient(app)


def test_routine_learns_weekday_and_weekend_mornings():
    log = hh.routine_log(days=14, today=date(2026, 10, 23))
    weekday = hh.learn_routine(log, now=datetime(2026, 10, 23, 8, 0))  # a Friday
    weekend = hh.learn_routine(log, now=datetime(2026, 10, 24, 8, 0))  # a Saturday
    assert weekday["days_learned"] == 14
    assert "07:25" <= weekday["usual_tv_on"] <= "07:55"
    assert "08:15" <= weekend["usual_tv_on"] <= "08:45"
    assert weekday["usual_checkin"] > weekday["usual_tv_on"]
    assert weekday["quiet_after"] > weekday["usual_tv_on"]


def test_phrase_table_flags_emergencies_in_english_and_korean():
    assert Companion.phrase_score("I have chest pain")[0] >= 3
    assert Companion.phrase_score("I fell and can't get up")[0] >= 3
    assert Companion.phrase_score("가슴이 너무 아파요")[0] >= 3
    assert Companion.phrase_score("I feel a bit dizzy")[0] == 2
    assert Companion.phrase_score("I slept well and had rice")[0] == 0


def test_check_in_runs_end_to_end_without_a_model():
    start = client.post("/api/checkin/start").json()
    assert start["notice"] == "Hello, this is your AI companion."
    assert start["source"] == "scripted" and len(start["suggestions"]) == 3
    turn = client.post("/api/checkin/turn", json={"session": start["session"], "text": "I slept well"}).json()
    assert turn["emergency"] is None and turn["reply"]
    note = client.post("/api/checkin/end", json={"session": start["session"]}).json()
    assert note["ai_label"] == "Written by AI from the conversation."
    assert note["sent_to"] == ["Ji-woo", "Daniel"]


def test_emergency_names_the_number_and_reaches_the_family():
    start = client.post("/api/checkin/start").json()
    turn = client.post("/api/checkin/turn", json={"session": start["session"], "text": "I have a tight pain in my chest"}).json()
    assert turn["emergency"]["number"] == "911"
    assert turn["reply"].startswith("Please call 911 right now.")
    events = client.get("/api/events", params={"after": 0, "wait": 0, "audience": "family"}).json()["events"]
    assert any(e["kind"] == "emergency" for e in events)


def test_family_postcard_reaches_the_tv_and_taken_reaches_the_family():
    last = client.get("/api/state").json()["last_event"]
    sent = client.post("/api/family/message", json={"sender": "jiwoo", "text": "Call me after your drama?", "photo": "/media/dinner.jpg"}).json()
    tv = client.get("/api/events", params={"after": last, "wait": 0, "audience": "tv"}).json()["events"]
    assert [e["kind"] for e in tv] == ["message"] and tv[0]["data"]["id"] == sent["id"]
    client.post("/api/medicine/bp/taken")
    fam = client.get("/api/events", params={"after": last, "wait": 0, "audience": "family"}).json()["events"]
    assert [e["kind"] for e in fam] == ["taken"]


def test_inputs_are_checked():
    assert client.post("/api/family/message", json={"sender": "stranger", "text": "hi"}).status_code == 400
    assert client.post("/api/family/message", json={"sender": "jiwoo", "text": "  "}).status_code == 400
    assert client.post("/api/medicine/nope/taken").status_code == 404
    assert client.post("/api/checkin/turn", json={"session": "nope", "text": "hi"}).status_code == 404
    photo = client.post("/api/family/message", json={"sender": "jiwoo", "text": "x", "photo": "https://elsewhere.example/x.jpg"}).json()
    assert photo["photo"] is None
