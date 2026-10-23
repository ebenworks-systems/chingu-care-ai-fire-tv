import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, ScrollViewInstance, StyleSheet, TVFocusGuideView, View } from "react-native";

import { CareFocusable, CareText, useTypeScale } from "../../kit/src";
import { api, Emergency, HubState, Note } from "../api";
import { PillButton, RippleMark, Tag } from "../components";
import { Strings } from "../i18n";
import { useListen, useSpeech } from "../speech";
import { colors, fonts, radius } from "../theme";

type Line = { who: "chingu" | "parent"; text: string };

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
  const scroll = useRef<ScrollViewInstance>(null);
  const { speak, stop } = useSpeech();
  const listen = useListen();
  const { families } = useTypeScale();

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
      .catch(() => setError("The care hub did not answer. Check that it is running."));
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
      setError("The care hub did not answer. Check that it is running.");
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
        setError("I could not hear that. Please choose an answer instead.");
      }
    } else {
      stop();
      await listen.start();
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

  if (note) {
    return (
      <View style={styles.noteWrap}>
        <View style={styles.noteCard}>
          <CareText role="label" style={{ color: colors.persimmon, fontFamily: fonts.sansBold }}>
            {s.noteTitle}
          </CareText>
          <CareText role="heading" style={[styles.noteBody, { fontFamily: families.title }]}>
            {note.body}
          </CareText>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Tag tone="ok">{s.noteSentTo(note.sent_to.join(", "))}</Tag>
            {note.mood_signal ? <Tag>{`Mood: ${note.mood_signal} (AI estimate)`}</Tag> : null}
            {note.flags.includes("emergency") ? <Tag tone="help">Emergency flagged</Tag> : null}
          </View>
          <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sans }}>
            {s.noteAi}
          </CareText>
          <PillButton label={s.backHome} tone="primary" preferred onPress={onDone} style={{ alignSelf: "flex-start", marginTop: 8 }} />
        </View>
      </View>
    );
  }

  const last = lines[lines.length - 1];
  return (
    <View style={styles.wrap}>
      <View style={styles.convo}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ gap: 14, paddingBottom: 8 }} focusable={false}>
          <View style={styles.notice}>
            <RippleMark size={28} />
            <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sansSemi }}>
              {s.aiNotice}
            </CareText>
          </View>
          {lines.map((line, i) =>
            line.who === "chingu" ? (
              <CareText key={i} live={line === last ? "polite" : undefined} role={line === last ? "title" : "heading"} style={[styles.chingu, { fontFamily: families.title }, line !== last && { color: colors.muted }]}>
                {line.text}
              </CareText>
            ) : (
              <View key={i} style={styles.parentBubble}>
                <CareText role="body" style={{ color: colors.navy, fontFamily: fonts.sansSemi }}>
                  {line.text}
                </CareText>
              </View>
            ),
          )}
          {busy ? (
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <ActivityIndicator color={colors.persimmon} />
              <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sans }}>
                {s.thinking}
              </CareText>
            </View>
          ) : null}
          {error ? (
            <CareText role="body" style={{ color: colors.help, fontFamily: fonts.sansSemi }}>
              {error}
            </CareText>
          ) : null}
        </ScrollView>
      </View>

      <TVFocusGuideView autoFocus style={styles.controls}>
        <CareFocusable
          hasTVPreferredFocus
          onPress={() => (busy && !listen.listening ? undefined : onSpeak())}
          style={[styles.mic, listen.listening && { backgroundColor: colors.persimmon }]}
          label={s.speak}
        >
          <CareText role="heading" style={{ color: listen.listening ? colors.paper : colors.navy, fontFamily: fonts.sansBold }}>
            {s.speak}
          </CareText>
          <CareText role="caption" style={{ color: listen.listening ? colors.paper : colors.muted, fontFamily: fonts.sans }}>
            {listen.listening ? s.listening : s.speakHint}
          </CareText>
        </CareFocusable>
        <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sansSemi, marginTop: 6 }}>
          {s.orChoose}
        </CareText>
        {suggestions.map((sug) => (
          <CareFocusable key={sug} onPress={() => (busy ? undefined : send(sug))} style={styles.chip} label={sug}>
            <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansSemi }}>
              {sug}
            </CareText>
          </CareFocusable>
        ))}
        <PillButton label={s.endTalk} onPress={finish} style={{ marginTop: "auto", paddingVertical: 9 }} />
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: "row", gap: 28 },
  convo: { flex: 1.6, backgroundColor: colors.paper, borderRadius: radius.card, padding: 28 },
  notice: { flexDirection: "row", alignItems: "center", gap: 10 },
  chingu: { color: colors.navy },
  parentBubble: { alignSelf: "flex-end", backgroundColor: colors.cream, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10, maxWidth: "80%" },
  controls: { flex: 1, gap: 10 },
  mic: { backgroundColor: colors.persimmonSoft, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 14, gap: 2 },
  chip: { backgroundColor: colors.paper, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 9 },
  noteWrap: { flex: 1, alignItems: "center", justifyContent: "flex-start", paddingTop: 8 },
  noteCard: { backgroundColor: colors.paper, borderRadius: 28, paddingHorizontal: 40, paddingVertical: 30, gap: 14, width: "84%", maxHeight: "100%" },
  noteBody: { color: colors.navy },
});
