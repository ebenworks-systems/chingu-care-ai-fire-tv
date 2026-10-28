import React from "react";
import { Image } from "expo-image";
import { StyleSheet, Text, TVFocusGuideView, View, ViewStyle } from "react-native";

import { CareFocusable, CareText, useFocusReturn, useTypeScale } from "@ebenworks/tv-care-kit";
import { api, HubState } from "../api";
import { clockText, Eyebrow, Headline, Icon, IconDisc, ON_FILL, ON_PAPER, OrbitArcs, panel, Portrait, Rise, ScrollStage, Tag, useClock } from "../components";
import { Strings } from "../i18n";
import { colors, fonts, radius, shadow } from "../theme";

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
  // At the two larger text sizes the screen scrolls with the remote instead of cutting off.
  const roomy = useTypeScale().size !== "large";
  const pref = (name: Props["focusOn"]) => free && focusOn === name;
  const now = useClock();
  const hour = now.getHours();
  const greet = hour < 12 ? s.morning : hour < 18 ? s.afternoon : s.evening;
  const latest = hub.messages[0];
  const sender = latest ? hub.family.find((f) => f.id === latest.from) : undefined;
  const unseen = hub.messages.filter((m) => !m.seen).length;
  const checkedIn = hub.routine.today.checkin;
  // The routine the hub learned from the TV: near the usual time, the check-in card says so.
  const [uh, um] = hub.routine.usual_checkin.split(":").map(Number);
  const fromUsual = now.getHours() * 60 + now.getMinutes() - (uh * 60 + um);
  const usualNow = !checkedIn && fromUsual >= -45 && fromUsual <= 90;
  const date = now.toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { weekday: "long", month: "long", day: "numeric" });
  const taken = hub.medicines.filter((m) => m.status === "taken").length;
  const next = hub.medicines.find((m) => m.status !== "taken");
  const name = lang === "ko" && hub.parent.first_ko ? `${hub.parent.first_ko} 님` : hub.parent.first;

  return (
    <ScrollStage contentStyle={styles.wrap} moreLabel={s.moreBelow}>
      <View style={styles.left}>
        <Rise i={0}>
          <Eyebrow>
            {date} · {clockText(now, lang)}
          </Eyebrow>
        </Rise>
        <Rise i={1}>
          <Headline role="display" style={styles.greet}>
            {greet},{"\n"}
            <Text style={{ color: colors.action }}>{name}</Text>
          </Headline>
        </Rise>

        <Rise i={2}>
          <CareFocusable hasTVPreferredFocus={pref("talk")} onPress={onTalk} style={styles.talk} look={ON_FILL} label={`${s.talkTitle}. ${checkedIn ? s.talkBodyDone(clockText(checkedIn, lang)) : s.talkBodyUsual(clockText(hub.routine.usual_checkin, lang))}`}>
            <View style={styles.talkDisc}>
              <OrbitArcs width={80} height={80} color="#FFFFFF" opacity={0.55} d={["M6,50 A34,34 0 0 1 50,6", "M74,30 A34,34 0 0 1 30,74"]} />
              <View style={styles.talkCore}>
                <Icon name="mic" size={30} color={colors.action} stroke={2.1} />
              </View>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Headline role="heading" style={{ color: "#FFFFFF" }}>
                {s.talkTitle}
              </Headline>
              <CareText role="label" style={styles.talkBody}>
                {checkedIn ? s.talkBodyDone(clockText(checkedIn, lang)) : s.talkBodyUsual(clockText(hub.routine.usual_checkin, lang))}
              </CareText>
            </View>
            {usualNow ? (
              <Tag tone="paper" dot style={styles.usual}>
                {s.usualNow}
              </Tag>
            ) : null}
          </CareFocusable>
        </Rise>

        <Rise i={3}>
          <TVFocusGuideView autoFocus style={styles.rail}>
            <CareFocusable hasTVPreferredFocus={pref("ok")} onPress={onOk} style={[styles.railBtn, styles.okBtn]} look={ON_PAPER} label={`${s.ok}. ${s.okBody}`}>
              <View style={{ flexShrink: 1 }}>
                <View style={styles.railTitle}>
                  <IconDisc name="check" size={34} bg={colors.positive} fg="#FFFFFF" />
                  <Headline role="heading" style={{ color: colors.positive }}>
                    {s.ok}
                  </Headline>
                </View>
                <CareText role="caption" style={{ color: colors.positive, fontFamily: fonts.sansSemi }}>
                  {s.okBody}
                </CareText>
              </View>
            </CareFocusable>
            <CareFocusable
              hasTVPreferredFocus={pref("help")}
              onPress={onHelp}
              onLongPress={onHelpHold}
              delayLongPress={2000}
              style={[styles.railBtn, styles.helpBtn]}
              look={{ ringColor: colors.help, ringWidth: 4, scale: 1.06, shadowOpacity: 0.22, elevation: 10 }}
              label={`${s.help}. ${s.helpBody}`}
            >
              <View style={{ flexShrink: 1 }}>
                <View style={styles.railTitle}>
                  <IconDisc name="lifebuoy" size={34} bg={colors.help} fg="#FFFFFF" />
                  <Headline role="heading" style={{ color: colors.help }}>
                    {s.help}
                  </Headline>
                </View>
                <CareText role="caption" style={{ color: colors.help, fontFamily: fonts.sansSemi }}>
                  {s.helpBody}
                </CareText>
              </View>
            </CareFocusable>
          </TVFocusGuideView>
        </Rise>
      </View>

      <View style={styles.right}>
        <Rise i={1} style={roomy ? undefined : { flex: 1 }}>
          <CareFocusable
            hasTVPreferredFocus={pref("family")}
            onPress={onFamily}
            style={[styles.family, roomy && { flex: 0 }]}
            look={ON_PAPER}
            label={latest ? `${s.familyTitle}. ${unseen ? s.familyNew(unseen) : s.familyNone}. ${latest.from_name}: ${latest.text}` : s.familyTitle}
          >
            <View style={[styles.photo, roomy && { flex: 0, height: 150 }]}>
              {latest?.photo ? <Image source={{ uri: api.media(latest.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.hero }]} />}
              <Tag tone="paper" icon="mail" style={[styles.floatTag, styles.photoTitle]}>
                {s.familyTitle}
              </Tag>
              <Tag tone={unseen ? "brand" : "ok"} dot style={[styles.floatTag, styles.photoCount]}>
                {unseen ? s.familyNew(unseen) : s.familyNone}
              </Tag>
            </View>
            {latest ? (
              <View style={styles.familyFoot}>
                <Portrait uri={sender?.photo ? api.media(sender.photo) : null} size={64} style={styles.footPortrait} />
                <View style={{ flex: 1, gap: 2 }}>
                  <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold }} numberOfLines={1}>
                    {latest.from_name}
                    {sender ? <CareText role="label" style={{ color: colors.muted, fontFamily: fonts.sans }}>{` · ${lang === "ko" && sender.city_ko ? sender.city_ko : sender.city}`}</CareText> : null}
                  </CareText>
                  <CareText role="caption" style={styles.familyQuote} numberOfLines={2}>
                    “{latest.text}”
                  </CareText>
                </View>
              </View>
            ) : null}
          </CareFocusable>
        </Rise>

        <Rise i={2}>
          <View style={styles.meds}>
            <View style={styles.medsHead}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <IconDisc name="pill" size={36} bg={colors.brandSoft} fg={colors.brandText} />
                <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold }}>
                  {s.medsTitle}
                </CareText>
              </View>
              <CareText role="caption" style={{ color: colors.textSoft, fontFamily: fonts.sansSemi }}>
                {s.medsDone(taken, hub.medicines.length)}
              </CareText>
            </View>
            {hub.medicines.map((m) => (
              <View key={m.id} style={[styles.medRow, m === next && styles.medNext]}>
                <MedStatus status={m.status} next={m === next} />
                <View style={roomy ? styles.medStack : styles.medLine}>
                  <CareText role="caption" style={[styles.medName, m.status === "taken" && { color: colors.textSoft }]} numberOfLines={2}>
                    {lang === "ko" ? m.name_ko : m.name}
                  </CareText>
                  <CareText role="caption" style={[styles.medWhen, m.status === "taken" && { color: colors.positive }, m === next && styles.medWhenNext]}>
                    {m.status === "taken" ? s.medTaken(clockText(m.at || "0:00", lang)) : m.status === "snoozed" ? s.medSnoozed(clockText(m.at || "0:00", lang)) : s.medDue(clockText(m.time, lang))}
                  </CareText>
                </View>
              </View>
            ))}
          </View>
        </Rise>
      </View>
    </ScrollStage>
  );
}

