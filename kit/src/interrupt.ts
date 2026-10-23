/**
 * Interrupt-and-resume: the state machine behind a reminder that pauses what
 * an older viewer is watching and resumes it only after they answer.
 *
 * Framework-free so it can be tested in plain Node and reused outside React.
 */

export type InterruptAction = {
  /** Stable id used in analytics and tests, e.g. "taken" or "snooze". */
  id: string;
  label: string;
  /** Resume paused media after this action (default true). */
  resumes?: boolean;
};

export type Interrupt = {
  id: string;
  title: string;
  body?: string;
  actions: InterruptAction[];
  /** Higher numbers jump the queue: an emergency outranks a medicine reminder. */
  priority?: number;
};

export type MediaState = { id: string; playing: boolean };

export type InterruptState = {
  queue: Interrupt[];
  active: Interrupt | null;
  /** Media that was playing when the first interrupt arrived: only these resume. */
  pausedByUs: string[];
  media: Record<string, boolean>;
};

export type InterruptEvent =
  | { type: "media"; media: MediaState }
  | { type: "media-gone"; id: string }
  | { type: "raise"; interrupt: Interrupt }
  | { type: "answer"; actionId: string }
  | { type: "dismiss" };

export const initialInterruptState: InterruptState = {
  queue: [],
  active: null,
  pausedByUs: [],
  media: {},
};

function byPriority(a: Interrupt, b: Interrupt) {
  return (b.priority ?? 0) - (a.priority ?? 0);
}

/**
 * Pure reducer. The React binding turns `pausedByUs` changes into real
 * pause() and play() calls on the registered players.
 */
export function interruptReducer(state: InterruptState, event: InterruptEvent): InterruptState {
  switch (event.type) {
    case "media": {
      const media = { ...state.media, [event.media.id]: event.media.playing };
      // Media that starts while an interrupt is up is paused by us too.
      if (state.active && event.media.playing && !state.pausedByUs.includes(event.media.id)) {
        return { ...state, media: { ...media, [event.media.id]: false }, pausedByUs: [...state.pausedByUs, event.media.id] };
      }
      return { ...state, media };
    }
    case "media-gone": {
      const media = { ...state.media };
      delete media[event.id];
      return { ...state, media, pausedByUs: state.pausedByUs.filter((id) => id !== event.id) };
    }
    case "raise": {
      if (state.active?.id === event.interrupt.id || state.queue.some((q) => q.id === event.interrupt.id)) {
        return state;
      }
      if (!state.active) {
        const playing = Object.entries(state.media)
          .filter(([, isPlaying]) => isPlaying)
          .map(([id]) => id);
        const media = { ...state.media };
        playing.forEach((id) => (media[id] = false));
        return { ...state, active: event.interrupt, pausedByUs: playing, media };
      }
      if ((event.interrupt.priority ?? 0) > (state.active.priority ?? 0)) {
        return { ...state, active: event.interrupt, queue: [state.active, ...state.queue].sort(byPriority) };
      }
      return { ...state, queue: [...state.queue, event.interrupt].sort(byPriority) };
    }
    case "answer":
    case "dismiss": {
      if (!state.active) return state;
      const action = event.type === "answer" ? state.active.actions.find((a) => a.id === event.actionId) : undefined;
      const resumes = event.type === "dismiss" ? true : action?.resumes !== false;
      const [next, ...rest] = state.queue;
      if (next) {
        // Another interrupt is waiting: keep the media paused until the last one is answered.
        return { ...state, active: next, queue: rest };
      }
      if (!resumes) {
        return { ...state, active: null, pausedByUs: [] };
      }
      const media = { ...state.media };
      state.pausedByUs.forEach((id) => {
        if (id in media) media[id] = true;
      });
      return { ...state, active: null, queue: [], pausedByUs: [], media };
    }
  }
}

/** Which players to pause and which to play to move from one state to the next. */
export function mediaCommands(prev: InterruptState, next: InterruptState): { pause: string[]; play: string[] } {
  const pause: string[] = [];
  const play: string[] = [];
  for (const [id, playing] of Object.entries(next.media)) {
    const was = prev.media[id];
    if (was === true && playing === false) pause.push(id);
    if (was === false && playing === true) play.push(id);
  }
  return { pause, play };
}
