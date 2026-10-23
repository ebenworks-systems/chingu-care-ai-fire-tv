#!/usr/bin/env node
// Records the demo film's raw footage in one take: the TV screen (adb screenrecord on the
// Android TV emulator), the family's phone page (headless Chrome at 390 px, screenshots),
// and a log of every step, so compose.py can lay narration, Chingu Care AI's voice and the
// parent's voice on the right moments.
//
//   SERIAL=emulator-5560 HUB=http://localhost:8797 node tools/video/record.cjs
//
// Needs: the hub running (REMINDER_CLOCK=off, a fresh start), the release app open on the
// emulator's home screen, the emulator started with -grpc 8566 (for the microphone), and
// playwright-core (npm i --no-save playwright-core) with Google Chrome installed.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const WORK = path.join(__dirname, "work", "raw");
const SERIAL = process.env.SERIAL || "emulator-5560";
const HUB = process.env.HUB || "http://localhost:8797";
const PY = process.env.INJECT_PYTHON || "python3";
const LENGTHS = JSON.parse(fs.readFileSync(path.join(__dirname, "work", "narration", "lengths.json"), "utf8"));
const SPOKEN = path.join(ROOT, "hub", ".cache", "spoken.jsonl");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(WORK, "phone"), { recursive: true });

const events = [];
const now = () => Date.now() / 1000;
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const mark = (kind, data = {}) => {
  events.push({ t: now(), kind, ...data });
  console.log(`${(now() - events[0]?.t || 0).toFixed(1).padStart(6)}  ${kind} ${JSON.stringify(data)}`);
};
const adb = (...args) => execFileSync("adb", ["-s", SERIAL, ...args], { encoding: "utf8" });
const KEYS = { up: 19, down: 20, left: 21, right: 22, ok: 23, back: 4 };
async function key(...names) {
  for (const n of names) {
    adb("shell", "input", "keyevent", String(KEYS[n]));
    mark("key", { key: n });
    await sleep(0.7);
  }
}
async function narrate(id, extra = 0.5) {
  mark("narration", { id });
  await sleep(LENGTHS[id] + extra);
}
const spokenCount = () => (fs.existsSync(SPOKEN) ? fs.readFileSync(SPOKEN, "utf8").trim().split("\n").filter(Boolean).length : 0);
// Wait for the TV to ask the hub for a new spoken line, then for it to finish playing.
async function waitSpoken(before, timeout = 30) {
  const start = now();
  while (now() - start < timeout) {
    const lines = fs.existsSync(SPOKEN) ? fs.readFileSync(SPOKEN, "utf8").trim().split("\n").filter(Boolean) : [];
    if (lines.length > before) {
      const line = JSON.parse(lines[lines.length - 1]);
      const wav = path.join(ROOT, "hub", ".cache", "tts", line.file);
      const secs = (fs.statSync(wav).size - 44) / (22050 * 2);
      mark("spoken", { text: line.text, file: line.file, at: line.t, secs: +secs.toFixed(2) });
      const left = line.t + 0.4 + secs - now();
      if (left > 0) await sleep(left);
      return;
    }
    await sleep(0.2);
  }
  mark("spoken-timeout");
}
async function speakIntoMic(id) {
  const wav = path.join(__dirname, "work", "parent", `${id}.wav`);
  mark("parent-voice", { id, lead: 0.3 });
  execFileSync(PY, [path.join(__dirname, "inject_mic.py"), wav], { stdio: "inherit" });
}
const post = (p, body) => fetch(HUB + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

(async () => {
  // The family's phone: Ji-woo's page, captured four times a second.
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome", headless: true });
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.goto(HUB + "/family");
  await phone.waitForTimeout(1500);
  let capturing = true;
  (async () => {
    while (capturing) {
      const t = now();
      try {
        await phone.screenshot({ path: path.join(WORK, "phone", `${t.toFixed(3)}.jpg`), type: "jpeg", quality: 88 });
      } catch {}
      const wait = 0.25 - (now() - t);
      if (wait > 0) await sleep(wait);
    }
  })();

  // The TV: screenrecord stops itself after 180 s, so record back-to-back segments.
  const segs = [];
  let recording = true;
  const startSeg = () => {
    const file = `/sdcard/film${segs.length}.mp4`;
    const p = spawn("adb", ["-s", SERIAL, "shell", "screenrecord", "--size", "1920x1080", "--bit-rate", "16000000", "--time-limit", "170", file]);
    segs.push(file);
    mark("tv-record-start", { seg: segs.length - 1 });
    p.on("exit", () => recording && startSeg());
  };
  startSeg();
  await sleep(1.5);

  // 1. Home: the demo household.
  mark("scene", { name: "home" });
  await narrate("n01", 0.6);
  await narrate("n02", 0.6);

  // 2. Check-in by voice.
  await narrate("n03", 0.2);
  let n = spokenCount();
  await key("ok");
  mark("scene", { name: "checkin" });
  await waitSpoken(n);
  await narrate("n04", 0.2);
  await key("ok");
  await sleep(0.8);
  n = spokenCount();
  await speakIntoMic("parent-sleep");
  await sleep(0.2);
  await key("ok");
  await waitSpoken(n, 40);

  // 3. An AI-suggested answer with the D-pad.
  await narrate("n05", 0.2);
  n = spokenCount();
  await key("down");
  await sleep(0.5);
  await key("ok");
  await waitSpoken(n, 40);

  // 4. Finish: the family note.
  await key("down", "down", "down", "down");
  await key("ok");
  await sleep(2.6);
  mark("scene", { name: "note" });
  await narrate("n06", 0.4);
  mark("scene", { name: "split-note" });
  await narrate("n07", 1.0);

  // 5. Postcards and the medicine reminder.
  await key("ok"); // Back to home
  await sleep(1.0);
  await key("right", "ok"); // From your family
  await sleep(1.5);
  await key("ok"); // the video postcard
  mark("scene", { name: "postcard" });
  await sleep(0.5);
  await narrate("n08", 2.0);
  n = spokenCount();
  await post("/api/demo/remind/bp");
  mark("reminder");
  await waitSpoken(n);
  await narrate("n09", 0.6);
  await key("ok"); // I took it
  mark("scene", { name: "split-taken" });
  await narrate("n10", 0.8);

  // 6. Ji-woo writes back from her phone.
  await phone.click("#go");
  mark("phone-send");
  await narrate("n11", 2.5);
  await phone.evaluate(() => window.scrollTo(0, 0));

  // 7. The emergency check.
  await key("back"); // postcard -> list
  await sleep(0.8);
  await key("back"); // list -> home
  await sleep(1.2);
  await key("left"); // Today's check-in
  n = spokenCount();
  await key("ok");
  mark("scene", { name: "checkin-2" });
  await waitSpoken(n);
  await narrate("n12", 0.2);
  await key("ok");
  await sleep(0.8);
  n = spokenCount();
  await speakIntoMic("parent-chest");
  await sleep(0.2);
  await key("ok");
  await waitSpoken(n, 40);
  mark("scene", { name: "split-emergency" });
  await narrate("n13", 0.8);

  await sleep(1.0);
  mark("tv-record-stop");

  recording = false;
  try {
    adb("shell", "pkill", "-INT", "screenrecord");
  } catch {} // already ended at its time limit
  await sleep(2.5);
  capturing = false;
  await sleep(0.5);
  await browser.close();
  segs.forEach((file, i) => adb("pull", file, path.join(WORK, `tv${i}.mp4`)));
  fs.writeFileSync(path.join(WORK, "events.json"), JSON.stringify(events, null, 1));
  console.log("done:", segs.length, "TV segments,", events.length, "events");
})();
