import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFonts } from "expo-font";
import { Image } from "expo-image";
import { Fraunces_400Regular, Fraunces_500Medium } from "@expo-google-fonts/fraunces";
import { StatusBar } from "expo-status-bar";
import { BackHandler, StyleSheet, TVFocusGuideView, View } from "react-native";

import { CareFocusable, CareText, Interrupt, InterruptOverlay, InterruptProvider, nextTextSize, TypeScaleProvider, useInterrupts, useTypeScale } from "./kit/src";
import { api, Emergency, HubEvent, HubState, Medicine } from "./src/api";
import { BreathingMark, PillButton, RippleMark, syncClock, Tag } from "./src/components";
import { Lang, strings } from "./src/i18n";
import { CheckIn } from "./src/screens/CheckIn";
import { Family } from "./src/screens/Family";
import { Home } from "./src/screens/Home";
import { useSpeech } from "./src/speech";
import { colors, fonts, radius } from "./src/theme";

type Screen = { name: "home" } | { name: "checkin" } | { name: "family"; open: string | null };
type Toast = { id: number; title: string; body?: string; tone: "ok" | "soft" | "help" };
type Dialog = { kind: "help-confirm" } | { kind: "help-sent"; names: string; number: string } | { kind: "emergency"; e: Emergency } | null;

