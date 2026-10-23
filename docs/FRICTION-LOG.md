# Friction log: Chingu Care AI on Fire TV

Every entry below happened to us while building this entry on 23 October 2026. Each lists the task, the steps, what we expected and what happened, a severity, the workaround, a suggestion and roughly how much time it cost. We worked on Ubuntu with Node.js 22.20, Expo SDK 58, react-native-tvos 0.88 and the Android emulator 36.6. Times and versions were read off the machine; error text is quoted as it appeared. The first five entries are about Amazon Devices Builder Tools for AI, which we tried against this app in a clean, separate folder.

## 1. Builder Tools lists every Vega document when asked for Fire OS

- Task attempted: list the Fire OS documents with Amazon Devices Builder Tools' MCP server (`@amazon-devices/amazon-devices-buildertools-mcp` 1.0.18).
- Steps taken: called `set_project_context` with `fire_os`, then `list_documents` for `fire_os`, then for `vega_os`.
- Expected: a Fire OS subset.
- Actual: both calls returned the same 587 documents (124,461 characters each); 355 of them have "vega" or "kepler" in the name. Search did filter by platform.
- Severity: Major. An agent's context fills with documents for the wrong platform.
- Workaround: read the `fos_*` documents by name.
- Suggestion: apply the platform filter to `list_documents` and paginate it.
- Time lost: a few minutes inside a 13-minute trial of the tools.

## 2. A document read fails without naming the bad field, and the README lists fewer tools than the server

- Task attempted: read a document the way `fire_os_get_started.md` describes.
- Steps taken: called `read_document` with `document_name` and `target_platform`.
- Expected: the document.
- Actual: "Invalid arguments provided for tool read_document", with no field named. Every tool first answers `PROJECT_CONTEXT_REQUIRED`, but the README lists 7 tools and 12 prompts and never mentions `set_project_context`; the server offers 9 tools and 13 prompts.
- Severity: Major. Our first call failed and the error did not say why.
- Workaround: read the input schemas from `tools/list`.
- Suggestion: generate the README from the server's schemas, and name the rejected field in the error.
- Time lost: one failed call and the time to read the schemas, a few minutes.

## 3. "View content only" setup writes to the home folder and cleanup leaves it

- Task attempted: preview the setup without installing anything.
- Steps taken: `npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent other --force -p <folder>`.
- Expected: content printed or written only to the folder we gave.
- Actual: the `-p` folder was not used for skills; 21 skill folders were written to `~/.agents/skills`, and the installer ran `git clone https://github.com/AmazonAppDev/devices-agent-skills.git` without saying so. `clean-context` then reported "Nothing to remove" and the skills stayed. The command's help says `clean-context` removes skills; the README says it does not.
- Severity: Major for teams that keep agent configuration under review.
- Workaround: run the installer with `HOME` pointed at a scratch folder.
- Suggestion: make "view only" write nothing, add an option for the skills folder, say before cloning, and make `clean-context` match its help text.
- Time lost: about 10 minutes to find what it had written and to repeat the run in a scratch home folder.

## 4. Non-interactive install skips the project-identifier consent question

- Task attempted: non-interactive install for Claude Code.
- Steps taken: `init-context --agent claude-code-cli --force -m`.
- Expected: the same choice the interactive mode offers about sharing a project identifier.
- Actual: it wrote `.adbt-config.json` with `"identifier": "chingu-care-ai-fire-tv"` without asking. We did not see it sent anywhere; the telemetry client did not start in our isolated home folder.
- Severity: Minor.
- Workaround: delete the file.
- Suggestion: treat `--force` as declining, or print a notice.
- Time lost: a couple of minutes.

## 5. Platform detection does not recognise a React Native for TV app as Fire OS

- Task attempted: let the agent detect the platform of this app.
- Steps taken: ran the documented detection rules and the `detect_vega_app_type.sh` asset on a copy of the app.
- Expected: Fire OS.
- Actual: the rules look for `build.gradle` in the project root, but React Native keeps it under `android/`, so the agent has to ask. The script classed the app as "vegascript (gate A, exit 0)".
- Severity: Minor.
- Workaround: an `.adbt-config.json` with `"platform": {"default": "fire_os"}`.
- Suggestion: also look in `android/` and for the `react-native-tvos` alias in `package.json`.
- Time lost: a couple of minutes.

## 6. No Fire OS system image to test against

- Task attempted: run the app on a Fire OS emulator before recording the demo.
- Steps taken: listed system images with `sdkmanager --list`.
- Expected: a Fire OS image, or a pointer to one.
- Actual: only Google's Android TV and Google TV images are listed. We used "Android TV Intel x86 Atom System Image", API 30, the Android version Fire OS 8 is built on, as the hackathon FAQ allows.
- Severity: Minor for the hackathon, Major for a real release: the Fire TV launcher, VoiceView and the remote's Alexa button cannot be tried without hardware.
- Workaround: the Android TV image, with Fire OS differences checked in the documentation.
- Suggestion: publish an x86_64 Fire OS emulator image in the SDK Manager, or a Fire OS profile for the Android TV image.
- Time lost: about 5 minutes searching; the larger cost is what we could not test.

## 7. The Android TV emulator has no speech engine and, here, no microphone

- Task attempted: have the TV speak the companion's lines and hear the parent's answers in the emulator.
- Steps taken: checked `settings get secure tts_default_synth` (null; no speech engine installed) and read the emulator log, which said "Could not init `pa' audio driver", so the emulator had no host sound device to listen through.
- Expected: speech out and a microphone, as on a Fire TV with VoiceView and a voice remote.
- Actual: neither worked in the emulator.
- Severity: Major for any voice-first TV app.
- Workaround: the care hub makes speech with Piper and the TV plays it; for the film we started the emulator with `-grpc 8566` and streamed the parent's recorded answer into the virtual microphone with the emulator's `injectAudio` call. The app records and the hub transcribes exactly as it would on a device.
- Suggestion: ship a speech engine in the TV images and document `injectAudio` next to the TV emulator instructions.
- Time lost: about an hour in total, most of it building the audio-injection path for the film.

## 8. A prerelease React Native for TV version breaks npm peer ranges

- Task attempted: `npx expo install` after switching `react-native` to `npm:react-native-tvos@0.88.0-0`.
- Steps taken: installed `@react-native-async-storage/async-storage` and `@react-native-tvos/config-tv`.
- Expected: a normal install.
- Actual: `ERESOLVE`: "peer react-native@\"^0.0.0-0 || >=0.65 <1.0\" from @react-native-async-storage/async-storage@2.2.0", because `0.88.0-0` is a prerelease version to npm.
- Severity: Minor.
- Workaround: `legacy-peer-deps=true` in `.npmrc`.
- Suggestion: publish TV releases as `0.88.0-tv.0`-style versions that satisfy ranges, or note the `.npmrc` line in the TV setup guides.
- Time lost: about 5 minutes.

## 9. Expo's fetch rejects React Native's file upload form

- Task attempted: upload the parent's recorded answer from the TV to the hub.
- Steps taken: `FormData` with `{ uri, name, type }` sent with `fetch`, in a release build.
- Expected: the upload, as in older React Native.
- Actual: "Unsupported FormDataPart implementation".
- Severity: Major until found: voice answers failed silently on the device.
- Workaround: `XMLHttpRequest` for that one upload (`src/api.ts`).
- Suggestion: support React Native's file parts in Expo's fetch, or name the alternative in the error.
- Time lost: about 15 minutes, because the first failure showed only our own fallback message.
