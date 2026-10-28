import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFonts } from "expo-font";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Animated, BackHandler, StyleSheet, Text, TVFocusGuideView, View, ViewStyle } from "react-native";

import { CareFocusable, CareText, Interrupt, InterruptOverlay, InterruptProvider, nextTextSize, TypeScaleProvider, useInterrupts, useTypeScale } from "@ebenworks/tv-care-kit";
import { api, Emergency, HubEvent, HubState, Medicine } from "./src/api";
import { Backdrop, BreathingMark, Eyebrow, Headline, Icon, IconDisc, IconName, OrbitArcs, PillButton, syncClock, Tag, ThinkingDots, useReducedMotion } from "./src/components";
import { Lang, strings } from "./src/i18n";
import { CheckIn } from "./src/screens/CheckIn";
import { Family } from "./src/screens/Family";
import { Home } from "./src/screens/Home";
import { useSpeech } from "./src/speech";
import { colors, fonts, radius, shadow } from "./src/theme";

type Screen = { name: "home" } | { name: "checkin" } | { name: "family"; open: string | null };
type Toast = { id: number; title: string; body?: string; tone: "ok" | "soft" | "help" };
type Dialog = { kind: "help-confirm" } | { kind: "help-sent"; names: string; number: string } | { kind: "emergency"; e: Emergency } | null;

