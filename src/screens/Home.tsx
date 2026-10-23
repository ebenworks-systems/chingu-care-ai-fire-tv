import React from "react";
import { Image } from "expo-image";
import { StyleSheet, TVFocusGuideView, View } from "react-native";

import { CareFocusable, CareText, useFocusReturn } from "@ebenworks/tv-care-kit";
import { api, HubState } from "../api";
import { clockText, RippleMark, Tag, useClock } from "../components";
import { Strings } from "../i18n";
import { colors, fonts, radius } from "../theme";

type Props = {
  s: Strings;
  lang: "en" | "ko";
  hub: HubState;
  onTalk: () => void;
  onFamily: () => void;
  onOk: () => void;
  onHelp: () => void;
  onHelpHold: () => void;
  /** Which control should hold focus when nothing covers the screen. */
  focusOn: "talk" | "ok" | "help" | "family";
  covered: boolean;
};

export function Home({ s, lang, hub, onTalk, onFamily, onOk, onHelp, onHelpHold, focusOn, covered }: Props) {
  const free = useFocusReturn() && !covered;
  const pref = (name: Props["focusOn"]) => free && focusOn === name;
  const now = useClock();
  const hour = now.getHours();
  const greet = hour < 12 ? s.morning : hour < 18 ? s.afternoon : s.evening;
  const latest = hub.messages[0];
  const unseen = hub.messages.filter((m) => !m.seen).length;
  const checkedIn = hub.routine.today.checkin;
  // The routine the hub learned from the TV: near the usual time, the check-in card says so.
  const [uh, um] = hub.routine.usual_checkin.split(":").map(Number);
  const fromUsual = now.getHours() * 60 + now.getMinutes() - (uh * 60 + um);
  const usualNow = !checkedIn && fromUsual >= -45 && fromUsual <= 90;
  const date = now.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <View style={styles.wrap}>
      <View style={styles.left}>
        <CareText role="caption" style={styles.date}>
          {date} · {clockText(now, lang)}
        </CareText>
        <CareText role="display" style={styles.greet}>
          {greet},{"\n"}
          {lang === "ko" && hub.parent.first_ko ? `${hub.parent.first_ko} 님` : hub.parent.first}
        </CareText>

        <CareFocusable hasTVPreferredFocus={pref("talk")} onPress={onTalk} style={styles.talk} label={s.talkTitle}>
          {(focused) => (
            <View style={styles.talkInner}>
              <View style={[styles.talkMark, focused && { backgroundColor: colors.paper }]}>
                <RippleMark size={50} />
              </View>
              <View style={{ flex: 1 }}>
                {usualNow ? <Tag tone="ok">{s.usualNow}</Tag> : null}
                <CareText role="heading" style={styles.talkTitle}>
                  {s.talkTitle}
                </CareText>
                <CareText role="label" style={styles.talkBody}>
                  {checkedIn ? s.talkBodyDone(clockText(checkedIn, lang)) : s.talkBodyUsual(clockText(hub.routine.usual_checkin, lang))}
                </CareText>
              </View>
            </View>
          )}
        </CareFocusable>

        <TVFocusGuideView autoFocus style={styles.rail}>
          <CareFocusable hasTVPreferredFocus={pref("ok")} onPress={onOk} style={[styles.railBtn, { backgroundColor: colors.celadonSoft }]} label={s.ok}>
            <CareText role="heading" style={{ color: colors.celadon, fontFamily: fonts.sansBold }}>
              {s.ok}
            </CareText>
            <CareText role="caption" style={{ color: colors.celadon, fontFamily: fonts.sans }}>
              {s.okBody}
            </CareText>
          </CareFocusable>
          <CareFocusable
            hasTVPreferredFocus={pref("help")}
            onPress={onHelp}
            onLongPress={onHelpHold}
            delayLongPress={2000}
            style={[styles.railBtn, { backgroundColor: colors.helpSoft }]}
            look={{ ringColor: colors.help, ringWidth: 4, scale: 1.06, shadowOpacity: 0.22, elevation: 10 }}
            label={s.help}
          >
            <CareText role="heading" style={{ color: colors.help, fontFamily: fonts.sansBold }}>
              {s.help}
            </CareText>
            <CareText role="caption" style={{ color: colors.help, fontFamily: fonts.sans }}>
              {s.helpBody}
            </CareText>
          </CareFocusable>
        </TVFocusGuideView>
      </View>

      <View style={styles.right}>
        <CareFocusable hasTVPreferredFocus={pref("family")} onPress={onFamily} style={styles.family} label={s.familyTitle}>
          {latest?.photo ? <Image source={{ uri: api.media(latest.photo) }} style={styles.familyPhoto} contentFit="cover" /> : null}
          <View style={styles.familyText}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <CareText role="label" style={styles.cardTitle}>
                {s.familyTitle}
              </CareText>
              <Tag tone={unseen ? "soft" : "ok"}>{unseen ? s.familyNew(unseen) : s.familyNone}</Tag>
            </View>
            {latest ? (
              <CareText role="caption" style={styles.familyQuote} numberOfLines={2}>
                {latest.from_name}: “{latest.text}”
              </CareText>
            ) : null}
          </View>
        </CareFocusable>

        <View style={styles.meds}>
          <CareText role="label" style={styles.cardTitle}>
            {s.medsTitle}
          </CareText>
          {hub.medicines.map((m) => (
            <View key={m.id} style={styles.medRow}>
              <View style={[styles.dot, { backgroundColor: m.status === "taken" ? colors.celadon : m.status === "snoozed" ? colors.hwangto : colors.hairline }]} />
              <CareText role="caption" style={styles.medName} numberOfLines={1}>
                {lang === "ko" ? m.name_ko : m.name}
              </CareText>
              <CareText role="caption" style={[styles.medWhen, m.status === "taken" && { color: colors.celadon }]}>
                {m.status === "taken" ? s.medTaken(clockText(m.at || "0:00", lang)) : m.status === "snoozed" ? s.medSnoozed(clockText(m.at || "0:00", lang)) : s.medDue(clockText(m.time, lang))}
              </CareText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: "row", gap: 32 },
  left: { flex: 1.15, justifyContent: "flex-start" },
  right: { flex: 1, gap: 18 },
  date: { color: colors.muted, fontFamily: fonts.sansSemi, letterSpacing: 0.4 },
  greet: { color: colors.navy, marginTop: 2, marginBottom: 14 },
  talk: { backgroundColor: colors.persimmonSoft, borderRadius: radius.card, padding: 16 },
  talkInner: { flexDirection: "row", alignItems: "center", gap: 18 },
  talkMark: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  talkTitle: { color: colors.navy, fontFamily: fonts.sansBold },
  talkBody: { color: colors.ink, fontFamily: fonts.sans, marginTop: 2 },
  rail: { flexDirection: "row", gap: 16, marginTop: 14 },
  railBtn: { flex: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 20 },
  family: { backgroundColor: colors.paper, borderRadius: radius.card, overflow: "hidden" },
  familyPhoto: { width: "100%", height: 150 },
  familyText: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  familyQuote: { color: colors.ink, fontFamily: fonts.sans },
  cardTitle: { color: colors.navy, fontFamily: fonts.sansBold },
  meds: { backgroundColor: colors.paper, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  medRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  medName: { flex: 1, color: colors.ink, fontFamily: fonts.sansSemi },
  medWhen: { color: colors.muted, fontFamily: fonts.sans },
});
