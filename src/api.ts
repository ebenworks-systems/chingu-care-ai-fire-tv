// The TV app talks to the care hub. On the Android TV emulator `adb reverse
// tcp:8797 tcp:8797` makes the hub reachable at localhost; on a Fire TV set
// EXPO_PUBLIC_HUB_URL to the hub's address on the home network.
export const HUB = (process.env.EXPO_PUBLIC_HUB_URL || "http://localhost:8797").replace(/\/$/, "");

export type Medicine = { id: string; name: string; name_ko: string; time: string; note: string; note_ko?: string; status: "due" | "taken" | "snoozed"; at: string | null };
export type Message = { id: string; from: string; from_name: string; text: string; photo: string | null; video?: string | null; at: string; seen: boolean };
export type Note = { id: string; body: string; mood_signal: string | null; flags: string[]; ai_label: string; at: string; minutes: number; sent_to: string[] };
export type HubState = {
  demo_notice: string;
  lang: "en" | "ko";
  parent: { name: string; first: string; first_ko?: string; age: number; city: string; emergency_number: string };
  family: { id: string; name: string; relation: string; city: string }[];
  medicines: Medicine[];
  messages: Message[];
  notes: Note[];
  routine: { usual_tv_on: string; usual_checkin: string; quiet_after: string; days_learned: number; today: { tv_on: string | null; checkin: string | null } };
  companion_live: boolean;
  last_event: number;
  clock: string;
};
export type HubEvent = { id: number; kind: string; at: string; data: any };
export type Emergency = { level: string; kind: string; number: string };
export type TurnResult = { reply: string; suggestions: string[]; emergency: Emergency | null; caution?: boolean; source: string };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(HUB + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

const post = <T,>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

export const api = {
  state: () => call<HubState>("/api/state"),
  events: (after: number) => call<{ events: HubEvent[]; last: number }>(`/api/events?after=${after}&wait=20&audience=tv`),
  tvOn: () => post("/api/activity/tv-on"),
  setLang: (lang: "en" | "ko") => post("/api/lang", { lang }),
  start: () => post<{ session: string; notice: string; reply: string; suggestions: string[]; source: string }>("/api/checkin/start"),
  turn: (session: string, text: string) => post<TurnResult>("/api/checkin/turn", { session, text }),
  end: (session: string) => post<Note>("/api/checkin/end", { session }),
  ok: () => post<{ sent_to: string[] }>("/api/ok"),
  help: () => post<{ sent_to: string[]; number: string }>("/api/help"),
  taken: (id: string) => post("/api/medicine/" + id + "/taken"),
  snooze: (id: string) => post("/api/medicine/" + id + "/snooze"),
  seen: (id: string) => post("/api/family/message/" + id + "/seen"),
  ttsUrl: (text: string) => `${HUB}/api/tts?text=${encodeURIComponent(text)}`,
  media: (path: string) => (path.startsWith("http") ? path : HUB + path),
  // XMLHttpRequest, not fetch: Expo's fetch rejects React Native's { uri, name, type } file parts
  // ("Unsupported FormDataPart implementation"), while the native XHR uploads the file directly.
  asr(uri: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("audio", { uri, name: "answer.m4a", type: "audio/mp4" } as any);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", HUB + "/api/asr");
      xhr.onload = () => {
        if (xhr.status !== 200) return reject(new Error(`asr answered ${xhr.status}`));
        try {
          resolve((JSON.parse(xhr.responseText) as { text: string }).text);
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = () => reject(new Error("asr upload failed"));
      xhr.send(form);
    });
  },
};