function MedStatus({ status, next }: { status: "due" | "taken" | "snoozed"; next: boolean }) {
  if (status === "taken") return <IconDisc name="check" size={26} bg={colors.positive} fg="#FFFFFF" />;
  if (status === "snoozed") return <IconDisc name="clock" size={26} bg={colors.warm} fg={colors.brandText} />;
  return <View style={[styles.medDue, next && { borderColor: colors.persimmon }]} />;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: "row", gap: 30 },
  left: { flex: 1.18, gap: 12 },
  right: { flex: 1, gap: 16 },
  greet: { marginTop: 2, marginBottom: 2 },
  talk: {
    flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: colors.action, borderRadius: radius.panel,
    paddingVertical: 18, paddingLeft: 18, paddingRight: 20, boxShadow: "0px 22px 44px rgba(166, 75, 41, 0.28)",
  } as ViewStyle,
  talkDisc: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
  talkCore: { width: 62, height: 62, borderRadius: 31, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  talkBody: { color: "rgba(255,255,255,0.94)", fontFamily: fonts.sans },
  usual: { position: "absolute", top: -14, right: 28, boxShadow: shadow.soft } as ViewStyle,
  rail: { flexDirection: "row", gap: 16, marginTop: 4 },
  railBtn: { flex: 1, borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: 16 },
  railTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  okBtn: { backgroundColor: colors.positiveSoft, boxShadow: `inset 0px 0px 0px 1.5px ${colors.positiveBorder}` } as ViewStyle,
  helpBtn: { backgroundColor: colors.helpSoft, boxShadow: `inset 0px 0px 0px 1.5px ${colors.helpBorder}` } as ViewStyle,
  family: { ...panel, flex: 1, overflow: "hidden", borderRadius: radius.panel } as ViewStyle,
  photo: { flex: 1, minHeight: 96, overflow: "hidden" },
  photoTitle: { position: "absolute", top: 16, left: 18 },
  photoCount: { position: "absolute", bottom: 14, right: 18 },
  floatTag: { paddingVertical: 6, paddingHorizontal: 14, boxShadow: shadow.lifted } as ViewStyle,
  familyFoot: { flexDirection: "row", gap: 14, paddingLeft: 18, paddingRight: 22, paddingTop: 10, paddingBottom: 16, alignItems: "flex-start" },
  footPortrait: { marginTop: -38 },
  familyQuote: { color: colors.textSoft, fontFamily: fonts.sans },
  meds: { ...panel, borderRadius: 32, paddingHorizontal: 20, paddingVertical: 14, gap: 4 } as ViewStyle,
  medsHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, marginBottom: 4 },
  medRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 14 },
  medNext: { backgroundColor: colors.stage },
  medDue: { width: 26, height: 26, borderRadius: 13, borderWidth: 2.5, borderColor: colors.parentRule },
  medLine: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  medStack: { flex: 1 },
  medName: { flexShrink: 1, flexGrow: 1, color: colors.navy, fontFamily: fonts.sansSemi },
  medWhen: { color: colors.textSoft, fontFamily: fonts.sans, fontVariant: ["tabular-nums"] },
  medWhenNext: { color: colors.brandText, fontFamily: fonts.sansBold },
});
