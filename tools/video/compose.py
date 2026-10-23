#!/usr/bin/env python3
"""Assembles the demo film from the raw take that record.cjs made.

    python3 tools/video/compose.py

Reads tools/video/work/raw (tv.mp4, phone/*.jpg, events.json), the hub's
spoken-line log and voice cache, the parent's and the narrator's takes and the
closing stills, and writes tools/video/work/chingu-care-ai-fire-tv-demo.mp4.

Every second of footage is real: the edit only shortens the waits while the
hub transcribes or the model answers, and the second greeting before the
emergency demonstration. Chingu Care AI's voice in the film is the exact audio
the hub sent the TV; the parent's voice is the take that was played into the
emulator's microphone.
"""
import glob
import json
import os
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
V = ROOT / "tools" / "video"
WORK = V / "work"
RAW = WORK / "raw"
OUT = WORK / "chingu-care-ai-fire-tv-demo.mp4"
TMP = Path("/tmp/chingu-tv-film")  # a path with no spaces or brackets, for ffmpeg filter graphs
FPS = 30
UI_LATENCY = 0.35  # seconds from a key press on the remote to the new screen
PLAYBACK_LATENCY = 0.45  # seconds from the TV asking for speech to the audio starting

events = json.loads((RAW / "events.json").read_text())
narr = {n["id"]: n for n in json.loads((V / "narration.json").read_text())}
nlen = json.loads((WORK / "narration" / "lengths.json").read_text())
parent_lines = {p["id"]: p for p in json.loads((V / "parent-lines.json").read_text())}


def ffprobe_duration(path) -> float:
    return float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).decode())


def run(args):
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", *map(str, args)])


def first(kind, after=0.0, **match):
    for e in events:
        if e["kind"] == kind and e["t"] >= after and all(e.get(k) == v for k, v in match.items()):
            return e
    return None


# --- 1. Where the TV video's clock sits against the wall clock ---------------------------
TMP.mkdir(exist_ok=True)
seg_starts = [e["t"] for e in events if e["kind"] == "tv-record-start"]
tv_start = seg_starts[0]
tv_cfr = TMP / "tv-cfr.mp4"
# Each screenrecord segment becomes constant frame rate; every segment but the last is held or
# trimmed to end exactly where the next began, so one clock runs through the joined video.
parts = []
for i, s0 in enumerate(seg_starts):
    part = TMP / f"tv-seg{i}.mp4"
    vf = f"fps={FPS}"
    if i + 1 < len(seg_starts):
        length = seg_starts[i + 1] - s0
        vf += f",tpad=stop_mode=clone:stop_duration=3,trim=duration={length:.3f}"
    run(["-i", RAW / f"tv{i}.mp4", "-vf", vf, "-c:v", "libx264", "-crf", "12", "-preset", "fast", "-an", part])
    parts.append(part)
with open(TMP / "tv-parts.txt", "w") as lst:
    lst.writelines(f"file '{p}'\n" for p in parts)
run(["-f", "concat", "-safe", "0", "-i", TMP / "tv-parts.txt", "-c", "copy", tv_cfr])
# The first big change on screen is the check-in opening after the first OK on the remote.
talk = first("scene", name="checkin")
showinfo = subprocess.run(["ffmpeg", "-i", str(tv_cfr), "-vf", "select='gt(scene,0.2)',showinfo", "-f", "null", "-"], capture_output=True, text=True).stderr
changes = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", showinfo)]
expected = talk["t"] - 0.7 - tv_start + UI_LATENCY  # the key event is logged after a 0.7 s pause
change = min((c for c in changes if c > 3.0), key=lambda c: abs(c - expected))
offset = change - expected  # video time = (wall - tv_start) + offset
print(f"sync: first change at {change:.2f}s, expected {expected:.2f}s, offset {offset:+.2f}s")

