import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, ScrollView, ScrollViewInstance, StyleSheet, TVFocusGuideView, View, ViewStyle } from "react-native";

import { CareFocusable, CareText, useTypeScale } from "@ebenworks/tv-care-kit";
import { api, Emergency, HubState, Note } from "../api";
import { EdgeFade, Eyebrow, Headline, Icon, ON_FILL, ON_PAPER, OrbitArcs, panel, ScrollStage, PillButton, Portrait, RippleMark, Rise, Tag, ThinkingDots, useReducedMotion } from "../components";
import { Strings } from "../i18n";
import { useListen, useSpeech } from "../speech";
import { colors, fonts, radius, shadow } from "../theme";

type Line = { who: "chingu" | "parent"; text: string };

// A faceless photograph of the parent's table: the companion is never shown as a face.
const STORY = require("../../assets/photos/parent-story.webp");

type Props = {
  s: Strings;
  hub: HubState;
  onEmergency: (e: Emergency) => void;
  onDone: () => void;
};

export function CheckIn({ s, hub, onEmergency, onDone }: Props) {
  const [session, setSession] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micOff, setMicOff] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const { speak, stop } = useSpeech();
  const listen = useListen();

  useEffect(() => {
    let live = true;
    api
      .start()
      .then((r) => {
        if (!live) return;
        setSession(r.session);
        setLines([{ who: "chingu", text: r.reply }]);
        setSuggestions(r.suggestions);
        setBusy(false);
        speak(`${r.notice} ${r.reply}`);
      })
      .catch(() => setError(s.hubError));
    return () => {
      live = false;
      stop();
    };
  }, []);

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [lines.length, busy]);

  async function send(text: string) {
    if (!session || !text.trim()) return;
    stop();
    setLines((l) => [...l, { who: "parent", text }]);
    setSuggestions([]);
    setBusy(true);
    try {
      const r = await api.turn(session, text);
      setLines((l) => [...l, { who: "chingu", text: r.reply }]);
      setSuggestions(r.suggestions);
      speak(r.reply);
      if (r.emergency) onEmergency(r.emergency);
    } catch {
      setError(s.hubError);
    } finally {
      setBusy(false);
    }
  }

  async function onSpeak() {
    if (listen.listening) {
      setBusy(true);
      try {
        const text = await listen.finish();
        setBusy(false);
        if (text) await send(text);
      } catch (e) {
        console.warn("voice answer failed", e instanceof Error ? e.message : e);
        setBusy(false);
        setError(s.notHeard);
      }
    } else {
      stop();
      // No microphone the app may use (refused, or none on this TV): answers come from the remote.
      const ok = await listen.start().catch(() => false);
      if (!ok) setMicOff(true);
    }
  }

  async function finish() {
    if (!session) return onDone();
    stop();
    setBusy(true);
    try {
      setNote(await api.end(session));
    } finally {
      setBusy(false);
    }
  }

  if (note) return <FamilyNote s={s} hub={hub} note={note} onDone={onDone} />;

  const last = lines[lines.length - 1];
  return (
    <View style={styles.wrap}>
      <Rise i={0} style={styles.convo}>
        <View style={styles.watermark} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <RippleMark size={300} color={colors.hero} dot={colors.paper} />
        </View>
        <Eyebrow style={{ marginBottom: 10 }}>{s.aiNotice}</Eyebrow>
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 16, paddingTop: 6, paddingBottom: 8 }}
            focusable={false}
            onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 8)}
            scrollEventThrottle={64}
          >
            {lines.map((line, i) =>
              line.who === "chingu" ? (
                <View key={i} style={styles.chinguLine}>
                  <View style={[styles.chinguMark, line !== last && { opacity: 0.45 }]}>
                    <RippleMark size={30} />
                  </View>
                  <Headline live={line === last ? "polite" : undefined} role={line === last ? "title" : "heading"} style={[{ flex: 1 }, line !== last && { color: colors.muted, fontFamily: fonts.sansSemi }]}>
                    {line.text}
                  </Headline>
                </View>
              ) : (
                <View key={i} style={styles.parentBubble}>
                  <CareText role="body" style={{ color: colors.brandText, fontFamily: fonts.sansSemi }}>
                    {line.text}
                  </CareText>
                </View>
              ),
            )}
            {busy ? (
              <View style={styles.thinking}>
                <ThinkingDots />
                <CareText role="caption" style={{ color: colors.textSoft, fontFamily: fonts.sansSemi }}>
                  {s.thinking}
                </CareText>
              </View>
            ) : null}
            {error ? (
              <View style={styles.error}>
                <Icon name="wifi-off" size={26} color={colors.help} />
                <CareText role="body" style={{ color: colors.help, fontFamily: fonts.sansSemi, flex: 1 }}>
                  {error}
                </CareText>
              </View>
            ) : null}
          </ScrollView>
          {scrolled ? <EdgeFade side="top" size={48} color={colors.paper} /> : null}
        </View>
      </Rise>

      <Rise i={1} style={{ flex: 1 }}>
        <ScrollStage moreLabel={s.moreBelow} inset={14}>
        <TVFocusGuideView autoFocus style={styles.controls}>
          {micOff ? (
            <View style={styles.noMic}>
              <Icon name="mic" size={26} color={colors.textSoft} />
              <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansSemi, flex: 1 }}>
                {s.noMic}
              </CareText>
            </View>
          ) : (
            <CareFocusable
              hasTVPreferredFocus
              onPress={() => (busy && !listen.listening ? undefined : onSpeak())}
              style={[styles.mic, listen.listening && { backgroundColor: colors.listening }]}
              look={ON_FILL}
              label={`${s.speak}. ${listen.listening ? s.listening : s.speakHint}`}
            >
              <MicDisc listening={listen.listening} />
              <View style={{ flex: 1 }}>
                <Headline role="heading" style={{ color: "#FFFFFF" }}>
                  {s.speak}
                </Headline>
                <CareText role="caption" style={{ color: "rgba(255,255,255,0.94)", fontFamily: fonts.sansSemi }}>
                  {listen.listening ? s.listening : s.speakHint}
                </CareText>
              </View>
            </CareFocusable>
          )}
          {suggestions.length ? (
            <CareText role="caption" style={styles.or}>
              {s.orChoose}
            </CareText>
          ) : null}
          {suggestions.map((sug, i) => (
            <CareFocusable
              key={sug}
              hasTVPreferredFocus={micOff && i === 0}
              onPress={() => (busy ? undefined : send(sug))}
              style={styles.chip}
              look={ON_PAPER}
              focusedStyle={{ backgroundColor: colors.brandSoft }}
              label={sug}
            >
              <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansSemi, flex: 1 }}>
                {sug}
              </CareText>
              <Icon name="chevron-right" size={22} color={colors.brandText} stroke={2.2} />
            </CareFocusable>
          ))}
          <PillButton label={s.endTalk} icon="check" onPress={finish} style={{ marginTop: "auto" }} />
        </TVFocusGuideView>
        </ScrollStage>
      </Rise>
    </View>
  );
}

