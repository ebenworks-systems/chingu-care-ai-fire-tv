import { test } from "node:test";
import assert from "node:assert/strict";

import { initialInterruptState, interruptReducer, mediaCommands, type Interrupt, type InterruptEvent, type InterruptState } from "../src/interrupt.ts";

const medicine: Interrupt = {
  id: "med-bp",
  title: "Time for your blood pressure tablet",
  actions: [
    { id: "taken", label: "I took it" },
    { id: "later", label: "In 10 minutes" },
  ],
};
const emergency: Interrupt = { id: "help", title: "Please call 911 now", priority: 10, actions: [{ id: "close", label: "Close" }] };
const message: Interrupt = { id: "msg-1", title: "New postcard", priority: 1, actions: [{ id: "open", label: "Open" }] };

function run(events: InterruptEvent[], start: InterruptState = initialInterruptState) {
  return events.reduce(interruptReducer, start);
}

test("a reminder pauses the video that is playing and resumes it after the answer", () => {
  const playing = run([{ type: "media", media: { id: "video", playing: true } }]);
  const raised = interruptReducer(playing, { type: "raise", interrupt: medicine });
  assert.equal(raised.active?.id, "med-bp");
  assert.deepEqual(mediaCommands(playing, raised), { pause: ["video"], play: [] });

  const answered = interruptReducer(raised, { type: "answer", actionId: "taken" });
  assert.equal(answered.active, null);
  assert.deepEqual(mediaCommands(raised, answered), { pause: [], play: ["video"] });
});

test("media the viewer had paused stays paused after the reminder", () => {
  const state = run([
    { type: "media", media: { id: "video", playing: false } },
    { type: "media", media: { id: "music", playing: true } },
  ]);
  const raised = interruptReducer(state, { type: "raise", interrupt: medicine });
  assert.deepEqual(raised.pausedByUs, ["music"]);
  const answered = interruptReducer(raised, { type: "answer", actionId: "taken" });
  assert.equal(answered.media.video, false);
  assert.equal(answered.media.music, true);
});

test("an action can choose not to resume", () => {
  const raised = run([
    { type: "media", media: { id: "video", playing: true } },
    { type: "raise", interrupt: { ...medicine, actions: [{ id: "stop", label: "Stop watching", resumes: false }] } },
  ]);
  const answered = interruptReducer(raised, { type: "answer", actionId: "stop" });
  assert.equal(answered.media.video, false);
  assert.deepEqual(mediaCommands(raised, answered), { pause: [], play: [] });
});

test("a second reminder waits its turn and media stays paused until the last answer", () => {
  const second: Interrupt = { ...medicine, id: "med-vitd", title: "Time for your vitamin D" };
  let state = run([
    { type: "media", media: { id: "video", playing: true } },
    { type: "raise", interrupt: medicine },
    { type: "raise", interrupt: second },
  ]);
  assert.equal(state.active?.id, "med-bp");
  assert.equal(state.queue.length, 1);

  state = interruptReducer(state, { type: "answer", actionId: "taken" });
  assert.equal(state.active?.id, "med-vitd");
  assert.equal(state.media.video, false, "still paused while another reminder is up");

  state = interruptReducer(state, { type: "answer", actionId: "taken" });
  assert.equal(state.active, null);
  assert.equal(state.media.video, true);
});

test("a higher-priority interrupt takes over and the earlier one comes back after", () => {
  let state = run([
    { type: "raise", interrupt: message },
    { type: "raise", interrupt: emergency },
  ]);
  assert.equal(state.active?.id, "help");
  assert.deepEqual(state.queue.map((q) => q.id), ["msg-1"]);
  state = interruptReducer(state, { type: "answer", actionId: "close" });
  assert.equal(state.active?.id, "msg-1");
});

test("the same reminder raised twice shows once", () => {
  const state = run([
    { type: "raise", interrupt: medicine },
    { type: "raise", interrupt: medicine },
  ]);
  assert.equal(state.queue.length, 0);
});

test("a player that starts while a reminder is showing is paused too", () => {
  const raised = run([{ type: "raise", interrupt: medicine }]);
  const started = interruptReducer(raised, { type: "media", media: { id: "trailer", playing: true } });
  assert.equal(started.media.trailer, false);
  assert.deepEqual(started.pausedByUs, ["trailer"]);
  const answered = interruptReducer(started, { type: "answer", actionId: "taken" });
  assert.equal(answered.media.trailer, true);
});

test("a player removed during a reminder is not resumed", () => {
  const state = run([
    { type: "media", media: { id: "video", playing: true } },
    { type: "raise", interrupt: medicine },
    { type: "media-gone", id: "video" },
    { type: "answer", actionId: "taken" },
  ]);
  assert.equal("video" in state.media, false);
  assert.deepEqual(state.pausedByUs, []);
});

test("answering with nothing showing changes nothing", () => {
  assert.equal(interruptReducer(initialInterruptState, { type: "answer", actionId: "taken" }), initialInterruptState);
});