# --- 2. The phone, as a constant-frame-rate video ----------------------------------------
frames = sorted(glob.glob(str(RAW / "phone" / "*.jpg")), key=lambda f: float(Path(f).stem))
phone_start = float(Path(frames[0]).stem)
phone_cfr = TMP / "phone-cfr.mp4"
with open(TMP / "phone.txt", "w") as lst:
    for a, b in zip(frames, frames[1:] + [frames[-1]]):
        dur = max(0.04, float(Path(b).stem) - float(Path(a).stem)) if a != b else 0.5
        lst.write(f"file '{a}'\nduration {dur:.3f}\n")
    lst.write(f"file '{frames[-1]}'\n")
run(["-f", "concat", "-safe", "0", "-i", TMP / "phone.txt", "-vf", f"fps={FPS},scale=780:1688,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "fast", phone_cfr])

# --- 3. The edit: what to keep, in wall-clock time ---------------------------------------
spoken = [e for e in events if e["kind"] == "spoken"]
start = first("scene", name="home")["t"] - 0.3
stop = first("tv-record-stop")["t"]
cuts = []


def shorten(a, b, keep):
    """Shorten the wall-clock span a..b to `keep` seconds, cutting from its middle."""
    if b - a > keep + 0.3:
        cuts.append((a + keep / 2, b - keep / 2))


def next_spoken(after):
    return next(s for s in spoken if s["at"] > after)


# The first greeting: the model and the voice take a few seconds to answer.
s = next_spoken(talk["t"])
shorten(talk["t"] + 0.6, s["at"] + PLAYBACK_LATENCY - 0.1, 1.4)
# After each spoken answer, and after the remote answer: transcription and the model's reply.
for p in [e for e in events if e["kind"] == "parent-voice"]:
    stop_key = next(e for e in events if e["kind"] == "key" and e["t"] > p["t"])
    s = next_spoken(stop_key["t"])
    shorten(stop_key["t"] + 0.2, s["at"] + PLAYBACK_LATENCY - 0.1, 1.6)
chip_n = first("narration", id="n05")
chip_ok = next(e for e in events if e["kind"] == "key" and e["key"] == "ok" and e["t"] > chip_n["t"])
s = next_spoken(chip_ok["t"])
shorten(chip_ok["t"] + 0.2, s["at"] + PLAYBACK_LATENCY - 0.1, 1.4)
# The second check-in's greeting follows up on the morning's note: keep it, shorten the wait.
c2 = first("scene", name="checkin-2")
g2 = next_spoken(c2["t"])
shorten(c2["t"] + 0.6, g2["at"] + PLAYBACK_LATENCY - 0.1, 1.4)
muted = set()
# From the last answer to the note: focus walks down to Finish, then the note appears.
s_chip = next_spoken(chip_ok["t"])
shorten(s_chip["at"] + PLAYBACK_LATENCY + s_chip["secs"] + 0.3, first("scene", name="note")["t"] - 0.2, 3.2)
# From the family's phone back to the postcards: home, the family card, the video postcard.
n07 = first("narration", id="n07")
shorten(n07["t"] + nlen["n07"] + 0.4, first("scene", name="postcard")["t"] + 0.6, 4.2)
# The walk from Ji-woo's postcard back to the check-in: keep a glimpse of focus moving.
n11 = first("narration", id="n11")
shorten(n11["t"] + nlen["n11"] + 0.3, first("narration", id="n11b")["t"] - 0.2, 2.4)
# Any stretch with no voice longer than 2.2 s is shortened to 1.4 s: the film moves on.
voices = []
for e in events:
    if e["kind"] == "narration":
        voices.append((e["t"], e["t"] + nlen[e["id"]]))
    elif e["kind"] == "parent-voice":
        voices.append((e["t"] + e["lead"], e["t"] + e["lead"] + 3.5))
for s in spoken:
    voices.append((s["at"] + PLAYBACK_LATENCY, s["at"] + PLAYBACK_LATENCY + s["secs"]))
# Presses on the remote are kept where the film shows the remote at work: the tour of the
# home screen and the choice of a suggested answer. Elsewhere walks of focus are shortened.
showcase = [(start, first("narration", id="n02")["t"]), (chip_n["t"], chip_ok["t"] + 0.2)]
for e in events:
    if e["kind"] == "key" and any(a <= e["t"] <= b for a, b in showcase):
        voices.append((e["t"] - 0.9, e["t"] + 1.0))
voices.sort()
edge = start + 1.0
for a, b in voices:
    if a - edge > 2.2:
        shorten(edge, a, 1.4)
    edge = max(edge, b)
cuts.sort()
keep = []
cursor = start
for a, b in cuts:
    if a > cursor:
        keep.append((cursor, a))
    cursor = max(cursor, b)
keep.append((cursor, stop))


def film_time(t):
    """Wall-clock time to film time; a time inside a cut lands on the cut."""
    total = 0.0
    for a, b in keep:
        if t <= a:
            return total
        if t <= b:
            return total + (t - a)
        total += b - a
    return total


def in_keep(t):
    return any(a <= t <= b for a, b in keep)


# Layout: when the family's phone shares the screen.
def scene_t(name, default=None):
    e = first("scene", name=name)
    return e["t"] if e else default


emergency_line = next(s for s in spoken if "911" in s["text"])
split = [
    (scene_t("split-note"), scene_t("postcard") - 1.0),
    (scene_t("split-taken"), c2["t"] - 3.0),
    (emergency_line["at"] - 0.3, scene_t("korean", stop) - 2.5),
]

# --- 4. Render the pieces ----------------------------------------------------------------
CANVAS = "#FAF5EE"
FONTS = ROOT / "hub" / "media" / "fonts"
TV_BOX = (40, 190, 1232, 693)  # x, y, w, h
PH_BOX = (1312, 50, 560, 919)  # the top 640 css px of the 390 px phone page, enlarged to read
FULL_BOX = (106, 0, 1708, 960)  # the TV alone, leaving a band below for captions


def split_layers():
    """Background with labels and shadows, and a foreground that rounds the corners."""
    bg = Image.new("RGBA", (1920, 1080), CANVAS)
    d = ImageDraw.Draw(bg)
    serif = ImageFont.truetype(str(FONTS / "Fraunces_500Medium.ttf"), 40)
    semi = ImageFont.truetype(str(FONTS / "Pretendard-SemiBold.otf"), 30)
    d.text((44, 112), "Young-hee's TV", font=serif, fill="#1C3D52")
    d.text((370, 122), "Los Angeles", font=semi, fill="#5E6B72")
    d.text((PH_BOX[0] + 4, 8), "Ji-woo's phone · Seoul", font=semi, fill="#1C3D52")
    for x, y, w, h in (TV_BOX, PH_BOX):
        d.rounded_rectangle([x - 3, y - 3, x + w + 3, y + h + 3], 26, fill="#E7DCCD")
    fg = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    canvas_rgb = tuple(int(CANVAS[i : i + 2], 16) for i in (1, 3, 5))
    for (x, y, w, h), r in ((TV_BOX, 24), (PH_BOX, 36)):
        corner = Image.new("RGBA", (w, h), canvas_rgb + (255,))
        mask = Image.new("L", (w, h), 255)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=0)
        corner.putalpha(mask)
        fg.alpha_composite(corner, (x, y))
    bg.convert("RGB").save(TMP / "split-bg.png")
    fg.save(TMP / "split-fg.png")


split_layers()
pieces = []
bounds = sorted({t for a, b in keep for t in (a, b)} | {t for a, b in split for t in (a, b) if start < t < stop})
idx = 0
for a, b in zip(bounds, bounds[1:]):
    mid = (a + b) / 2
    if b - a < 0.05 or not in_keep(mid):
        continue
    is_split = any(sa <= mid <= sb for sa, sb in split)
    vt = a - tv_start + offset
    out = TMP / f"piece{idx:03d}.mp4"
    idx += 1
    if is_split:
        pt = max(0.0, a - phone_start)
        x, y, w, h = TV_BOX
        px, py, pw, ph = PH_BOX
        d = b - a
        graph = (f"[1:v]trim=start={vt:.3f}:duration={d:.3f},setpts=PTS-STARTPTS,scale={w}:{h}[tv];"
                 f"[2:v]trim=start={pt:.3f}:duration={d:.3f},setpts=PTS-STARTPTS,crop=780:1280:0:0,scale={pw}:{ph}[ph];"
                 f"[0:v][tv]overlay={x}:{y}:eof_action=repeat[s1];[s1][ph]overlay={px}:{py}:eof_action=repeat[s2];"
                 f"[s2][3:v]overlay=0:0,format=yuv420p[v]")
        run(["-loop", "1", "-t", f"{d:.3f}", "-i", TMP / "split-bg.png", "-i", tv_cfr, "-i", phone_cfr,
             "-loop", "1", "-t", f"{d:.3f}", "-i", TMP / "split-fg.png",
             "-filter_complex", graph, "-map", "[v]", "-r", FPS, "-t", f"{d:.3f}", "-c:v", "libx264", "-crf", "16", "-preset", "medium", out])
    else:
        x, y, w, h = FULL_BOX
        d = b - a
        run(["-i", tv_cfr, "-f", "lavfi", "-t", f"{d:.3f}", "-i", f"color=c={CANVAS}:s=1920x1080:r={FPS}",
             "-filter_complex", f"[0:v]trim=start={vt:.3f}:duration={d:.3f},setpts=PTS-STARTPTS,scale={w}:{h}[tv];"
             f"[1:v][tv]overlay={x}:{y}:eof_action=repeat,format=yuv420p[v]", "-map", "[v]", "-r", FPS,
             "-t", f"{d:.3f}", "-c:v", "libx264", "-crf", "16", "-preset", "medium", out])
    pieces.append(out)
body_len = film_time(stop)

# The closing stills, each held for its narration.
stills = [("s1-architecture", "n16"), ("s2-kit", "n17"), ("s3-before-after", "n18"), ("s4-end", "n19")]
still_start = {}
t_cursor = body_len
for name, nid in stills:
    dur = nlen[nid] + {"s4-end": 1.6, "s0-korean": 1.4}.get(name, 1.0)
    out = TMP / f"still-{name}.mp4"
    run(["-loop", "1", "-t", f"{dur:.3f}", "-i", WORK / "slides" / f"{name}.png",
         "-vf", f"scale=1920:1080,format=yuv420p,fade=t=in:st=0:d=0.25:color={CANVAS}", "-r", FPS, "-c:v", "libx264", "-crf", "16", "-preset", "medium", out])
    pieces.append(out)
    still_start[nid] = t_cursor + 0.35
    t_cursor += dur
total = t_cursor

with open(TMP / "pieces.txt", "w") as lst:
    lst.writelines(f"file '{p}'\n" for p in pieces)
video = TMP / "video.mp4"
run(["-f", "concat", "-safe", "0", "-i", TMP / "pieces.txt", "-c", "copy", video])

# --- 5. Sound: narration, Chingu Care AI's voice, the parent's voice ---------------------
clips = []  # (wav, film start, gain dB)
for e in events:
    if e["kind"] == "narration" and in_keep(e["t"]):
        clips.append((WORK / "narration" / f"{e['id']}.wav", film_time(e["t"]), 0.0, narr[e["id"]]["caption"], nlen[e["id"]]))
for nid, t in still_start.items():
    clips.append((WORK / "narration" / f"{nid}.wav", t, 0.0, narr[nid]["caption"], nlen[nid]))
for s in spoken:
    begin = s["at"] + PLAYBACK_LATENCY
    if s["file"] + str(s["at"]) in muted or not in_keep(begin):
        continue
    clips.append((ROOT / "hub" / ".cache" / "tts" / s["file"], film_time(begin), -2.0, None, s["secs"]))
for p in [e for e in events if e["kind"] == "parent-voice"]:
    wav = WORK / "parent" / f"{p['id']}.wav"
    line = parent_lines[p["id"]]["say"].replace("...", "…")
    clips.append((wav, film_time(p["t"] + p["lead"] + 0.15), -1.0, f"Young-hee, into the TV's microphone: “{line}”", ffprobe_duration(wav)))

inputs, graph = ["-i", video], []
for i, (wav, at, gain, _, _) in enumerate(clips, 1):
    inputs += ["-i", wav]
    ms = max(0, int(at * 1000))
    graph.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,volume={gain}dB,adelay={ms}|{ms}[a{i}]")
mix = "".join(f"[a{i}]" for i in range(1, len(clips) + 1))
graph.append(f"{mix}amix=inputs={len(clips)}:normalize=0:dropout_transition=0,apad=whole_dur={total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aud]")


# --- 6. Captions -------------------------------------------------------------------------
def stamp(t):
    h, rem = divmod(max(0.0, t), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def srt_stamp(t):
    ms = int(round(max(0.0, t) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


caps = sorted([(at, at + dur + 0.25, text) for _, at, _, text, dur in clips if text], key=lambda c: c[0])
for i in range(len(caps) - 1):  # never two captions at once
    a, b, text = caps[i]
    caps[i] = (a, min(b, caps[i + 1][0] - 0.05), text)
head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Pretendard,40,&H00523D1C,&H00523D1C,&H00FFFFFF,&H20FFFFFF,1,0,0,0,100,100,0,0,3,16,0,2,240,240,30,1
Style: Key,Pretendard,38,&H00FFFFFF,&H00FFFFFF,&H003A61C4,&H003A61C4,1,0,0,0,100,100,0,0,3,12,0,1,40,40,34,1
Style: Where,Pretendard,22,&H00726B5E,&H00726B5E,&H00EEF5FA,&H00EEF5FA,0,0,0,0,100,100,0,0,1,0,0,3,40,40,14,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
KEY_NAMES = {"ok": "OK", "up": "Up", "down": "Down", "left": "Left", "right": "Right", "back": "Back"}
keys = []
for e in events:
    if e["kind"] == "key" and in_keep(e["t"] - 0.7):
        at = film_time(e["t"] - 0.7)
        keys.append((at, at + 1.4, f"Remote · {KEY_NAMES.get(e['key'], e['key'])}"))
for i in range(len(keys) - 1):
    a, b, text = keys[i]
    keys[i] = (a, min(b, keys[i + 1][0] - 0.02), text)
(TMP / "captions.ass").write_text(
    head
    + "".join(f"Dialogue: 0,{stamp(a)},{stamp(b)},Cap,,0,0,0,,{t}\n" for a, b, t in caps)
    + "".join(f"Dialogue: 1,{stamp(a)},{stamp(b)},Key,,0,0,0,,{t}\n" for a, b, t in keys)
    + f"Dialogue: 0,{stamp(0)},{stamp(body_len)},Where,,0,0,0,,Running on an Android TV emulator · Android 11, the base of Fire OS 8\n",
    encoding="utf-8",
)
with open(OUT.with_suffix(".srt"), "w", encoding="utf-8") as srt:
    for i, (a, b, t) in enumerate(caps, 1):
        srt.write(f"{i}\n{srt_stamp(a)} --> {srt_stamp(b)}\n{t}\n\n")
fontsdir = TMP / "fonts"
fontsdir.mkdir(exist_ok=True)
for f in FONTS.glob("*.otf"):
    target = fontsdir / f.name
    if not target.exists():
        target.write_bytes(f.read_bytes())
# The sound is mixed to a file of its own first, so its length can be checked against the picture.
sound = TMP / "sound.wav"
run([*inputs, "-filter_complex", ";".join(graph), "-map", "[aud]", "-t", f"{total:.3f}", "-c:a", "pcm_s16le", sound])
if abs(ffprobe_duration(sound) - total) > 0.2:
    sys.exit(f"the sound is {ffprobe_duration(sound):.1f} s, the picture {total:.1f} s")
run(["-i", video, "-i", sound, "-filter_complex", f"[0:v]ass={TMP}/captions.ass:fontsdir={fontsdir}[vid]",
     "-map", "[vid]", "-map", "1:a", "-t", f"{total:.3f}",
     "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
     "-movflags", "+faststart", OUT])
print(f"{OUT}: {ffprobe_duration(OUT):.1f} s ({body_len:.1f} s of footage, {len(keep)} kept spans, {len(clips)} sound clips)")