export default function App() {
  const [loaded] = useFonts({
    "Pretendard-Regular": require("./assets/fonts/Pretendard-Regular.otf"),
    "Pretendard-SemiBold": require("./assets/fonts/Pretendard-SemiBold.otf"),
    "Pretendard-Bold": require("./assets/fonts/Pretendard-Bold.otf"),
  });
  const [lang, setLang] = useState<Lang>("en");
  // Pretendard alone in both languages, as on the website and the phone apps.
  const families = useMemo(() => ({ display: fonts.sansBold, title: fonts.sansBold, heading: fonts.sansBold, body: fonts.sans, label: fonts.sansSemi, caption: fonts.sans }), []);
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
  const { size, setSize } = useTypeScale();
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
          body: `${langRef.current === "ko" && m.note_ko ? m.note_ko : m.note}. ${st.remindBody}`,
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
    const [first, ...rest] = s.tagline.split(", ");
    return (
      <View style={styles.root}>
        <Backdrop />
        <StatusBar hidden />
        <View style={styles.waiting}>
          <View style={styles.waitPhoto}>
            <View style={styles.waitPhotoClip}>
              <Image source={require("./assets/photos/parent-talk.webp")} style={StyleSheet.absoluteFill} contentFit="cover" />
            </View>
            <View style={styles.waitDock}>
              <OrbitArcs width={150} height={150} d={["M10,94 A68,68 0 0 1 94,10", "M140,56 A68,68 0 0 1 56,140"]} />
              <View style={styles.waitCore}>
                <BreathingMark size={74} />
              </View>
            </View>
          </View>
          <View style={styles.waitText}>
            <Eyebrow>{s.product}</Eyebrow>
            <Headline role="display">
              {rest.length ? `${first},\n` : first}
              {rest.length ? <Text style={{ color: colors.action }}>{rest.join(", ")}</Text> : null}
            </Headline>
            {offline ? (
              <Eyebrow tone="help" icon="wifi-off">
                {s.waitingHub}
              </Eyebrow>
            ) : (
              <ThinkingDots />
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Backdrop />
      <StatusBar hidden />
      {/* The whole bar is a focus guide, so Up from anywhere below lands on its buttons. */}
      <TVFocusGuideView autoFocus style={styles.bar}>
        <View style={styles.brand}>
          <BreathingMark size={38} />
          <CareText role="body" style={{ color: colors.navy, fontFamily: fonts.sansBold, letterSpacing: -0.4 }}>
            {s.product}
          </CareText>
          <Tag>{s.demo}</Tag>
          {offline ? (
            <Tag tone="help" icon="wifi-off">
              {s.hubOffline}
            </Tag>
          ) : null}
        </View>
        <View style={styles.barActions}>
          <PillButton icon="text-size" label={`${s.textSize}: ${size === "large" ? "A" : size === "larger" ? "A+" : "A++"}`} onPress={() => setSize(nextTextSize(size))} style={styles.barPill} />
          <PillButton icon="languages" label={s.language} onPress={switchLang} style={styles.barPill} />
        </View>
      </TVFocusGuideView>

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
            lang={lang}
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
          <ToastCard key={t.id} toast={t} />
        ))}
      </View>

      <InterruptOverlay
        render={(i, answer) => (
          <View style={[styles.dialog, size === "large" && styles.reminder]}>
            {size === "large" ? (
              <View style={styles.reminderPhoto}>
                <Image source={require("./assets/photos/parent-medicine.webp")} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            ) : null}
            {size === "large" ? (
              <View style={styles.reminderBadge}>
                <Badge icon="pill" bg={colors.brandSoft} fg={colors.action} />
              </View>
            ) : null}
            <Headline role="title" style={styles.center}>
              {i.title}
            </Headline>
            <CareText role="body" style={[styles.center, { color: colors.textSoft, fontFamily: fonts.sans }]}>
              {i.body}
            </CareText>
            <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
              <PillButton label={i.actions[0].label} tone="ok" icon="check" preferred onPress={() => answer(i.actions[0].id)} />
              <PillButton label={i.actions[1].label} icon="clock" onPaper onPress={() => answer(i.actions[1].id)} />
            </TVFocusGuideView>
          </View>
        )}
      />

      {dialog ? (
        <View style={styles.scrim}>
          {dialog.kind === "help-confirm" && (
            <View style={styles.dialog}>
              {size === "large" ? <Badge icon="lifebuoy" bg={colors.helpSoft} fg={colors.help} /> : null}
              <Headline role="title" style={styles.center}>
                {s.helpConfirmTitle}
              </Headline>
              <CareText role="body" style={[styles.center, { color: colors.textSoft, fontFamily: fonts.sans }]}>
                {s.helpConfirmBody}
              </CareText>
              <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
                <PillButton label={s.helpSend} tone="help" icon="lifebuoy" preferred onPress={() => { setDialog(null); sendHelp(); }} />
                <PillButton label={s.cancel} icon="x" onPaper onPress={() => setDialog(null)} />
              </TVFocusGuideView>
            </View>
          )}
          {dialog.kind === "help-sent" && (
            <View style={styles.dialog}>
              {size === "large" ? <Badge icon="check" bg={colors.help} fg="#FFFFFF" /> : null}
              <Headline role="title" style={[styles.center, { color: colors.help }]}>
                {s.helpSent(dialog.names)}
              </Headline>
              <View style={styles.callRow}>
                <Icon name="phone" size={28} color={colors.navy} />
                <Headline role="heading" style={{ flexShrink: 1 }}>
                  {s.helpCall(dialog.number)}
                </Headline>
              </View>
              <CareText role="caption" style={[styles.center, { color: colors.textSoft, fontFamily: fonts.sans }]}>
                {s.helpConfirmBody}
              </CareText>
              <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
                <PillButton label={s.close} icon="x" onPaper preferred onPress={() => setDialog(null)} />
              </TVFocusGuideView>
            </View>
          )}
          {dialog.kind === "emergency" && (
            <View style={[styles.dialog, styles.emergency]}>
              {size === "large" ? <Badge icon="phone" bg={colors.help} fg="#FFFFFF" /> : null}
              <Headline role="display" style={[styles.center, { color: colors.help }]}>
                {s.emergencyTitle(dialog.e.number)}
              </Headline>
              <Headline role="heading" style={styles.center}>
                {s.emergencyFamily}
              </Headline>
              <CareText role="caption" style={[styles.center, { color: colors.textSoft, fontFamily: fonts.sans }]}>
                {s.notMedical(dialog.e.number)}
              </CareText>
              <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.dialogActions}>
                <PillButton label={s.close} icon="x" onPaper preferred onPress={() => setDialog(null)} />
              </TVFocusGuideView>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** A dialog's icon in a large disc, ringed by the ripple's arcs. */
function Badge({ icon, bg, fg }: { icon: IconName; bg: string; fg: string }) {
  return (
    <View style={styles.badge}>
      <OrbitArcs width={112} height={112} d={["M8,70 A52,52 0 0 1 70,8", "M104,42 A52,52 0 0 1 42,104"]} />
      <IconDisc name={icon} size={84} bg={bg} fg={fg} />
    </View>
  );
}

/** A note that slides in at the top right, like the website's floating cards, and leaves by itself. */
function ToastCard({ toast }: { toast: Toast }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const a = Animated.spring(v, { toValue: 1, damping: 18, stiffness: 160, useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [reduce]);
  const tone = toast.tone === "ok" ? { bg: colors.positiveSoft, fg: colors.positive, icon: "check" as const } : toast.tone === "help" ? { bg: colors.helpSoft, fg: colors.help, icon: "lifebuoy" as const } : { bg: colors.brandSoft, fg: colors.brandText, icon: "mail" as const };
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }] }]}
    >
      <IconDisc name={tone.icon} size={48} bg={tone.bg} fg={tone.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold }}>
          {toast.title}
        </CareText>
        {toast.body ? (
          <CareText role="caption" style={{ color: colors.textSoft, fontFamily: fonts.sans }} numberOfLines={2}>
            {toast.body}
          </CareText>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas, paddingHorizontal: 40, paddingTop: 18, paddingBottom: 22 },
  bar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18,
    backgroundColor: colors.paper, borderRadius: radius.pill, paddingLeft: 18, paddingRight: 8, paddingVertical: 6, boxShadow: shadow.soft,
  } as ViewStyle,
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  barActions: { flexDirection: "row", gap: 10 },
  barPill: { paddingVertical: 8, paddingHorizontal: 20, backgroundColor: colors.canvas, boxShadow: `inset 0px 0px 0px 1.5px ${colors.rule}` } as ViewStyle,
  body: { flex: 1 },
  waiting: { flex: 1, flexDirection: "row", alignItems: "center", gap: 56 },
  waitPhoto: { width: 440, height: "100%" },
  waitPhotoClip: { flex: 1, borderRadius: radius.panel, overflow: "hidden", backgroundColor: colors.hero, boxShadow: shadow.soft } as ViewStyle,
  waitDock: { position: "absolute", right: -64, bottom: 36, width: 150, height: 150, alignItems: "center", justifyContent: "center" },
  waitCore: { width: 116, height: 116, borderRadius: 58, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", boxShadow: shadow.lifted } as ViewStyle,
  waitText: { flex: 1, gap: 18, paddingLeft: 40 },
  toasts: { position: "absolute", right: 40, top: 96, gap: 12, width: 420 },
  toast: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.paper, borderRadius: 28, paddingVertical: 14, paddingLeft: 14, paddingRight: 20,
    boxShadow: shadow.lifted,
  } as ViewStyle,
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(246,249,247,0.9)", alignItems: "center", justifyContent: "center" },
  dialog: {
    backgroundColor: colors.paper, borderRadius: radius.panel, paddingHorizontal: 52, paddingTop: 30, paddingBottom: 34, gap: 12, width: 680, alignItems: "center",
    boxShadow: "0px 30px 60px rgba(28, 61, 82, 0.16)",
  } as ViewStyle,
  // A real border, not an inset shadow: Fire OS 7 (Android 9) draws no inset shadows.
  emergency: { borderWidth: 4, borderColor: colors.help, boxShadow: "0px 30px 60px rgba(143, 40, 52, 0.2)" } as ViewStyle,
  center: { textAlign: "center" },
  reminder: { paddingTop: 0, overflow: "hidden" },
  reminderPhoto: { alignSelf: "stretch", height: 150, marginHorizontal: -52, backgroundColor: colors.hero },
  reminderBadge: { marginTop: -58 },
  dialogActions: { flexDirection: "row", gap: 18, marginTop: 12 },
  badge: { width: 112, height: 112, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  callRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.canvas, borderRadius: radius.button, paddingHorizontal: 20, paddingVertical: 12 },
});
