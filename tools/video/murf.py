#!/usr/bin/env python3
"""Makes speech takes with Murf for the demo film and the demo household's video postcard.

    MURF_API_KEY=... python3 tools/video/murf.py LINES.json OUT_DIR [id ...]

LINES.json is a list of {"id", "say", "voice"?, "style"?}. The default voice is
en-US-natalie, style Narration. Existing takes are kept unless named, because
Murf gives a different take on every call. Silence is trimmed at both ends and
takes are resampled to 48 kHz mono. The key is read from the environment and
never printed.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

DEFAULT_VOICE, DEFAULT_STYLE = "en-US-natalie", "Narration"


def murf(text: str, voice: str, style: str) -> bytes:
    body = {"voiceId": voice, "style": style, "text": text, "format": "WAV", "sampleRate": 24000, "channelType": "MONO", "modelVersion": "GEN2"}
    req = urllib.request.Request(
        "https://api.murf.ai/v1/speech/generate",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"api-key": os.environ["MURF_API_KEY"], "Content-Type": "application/json", "Accept": "application/json"},
    )
    for attempt in range(3):
        try:
            d = json.loads(urllib.request.urlopen(req, timeout=90).read())
            return urllib.request.urlopen(d["audioFile"], timeout=90).read()
        except urllib.error.HTTPError as e:
            if e.code < 500 or attempt == 2:
                raise SystemExit(f"Murf {e.code}")
            time.sleep(3)
    raise SystemExit("Murf failed")


def duration(path: str) -> float:
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.decode().strip())


def trimmed(src: str, dst: str) -> None:
    trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"{trim},areverse,{trim},areverse", "-ar", "48000", "-ac", "1", dst])


if __name__ == "__main__":
    lines_path, out_dir, *only = sys.argv[1:]
    lines = json.load(open(lines_path))
    os.makedirs(out_dir, exist_ok=True)
    lengths = {}
    for line in lines:
        raw = os.path.join(out_dir, f"{line['id']}.raw.wav")
        wav = os.path.join(out_dir, f"{line['id']}.wav")
        if (only and line["id"] in only) or not os.path.exists(wav):
            open(raw, "wb").write(murf(line["say"], line.get("voice", DEFAULT_VOICE), line.get("style", DEFAULT_STYLE)))
            trimmed(raw, wav)
            os.remove(raw)
        lengths[line["id"]] = round(duration(wav), 3)
        print(f"{line['id']:14} {lengths[line['id']]:6.2f} s")
    json.dump(lengths, open(os.path.join(out_dir, "lengths.json"), "w"), indent=1)
    print(f"total speech {sum(lengths.values()):.1f} s")
