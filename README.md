# Chingu Care AI on Fire TV

The parent's TV becomes the care hub. An older parent who lives alone talks with an AI companion on the big screen each morning, answers with their voice or the remote, gets medicine reminders that pause the video they are watching in the app and resume it when they confirm, sees photo and video postcards from their children, and can tell the family "I'm OK" or ask for help with one button. After each check-in the family gets a short note, written by AI, on their phone.

Built for the Build, Ship, Shape: Amazon Developer Hackathon, Fire TV track. MIT licence. Chingu Care AI is an Ebenworks product.

**Demo film (2:45):** https://youtu.be/vptvcwrCX3A · **Open-source kit:** [tv-care-kit](https://gitlab.com/ebenworks-systems/tv-care-kit) · **Friction log:** [docs/FRICTION-LOG.md](docs/FRICTION-LOG.md)

| For judges | Where to see it |
| --- | --- |
| Voice, D-pad and visuals in one flow | Film 0:00 to 1:07 (the remote moves focus from 0:02, each key captioned); `src/screens/CheckIn.tsx` |
| Adapts to the household | "Your usual time" from a routine learned from 14 days of TV-on times, a median, not a model (film 0:12); answers the AI writes for each moment (0:42); the family sees today against the usual morning (1:07); the next check-in follows up on the knee (1:39). Code: `hub/household.py`, `hub/companion.py` |
| Reminders that pause and resume | Film 1:15 to 1:32; [tv-care-kit](https://gitlab.com/ebenworks-systems/tv-care-kit) `src/interrupt.ts` |
| Safety | Every sentence checked by a phrase table and a second model (film 1:48, `hub/companion.py`) |
| TV design for older viewers | 18 dp type floor, three text sizes, visible focus, focus that returns after a reminder, Back towards home, English and Korean switched live (film 2:14) |
| Tests and one-command run | `npm test` (12 hub tests; the kit's 21 tests run in its own repository and its CI), `./run-demo.sh` |

![Home screen on an Android TV emulator: greeting, today's check-in, I'm OK and Help, family postcards and medicines](docs/screens/home.png)

## Run it

You need Node.js 20+, Python 3.11+, JDK 17 or newer, the Android SDK with `ANDROID_HOME` set and its platform-tools (`adb`) on your path, and either an Android TV emulator or a Fire TV with ADB debugging on. The first build takes several minutes; `ARCHS=x86_64` (or `x86` for an API 30 TV image) builds only the emulator's ABI.

```bash
./run-demo.sh
```

That one command starts the care hub, builds the release app, installs it on the first device `adb` sees and opens it. The family's phone page is then at http://localhost:8797/family.

- Without a model the hub's scripted companion answers, so the app works with no keys.
- With a model: `LLM_BASE_URL=https://your-endpoint LLM_API_KEY=... LLM_MODEL=... ./run-demo.sh` (any OpenAI-compatible `/v1/chat/completions`; `LLM_CHECK_MODEL` sets a smaller model for the emergency check).
- On a Fire TV: `adb connect <tv-ip>:5555`, then `HUB_URL=http://<this-computer-ip>:8797 ./run-demo.sh`. The hub then listens on the home network; it has no sign-in in this demo, so run it only on a network you trust. (The product's phone apps sign in through Ebenworks' Accounts Hub.)
- `DEMO_START=08:52` starts the household's clock at 8:52 am, so the 9:00 medicine reminder fires a few minutes in. `curl -X POST localhost:8797/api/demo/remind/bp` fires it at once.

To create the emulator we used: Android Studio's SDK Manager, system image "Android TV Intel x86 Atom, API 30" (Android 11, the version Fire OS 8 is built on), device profile "Television (1080p)". Development with live reload: `npm start` in one terminal and `npm run android` in another.

## What the parent does

| On the TV | How |
| --- | --- |
| Morning check-in | Press OK on "Today's check-in". The companion says "Hello, this is your AI companion." and asks one question at a time, aloud and in large type. Answer by voice (press OK on Speak, talk, press OK again) or pick one of three answers the AI suggests for this moment with the D-pad. |
| Medicine | At the set time a reminder covers the screen and pauses the video playing in the app. "I took it" resumes the video and tells the family; "In 10 minutes" asks again ten minutes later; no answer for 30 minutes tells the family. |
| Family postcards | Photos and video postcards from the children, newest first. A new one appears as a notice wherever the parent is. |
| I'm OK | One press tells every family member, with the time. |
| Help | Press for a confirmation, or hold OK for 2 seconds to send at once. The screen says the button does not call emergency services and names 911. |
| Text size and language | Three text sizes; English or Korean on screen (the companion's voice is English only for now). |

| Answering by voice | A reminder that paused a video | Korean |
| --- | --- | --- |
| ![The parent's spoken answer, transcribed, and the companion's reply](docs/screens/check-in-voice.png) | ![Medicine reminder over a paused video postcard](docs/screens/reminder.png) | ![Home screen in Korean](docs/screens/korean.png) |

Every sentence the parent says is checked for an emergency: a phrase table runs first and a second model checks the sentence beside it. If either finds one, the companion says "Please call 911 right now. I can't make the call for you." and the alert appears on the family's phone page. Chingu Care AI is not a medical device and does not replace 911.

## What the family sees

The hub serves a phone page for the adult child: the note after each check-in (a paraphrase, never the conversation; only an emergency alert quotes the sentence that raised it), I'm OK, Help and emergency alerts, doses taken, when the TV came on compared with the household's usual morning, and a box to send a postcard to the TV.

![Family phone page at 390 px](docs/screens/family-phone.png)

## How it works

![Architecture: Fire TV app, care hub, language model, family phone](docs/architecture.png)

- **Fire TV app** (`App.tsx`, `src/`): React Native for TV through [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) 0.88 on Expo SDK 58, prebuilt for Android TV and Fire OS with `@react-native-tvos/config-tv` (leanback launcher, 320×180 banner, no touchscreen, app backup off). Focus is handled with `hasTVPreferredFocus`, `TVFocusGuideView` (rows that remember focus, dialogs that trap it) and focus that returns to the control the parent was using after a reminder or dialog. The Back button always goes one step towards home. Chingu Care AI's voice is played with `expo-audio`; the parent's answers are recorded with `expo-audio` and transcribed on the hub, and when the TV has no microphone the app may use, Speak gives way to the suggested answers. New lines and reminders are announced to the TV's screen reader (`accessibilityLiveRegion`, `announceForAccessibility`); we have not yet tried this with VoiceView on Fire TV hardware. Postcards play with `expo-video`.
- **Care hub** (`hub/`): one FastAPI file. It runs the conversation (`companion.py`), the emergency check, the family note, the medicine clock (reminders, the snooze, a missed-dose note after 30 minutes), the routine learner (`household.py`), the household's memory (`hub/.data/`, the routine and the last notes, kept between restarts) and an event stream the TV and the family page long-poll. Speech out uses [Piper](https://github.com/rhasspy/piper) with the public-domain LJSpeech voice; speech in uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper). Both run on the hub's own computer.
- **Routine learner and memory**: the TV tells the hub when it comes to the front each day, and each day's TV-on and check-in times are written to the household's log. From the last 14 days before today, weekdays and weekends apart, the hub takes the median TV-on time and the usual gap to the check-in. It shows the family today's time against that, marks the check-in card "Your usual time" when the parent is near it, and sends the family a gentle note once a day if the TV stays off 90 minutes past the latest morning it has seen. The demo starts from 14 invented days; real days replace them as they come. The companion also reads the last three family notes, so the next check-in follows up ("How is your knee now?").
- **tv-care-kit**: the reusable part, a separate MIT project at [gitlab.com/ebenworks-systems/tv-care-kit](https://gitlab.com/ebenworks-systems/tv-care-kit), installed from its v0.1.2 release. Focus you can see from the sofa, a 10-foot type scale with an 18 dp floor, and the interrupt-and-resume state machine behind the medicine reminder.

## Tests

```bash
npm test          # 12 hub tests (pytest); the kit's 21 tests run in its repository with `npm test`
npx tsc --noEmit  # type check
```

The hub tests run without a model: the routine learner, today's entry in the log, the quiet-TV note, the medicine clock (reminder, snooze, missed dose, a new day's doses), the memory of earlier notes, the emergency phrase table in English and Korean, a full check-in, an emergency reaching the family, a postcard reaching the TV, the Korean voice rule and input checks.

## Before and after the hackathon

Chingu Care AI existed before the submission window: it was built from March 2026, tested and piloted with users from March 2026, and launched on 20 October 2026 as phone apps for the parent and the family (Android on Google Play) with an AI check-in call, medicine reminders, an SOS button and a note to the family after each call.

Everything in this repository is new in the window: the TV app, the care hub, the routine learner, the family phone page, the interrupt-and-resume reminder and the tv-care-kit. It keeps the product's rules (the AI notice at the start, no diagnosis, the emergency line, a paraphrased note instead of a transcript) and its look, but shares no code with the phone apps or their backend.

## Demo data

Park Young-hee, Ji-woo, Daniel and Mina are invented, and so are their messages, medicines and 14 days of routine. The photos are generated illustrations. No real user's data is in this repository or in the film.

## Code hosting

The code is public and MIT-licensed on GitHub at https://github.com/ebenworks-systems/chingu-care-ai-fire-tv, with the same history on GitLab at https://gitlab.com/ebenworks-systems/chingu-care-ai-fire-tv.

## Licence

MIT, see [LICENSE](LICENSE). Fonts: Pretendard and Fraunces, both under the SIL Open Font License (`assets/fonts/`). Copyright 2026 Ebenworks Systems (Private) Limited.
