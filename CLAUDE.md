# CLAUDE.md: Chingu Care AI on Fire TV (hackathon build)

Working instructions for this repository.

## What this is

A Fire TV (Fire OS and Android TV) app for Chingu Care AI, built for the Build, Ship, Shape: Amazon Developer Hackathon (Fire TV track, Open Source mini challenge): the parent's TV becomes the care hub. It is new code and holds no Chingu Care AI product code. README.md explains it for readers; the Devpost texts are kept outside the repository in `submission/` (ignored).

## Run and test

- `./run-demo.sh` starts the hub, builds the release app and installs it on the first adb device. Without `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` the hub's scripted companion answers.
- Development: the hub with `cd hub && .venv/bin/uvicorn server:app --port 8797`, Metro with `npm start`, the app with `npm run android` (needs `adb reverse tcp:8797 tcp:8797`).
- `npm test` runs the hub tests (pytest); the kit's tests run in the tv-care-kit repository. `npx tsc --noEmit` type-checks. Run both before each commit.
- The emulator is our own Android TV AVD (API 30, the Android version Fire OS 8 is built on), started headless with `-grpc 8566` when the film needs the microphone. Never use the emulator named Chingu or the serial emulator-5554.
- The film: `tools/video/murf.py` (Murf takes), `tools/video/record.cjs` (one take of the TV and the family page), `tools/video/inject_mic.py` (the parent's answers into the emulator's microphone), `tools/video/slides.py`, `tools/video/compose.py`. Films are not committed.

## Rules for this code

- The kit comes from https://gitlab.com/ebenworks-systems/tv-care-kit as a release tarball (`package.json`). Change it there, tag a release, then bump the version here; never copy its files in.
- The model only talks. The emergency check runs a phrase table beside a second model call, and the family note is a paraphrase, never a transcript. Keep the AI notice ("Hello, this is your AI companion.") at the start of every check-in.
- Never claim Chingu Care AI is a medical device or replaces 911; the emergency screens say so.
- The demo household, its people, messages, medicines and routine are invented. Never put a real user, family or figure into the demo, the tests or the film.
- No keys in code, tests, logs or commits. The TV app never holds a model key; the hub does.
- Light theme only. Write Chingu Care AI in full on every surface; the companion does not give itself a name.
- Check the TV at 1920×1080 on the emulator, and the family page at 390 px wide, after any visual change.
