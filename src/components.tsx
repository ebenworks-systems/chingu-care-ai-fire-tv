import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { CareFocusable, CareText } from "../kit/src";
import { colors, fonts, radius } from "./theme";

/** Chingu Care AI's ripple mark, the product's only logo. */
export function RippleMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="-70 -70 140 140">
      <Path d="M30,-44 Q-6,-60 -38,-40 Q-60,-18 -60,12 Q-60,42 -36,58 Q-10,72 22,64 Q46,56 54,32" fill="none" stroke={colors.persimmon} strokeWidth={5} strokeLinecap="round" opacity={0.42} />
      <Path d="M24,-28 Q0,-40 -24,-26 Q-42,-10 -42,12 Q-42,34 -24,46 Q-4,56 20,48 Q36,40 42,20" fill="none" stroke={colors.persimmon} strokeWidth={5.5} strokeLinecap="round" opacity={0.88} />
      <Circle cx={0} cy={10} r={11} fill={colors.persimmon} />
      <Circle cx={-2} cy={8} r={4} fill={colors.cream} opacity={0.85} />
    </Svg>
  );
}

// The hub owns the household's clock (it can run a demo morning); the TV follows it.
let clockOffset = 0;
export function syncClock(hubIso: string) {
  const hub = Date.parse(hubIso);
  if (!Number.isNaN(hub)) clockOffset = hub - Date.now();
}
export const nowMs = () => Date.now() + clockOffset;

export function useClock() {
  const [now, setNow] = useState(new Date(nowMs()));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(nowMs())), 10000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** "8:50 am" in English, "오전 8:50" in Korean, from a Date or an "HH:MM" string. */
export function clockText(value: Date | string, lang: "en" | "ko" = "en") {
  let h: number, m: number;
  if (typeof value === "string") {
    [h, m] = value.split(":").map(Number);
  } else {
    h = value.getHours();
    m = value.getMinutes();
  }
  const mm = String(m).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (lang === "ko") return `${h < 12 ? "오전" : "오후"} ${h12}:${mm}`;
  return `${h12}:${mm} ${h < 12 ? "am" : "pm"}`;
}

/** A pill-shaped remote target used for secondary actions in the header and dialogs. */
export function PillButton(props: {
  label: string;
  onPress: () => void;
  tone?: "plain" | "primary" | "ok" | "help";
  preferred?: boolean;
  style?: StyleProp<ViewStyle>;
  onLongPress?: () => void;
  nextFocusUp?: number;
}) {
  const tone = props.tone ?? "plain";
  const bg = { plain: colors.paper, primary: colors.persimmon, ok: colors.celadon, help: colors.help }[tone];
  const fg = tone === "plain" ? colors.navy : "#FFFFFF";
  return (
    <CareFocusable
      hasTVPreferredFocus={props.preferred}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      label={props.label}
      style={[styles.pill, { backgroundColor: bg }, tone === "plain" && styles.pillPlain, props.style]}
    >
      <CareText role="label" style={{ color: fg, fontFamily: fonts.sansSemi }}>
        {props.label}
      </CareText>
    </CareFocusable>
  );
}

export function Tag(props: { children: React.ReactNode; tone?: "soft" | "ok" | "help" }) {
  const tone = props.tone ?? "soft";
  const bg = { soft: colors.cream, ok: colors.celadonSoft, help: colors.helpSoft }[tone];
  const fg = { soft: colors.navy, ok: colors.celadon, help: colors.help }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{props.children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 26, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  pillPlain: { borderColor: colors.hairline },
  tag: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start" },
  tagText: { fontFamily: fonts.sansSemi, fontSize: 18 },
});
