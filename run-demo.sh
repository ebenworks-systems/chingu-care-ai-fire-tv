#!/usr/bin/env bash
# One command: start the care hub, build the Fire TV app and run it on a
# connected Fire TV, Android TV device or emulator.
#
#   ./run-demo.sh                      # scripted companion, no model needed
#   LLM_BASE_URL=https://... LLM_API_KEY=... LLM_MODEL=... ./run-demo.sh   # any OpenAI-compatible model
#   HUB_URL=http://192.168.1.20:8797 ./run-demo.sh                          # Fire TV on the home network
#
# Options (environment): DEVICE=<adb serial>, HUB_PORT (default 8797),
# DEMO_START=HH:MM (start the household's clock at that time), ARCHS (default all four ABIs).
set -euo pipefail
cd "$(dirname "$0")"

HUB_PORT="${HUB_PORT:-8797}"
HUB_URL="${HUB_URL:-http://localhost:$HUB_PORT}"
ARCHS="${ARCHS:-armeabi-v7a,arm64-v8a,x86,x86_64}"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

command -v adb >/dev/null || { echo "adb not found: install Android platform-tools and add them to PATH"; exit 1; }
command -v node >/dev/null || { echo "Node.js 20 or later is needed"; exit 1; }
command -v python3 >/dev/null || { echo "Python 3.11 or later is needed"; exit 1; }

DEVICE="${DEVICE:-$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')}"
[ -n "$DEVICE" ] || { echo "No device: start an Android TV emulator or connect a Fire TV (adb connect <ip>:5555)"; exit 1; }
say "Device: $DEVICE"

say "1/4 Care hub"
if [ ! -x hub/.venv/bin/python ]; then
  python3 -m venv hub/.venv
  hub/.venv/bin/pip install -q -r hub/requirements.txt
fi
hub/get-voice.sh
# The hub has no sign-in in this demo: it listens on this computer only, unless a Fire TV on the
# home network needs it (HUB_URL set to this computer's address).
HUB_HOST=127.0.0.1
case "$HUB_URL" in http://localhost*|http://127.0.0.1*) ;; *) HUB_HOST=0.0.0.0 ;; esac
(cd hub && DEMO_START="${DEMO_START:-}" nohup .venv/bin/uvicorn server:app --host "$HUB_HOST" --port "$HUB_PORT" > ../hub.log 2>&1 &)
for _ in $(seq 1 30); do curl -fs "http://localhost:$HUB_PORT/healthz" >/dev/null && break; sleep 1; done
curl -fs "http://localhost:$HUB_PORT/healthz" && echo

say "2/4 JavaScript dependencies"
[ -d node_modules ] || npm ci

say "3/4 Build the TV app (release, JavaScript bundled in)"
EXPO_TV=1 CI=1 npx expo prebuild --platform android --no-install >/dev/null
(cd android && EXPO_PUBLIC_HUB_URL="$HUB_URL" ./gradlew -q :app:assembleRelease -PreactNativeArchitectures="$ARCHS")
APK=android/app/build/outputs/apk/release/app-release.apk
# No OkHttp below 4.12.1 (or a 5.x below 5.5.1): those trust the compromised eMudhra certificates (EBE-7061).
python3 tools/check_okhttp.py "$APK" >/dev/null || { python3 tools/check_okhttp.py "$APK"; exit 1; }

say "4/4 Install and open on $DEVICE"
adb -s "$DEVICE" install -r "$APK" >/dev/null
adb -s "$DEVICE" reverse "tcp:$HUB_PORT" "tcp:$HUB_PORT" >/dev/null 2>&1 || true
adb -s "$DEVICE" shell pm grant co.ebenworks.chingucare.tv android.permission.RECORD_AUDIO >/dev/null 2>&1 || true
adb -s "$DEVICE" shell monkey -p co.ebenworks.chingucare.tv -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null

say "Running. Family page: http://localhost:$HUB_PORT/family   Hub log: hub.log"
echo "Fire a medicine reminder now: curl -X POST http://localhost:$HUB_PORT/api/demo/remind/bp"