export default function App() {
  const [loaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    "Pretendard-Regular": require("./assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-SemiBold": require("./assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("./assets/fonts/Pretendard-Bold.otf"),
  });
  const [lang, setLang] = useState<Lang>("en");
  // Fraunces has no Hangul, so Korean headings use Pretendard throughout.
  const families = useMemo(
    () =>
      lang === "ko"
        ? { display: fonts.sansBold, title: fonts.sansBold, heading: fonts.sansBold, body: fonts.sans, label: fonts.sansSemi, caption: fonts.sans }
        : { display: fonts.serif, title: fonts.serif, heading: fonts.sansBold, body: fonts.sans, label: fonts.sansSemi, caption: fonts.sans },
    [lang],
  );
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  return (
    <TypeScaleProvider families={families}>
      <InterruptProvider onAnswer={(i, action) => answerReminder(i, action)}>
        <Shell lang={lang} setLang={setLang} />
      </InterruptProvider>
    </TypeScaleProvider>
  );
}

function answerReminder(i: Interrupt, action: string) {
  const mid = i.id.replace(/^med-/, "");
  if (action === "taken") api.taken(mid).catch(() => {});
  if (action === "later") api.snooze(mid).catch(() => {});
}

function Shell({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [hub, setHub] = useState<HubState | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [offline, setOffline] = useState(false);
  const [homeFocus, setHomeFocus] = useState<"talk" | "ok" | "help" | "family">("talk");
  const { raise } = useInterrupts();
  const { size, setSize, families } = useTypeScale();
  const serif = families.title;
  const { speak } = useSpeech();
  const s = strings[lang];
  const sRef = useRef(s);
  sRef.current = s;
  const langRef = useRef(lang);
  langRef.current = lang;

  const refresh = useCallback(
    () =>
      api
        .state()
        .then((st) => {
          syncClock(st.clock);
          setHub(st);
        })
        .catch(() => setOffline(true)),
    [],
  );

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 6000);
  }, []);

  // Long-poll the hub for reminders and family postcards.
  useEffect(() => {
    let stop = false;
    let after = 0;
    (async () => {
      try {
        const first = await api.state();
        syncClock(first.clock);
        setHub(first);
        Image.prefetch(first.messages.filter((m) => m.photo).map((m) => api.media(m.photo as string))).catch(() => {});
        setLang(first.lang);
        after = first.last_event;
        api.tvOn().catch(() => {});
      } catch {
        setOffline(true);
      }
      while (!stop) {
        try {
          const r = await api.events(after);
          setOffline(false);
          after = r.last;
          r.events.forEach(handle);
          if (r.events.length) refresh();
        } catch {
          setOffline(true);
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
    })();
    function handle(e: HubEvent) {
      const st = sRef.current;
      if (e.kind === "reminder") {
        const m = e.data as Medicine;
        const name = langRef.current === "ko" ? m.name_ko : m.name;
        raise({
          id: `med-${m.id}`,
          title: st.remindTitle(name),
          body: `${m.note}. ${st.remindBody}`,
          actions: [
            { id: "taken", label: st.taken },
            { id: "later", label: st.later },
          ],
        });
        speak(st.remindTitle(name));
      } else if (e.kind === "message") {
        toast({ title: st.newMessage(e.data.from_name), body: e.data.text, tone: "soft" });
      } else if (e.kind === "help") {
        // Shown by the dialog that sent it.
      }
    }
    return () => {
      stop = true;
    };
  }, []);

  // The Back button on the remote always returns one step towards home.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dialog) {
        setDialog(null);
        return true;
      }
      if (screen.name === "family" && screen.open) {
        setScreen({ name: "family", open: null });
        return true;
      }
      if (screen.name !== "home") {
        setScreen({ name: "home" });
        refresh();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [dialog, screen]);

  async function switchLang() {
    const next: Lang = lang === "en" ? "ko" : "en";
    setLang(next);
    api.setLang(next).catch(() => {});
  }

  async function sendOk() {
    const r = await api.ok().catch(() => null);
    if (r) toast({ title: s.okSent(r.sent_to.join(" & ")), tone: "ok" });
  }

  async function sendHelp() {
    const r = await api.help().catch(() => null);
    if (r) setDialog({ kind: "help-sent", names: r.sent_to.join(" & "), number: r.number });
  }

  if (!hub) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center", gap: 16 }]}>
        <RippleMark size={96} />
        <CareText role="heading" style={{ color: colors.navy, fontFamily: fonts.sansSemi }}>
          {offline ? "Waiting for the care hub…" : "Chingu Care AI"}
        </CareText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <View style={styles.header}>
        <View style={styles.brand}>
          <BreathingMark size={40} />
          <CareText role="heading" style={{ color: colors.navy, fontFamily: serif }}>
            {s.product}
          </CareText>
          <Tag>{s.demo}</Tag>
          {offline ? <Tag tone="help">Hub offline</Tag> : null}
        </View>
        <TVFocusGuideView style={styles.headerActions}>
          <PillButton label={`${s.textSize}: ${size === "large" ? "A" : size === "larger" ? "A+" : "A++"}`} onPress={() => setSize(nextTextSize(size))} />
          <PillButton label={s.language} onPress={switchLang} />
        </TVFocusGuideView>
      </View>

      <View style={styles.body}>
        {screen.name === "home" && (
          <Home
            s={s}
            lang={lang}
            hub={hub}
            onTalk={() => {
              setHomeFocus("talk");
              setScreen({ name: "checkin" });
            }}
            onFamily={() => {
              setHomeFocus("family");
              setScreen({ name: "family", open: null });
            }}
            onOk={() => {
              setHomeFocus("ok");
              sendOk();
            }}
            onHelp={() => {
              setHomeFocus("help");
              setDialog({ kind: "help-confirm" });
            }}
            onHelpHold={() => {
              setHomeFocus("help");
              sendHelp();
            }}
            focusOn={homeFocus}
            covered={dialog !== null}
          />
        )}
        {screen.name === "checkin" && (
          <CheckIn
            s={s}
            hub={hub}
            onEmergency={(e) => setDialog({ kind: "emergency", e })}
            onDone={() => {
              setScreen({ name: "home" });
              refresh();
            }}
          />
        )}
        {screen.name === "family" && (
          <Family
            s={s}
            hub={hub}
            openId={screen.open}
            onOpen={(id) => {
              setScreen({ name: "family", open: id });
              refresh();
            }}
            onHome={() => setScreen({ name: "home" })}
          />
        )}
      </View>

      <View style={styles.toasts} pointerEvents="none">
        {toasts.map((t) => (
          <View key={t.id} style={[styles.toast, t.tone === "ok" && { borderLeftColor: colors.celadon }]}>
            <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold }}>
              {t.title}
            </CareText>
            {t.body ? (
              <CareText role="caption" style={{ color: colors.ink, fontFamily: fonts.sans }} numberOfLines={2}>
                {t.body}
              </CareText>
            ) : null}
          </View>
        ))}
      </View>

      <InterruptOverlay
        render={(i, answer) => (
          <View style={styles.dialog}>
            <View style={styles.reminderBadge}>
              <RippleMark size={56} />
            </View>
            <CareText role="title" style={{ color: colors.navy, textAlign: "center" }}>
              {i.title}
            </CareText>
            <CareText role="body" style={{ color: colors.ink, fontFamily: fonts.sans, textAlign: "center" }}>
              {i.body}
            </CareText>
            <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
              <PillButton label={i.actions[0].label} tone="ok" preferred onPress={() => answer(i.actions[0].id)} />
              <PillButton label={i.actions[1].label} onPress={() => answer(i.actions[1].id)} />
            </TVFocusGuideView>
          </View>
        )}
      />

      {dialog ? (
        <View style={styles.scrim}>
          {dialog.kind === "help-confirm" && (
            <View style={styles.dialog}>
              <CareText role="title" style={{ color: colors.navy, textAlign: "center" }}>
                {s.helpConfirmTitle}
              </CareText>
              <CareText role="body" style={{ color: colors.ink, fontFamily: fonts.sans, textAlign: "center" }}>
                {s.helpConfirmBody}
              </CareText>
              <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
                <PillButton label={s.helpSend} tone="help" preferred onPress={() => { setDialog(null); sendHelp(); }} />
                <PillButton label={s.cancel} onPress={() => setDialog(null)} />
              </TVFocusGuideView>
            </View>
          )}
          {dialog.kind === "help-sent" && (
            <View style={styles.dialog}>
              <CareText role="title" style={{ color: colors.help, textAlign: "center" }}>
                {s.helpSent(dialog.names)}
              </CareText>
              <CareText role="heading" style={{ color: colors.navy, fontFamily: fonts.sansBold, textAlign: "center" }}>
                {s.helpCall(dialog.number)}
              </CareText>
              <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sans, textAlign: "center" }}>
                {s.helpConfirmBody}
              </CareText>
              <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
                <PillButton label={s.close} preferred onPress={() => setDialog(null)} />
              </TVFocusGuideView>
            </View>
          )}
          {dialog.kind === "emergency" && (
            <View style={[styles.dialog, { borderColor: colors.help, borderWidth: 4 }]}>
              <CareText role="display" style={{ color: colors.help, textAlign: "center" }}>
                {s.emergencyTitle(dialog.e.number)}
              </CareText>
              <CareText role="heading" style={{ color: colors.navy, fontFamily: fonts.sansBold, textAlign: "center" }}>
                {s.emergencyFamily}
              </CareText>
              <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sans, textAlign: "center" }}>
                {s.notMedical(dialog.e.number)}
              </CareText>
              <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
                <PillButton label={s.close} preferred onPress={() => setDialog(null)} />
              </TVFocusGuideView>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 48, paddingTop: 24, paddingBottom: 26 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerActions: { flexDirection: "row", gap: 12 },
  body: { flex: 1 },
  toasts: { position: "absolute", right: 48, top: 90, gap: 12, width: 380 },
  toast: { backgroundColor: colors.paper, borderRadius: 18, padding: 16, borderLeftWidth: 8, borderLeftColor: colors.persimmon, gap: 4, elevation: 8 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(250,245,238,0.9)", alignItems: "center", justifyContent: "center" },
  dialog: { backgroundColor: colors.paper, borderRadius: 32, paddingHorizontal: 48, paddingVertical: 36, gap: 14, width: 640, alignItems: "center", elevation: 12 },
  dialogActions: { flexDirection: "row", gap: 18, marginTop: 10 },
  reminderBadge: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
});