/** The microphone in a white disc; while it listens, two rings ripple out from it. */
function MicDisc({ listening }: { listening: boolean }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!listening || reduce) {
      v.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [listening, reduce]);
  return (
    <View style={styles.micDisc}>
      {listening
        ? [0, 0.5].map((phase) => {
            const p = Animated.modulo(Animated.add(v, phase), 1);
            return (
              <Animated.View
                key={phase}
                style={[
                  styles.micRing,
                  { opacity: reduce ? 0.5 : p.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: reduce ? 1.2 : p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] },
                ]}
              />
            );
          })
        : null}
      <View style={styles.micCore}>
        <Icon name="mic" size={30} color={listening ? colors.listening : colors.action} stroke={2.1} />
      </View>
    </View>
  );
}

/** The note the family receives, on the celadon note paper the family app uses. */
function FamilyNote({ s, hub, note, onDone }: { s: Strings; hub: HubState; note: Note; onDone: () => void }) {
  // The note and its button always stay on one screen. The note starts at the title size and,
  // if it does not fit, measures again one size smaller (heading, then body, which is never
  // below the 18 dp floor); only past that does it scroll, with the "More below" cue.
  // The photograph shows only when there is room beside a short note.
  const { size } = useTypeScale();
  const [step, setStep] = useState(0);
  useEffect(() => setStep(0), [size, note.id]);
  const role = (["title", "heading", "body"] as const)[step];
  const showPhoto = size === "large" && note.body.length <= 110 && !note.mood_signal && note.flags.length === 0;
  const people = note.sent_to.map((n) => hub.family.find((f) => f.name === n)).filter(Boolean) as HubState["family"];
  return (
    <View style={styles.noteWrap}>
      <Rise i={0} style={[styles.noteCard, showPhoto && { minHeight: 300 }]}>
        {showPhoto ? (
          <View style={styles.notePhoto}>
            <OrbitArcs width={236} height={236} d={["M8,140 A110,110 0 0 1 140,8", "M228,96 A110,110 0 0 1 96,228"]} />
            <Portrait source={STORY} size={196} ring={5} />
          </View>
        ) : null}
        <ScrollStage fit inset={0} moreLabel={s.moreBelow} fade={colors.notePaper} contentStyle={{ gap: 16 }} onFit={(fits) => !fits && setStep((n) => Math.min(2, n + 1))}>
        <Eyebrow icon="heart" plate={false}>
          {s.noteTitle}
        </Eyebrow>
        <Headline role={role} style={[{ color: colors.navy }, showPhoto && { marginRight: 230 }]}>
          {note.body}
        </Headline>
        <View style={[styles.noteMeta, showPhoto && { marginRight: 230 }]}>
          <View style={{ flexDirection: "row" }}>
            {people.map((p, i) => (
              <Portrait key={p.id} uri={p.photo ? api.media(p.photo) : null} size={52} style={i ? { marginLeft: -14 } : undefined} />
            ))}
          </View>
          <Tag tone="ok" icon="check">
            {s.noteSentTo(note.sent_to.join(", "))}
          </Tag>
          {note.mood_signal ? <Tag>{s.mood(note.mood_signal)}</Tag> : null}
          {note.flags.includes("emergency") ? (
            <Tag tone="help" icon="alert">
              {s.emergencyFlagged}
            </Tag>
          ) : null}
        </View>
        </ScrollStage>
        <View style={styles.noteFoot}>
          <CareText role="caption" style={{ color: colors.textSoft, fontFamily: fonts.sans, flex: 1 }}>
            {s.noteAi}
          </CareText>
          <PillButton label={s.backHome} tone="primary" icon="house" preferred onPress={onDone} />
        </View>
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: "row", gap: 28 },
  convo: { ...panel, flex: 1.6, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 16, overflow: "hidden" } as ViewStyle,
  watermark: { position: "absolute", right: -40, bottom: -50, opacity: 0.7 },
  chinguLine: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  chinguMark: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.warm, alignItems: "center", justifyContent: "center", marginTop: 2 },
  parentBubble: { alignSelf: "flex-end", backgroundColor: colors.brandSoft, borderRadius: 24, borderBottomRightRadius: 8, paddingHorizontal: 22, paddingVertical: 12, maxWidth: "80%" },
  thinking: { flexDirection: "row", gap: 14, alignItems: "center", marginLeft: 58 },
  error: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.helpSoft, borderRadius: radius.button, paddingHorizontal: 18, paddingVertical: 12 },
  controls: { flex: 1, gap: 10 },
  mic: {
    flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.action, borderRadius: radius.panel,
    paddingVertical: 14, paddingLeft: 14, paddingRight: 20, boxShadow: "0px 22px 44px rgba(166, 75, 41, 0.26)",
  } as ViewStyle,
  micDisc: { width: 78, height: 78, alignItems: "center", justifyContent: "center" },
  micRing: { position: "absolute", width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: "#FFFFFF" },
  micCore: { width: 66, height: 66, borderRadius: 33, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  noMic: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.paper, borderRadius: radius.button, padding: 16 },
  or: { color: colors.textSoft, fontFamily: fonts.sansSemi, marginTop: 4, marginLeft: 6 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.paper, borderRadius: radius.button, paddingHorizontal: 20, paddingVertical: 10,
    boxShadow: `inset 0px 0px 0px 1.5px ${colors.rule}, 0px 8px 18px rgba(28, 61, 82, 0.06)`,
  } as ViewStyle,
  noteWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  noteCard: {
    width: "88%", maxHeight: "100%", backgroundColor: colors.notePaper, borderRadius: radius.panel, paddingHorizontal: 44, paddingVertical: 32, gap: 16,
    boxShadow: `inset 0px 0px 0px 1.5px ${colors.positiveBorder}, ${shadow.soft}`,
  } as ViewStyle,
  notePhoto: { position: "absolute", right: 24, top: 24, width: 236, height: 236, alignItems: "center", justifyContent: "center" },
  noteMeta: { flexDirection: "row", gap: 12, flexWrap: "wrap", alignItems: "center" },
  noteFoot: { flexDirection: "row", alignItems: "center", gap: 24, marginTop: 4 },
});
