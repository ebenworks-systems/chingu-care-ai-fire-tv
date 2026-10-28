import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, ScrollView, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";

import { CareFocusable, CareText, FocusLook, TypeRole, typeSize, useTypeScale } from "@ebenworks/tv-care-kit";
import { colors, fonts, radius, shadow, tight } from "./theme";

/** Chingu Care AI's ripple mark, the product's only logo. */
export function RippleMark({ size = 40, color = colors.persimmon, dot = colors.cream }: { size?: number; color?: string; dot?: string }) {
  return (
    <Svg width={size} height={size} viewBox="-70 -70 140 140">
      <Path d="M30,-44 Q-6,-60 -38,-40 Q-60,-18 -60,12 Q-60,42 -36,58 Q-10,72 22,64 Q46,56 54,32" fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" opacity={0.42} />
      <Path d="M24,-28 Q0,-40 -24,-26 Q-42,-10 -42,12 Q-42,34 -24,46 Q-4,56 20,48 Q36,40 42,20" fill="none" stroke={color} strokeWidth={5.5} strokeLinecap="round" opacity={0.88} />
      <Circle cx={0} cy={10} r={11} fill={color} />
      <Circle cx={-2} cy={8} r={4} fill={dot} opacity={0.85} />
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

/** True when the viewer has asked the TV for less motion. */
export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/** The ripple mark breathing slowly: a sign that the companion is there, without demanding attention. */
export function BreathingMark({ size = 40 }: { size?: number }) {
  const reduce = useReducedMotion();
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath, reduce]);
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <RippleMark size={size} />
    </Animated.View>
  );
}

/** Content that rises into place when a screen opens, one step after another. */
export function Rise({ i = 0, children, style }: { i?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration: 460, delay: 40 + i * 80, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [reduce]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

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

// --- Icons -----------------------------------------------------------------
// Lucide's outlines (ISC licence) at stroke 1.9, the set the website and apps use.

type Shape = { d: string } | { c: [number, number, number] } | { r: [number, number, number, number, number] } | { poly: string };
const ICONS = {
  mic: [{ d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" }, { d: "M19 10v2a7 7 0 0 1-14 0v-2" }, { d: "M12 19v3" }],
  pill: [{ d: "m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" }, { d: "m8.5 8.5 7 7" }],
  check: [{ d: "M20 6 9 17l-5-5" }],
  lifebuoy: [{ c: [12, 12, 10] }, { d: "m4.93 4.93 4.24 4.24" }, { d: "m14.83 9.17 4.24-4.24" }, { d: "m14.83 14.83 4.24 4.24" }, { d: "m9.17 14.83-4.24 4.24" }, { c: [12, 12, 4] }],
  phone: [{ d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" }],
  play: [{ poly: "7 4 20 12 7 20 7 4" }],
  pause: [{ r: [14, 4, 4, 16, 1] }, { r: [6, 4, 4, 16, 1] }],
  "chevron-left": [{ d: "m15 18-6-6 6-6" }],
  "chevron-right": [{ d: "m9 18 6-6-6-6" }],
  "chevron-down": [{ d: "m6 9 6 6 6-6" }],
  "arrow-left": [{ d: "m12 19-7-7 7-7" }, { d: "M19 12H5" }],
  "text-size": [{ d: "M21 14h-5" }, { d: "M16 16v-3.5a2.5 2.5 0 0 1 5 0V16" }, { d: "M4.5 13h6" }, { d: "m3 16 4.5-9 4.5 9" }],
  languages: [{ d: "m5 8 6 6" }, { d: "m4 14 6-6 2-3" }, { d: "M2 5h12" }, { d: "M7 2h1" }, { d: "m22 22-5-10-5 10" }, { d: "M14 18h6" }],
  heart: [{ d: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" }],
  mail: [{ r: [2, 4, 20, 16, 2] }, { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }],
  clock: [{ c: [12, 12, 10] }, { d: "M12 6v6l4 2" }],
  house: [{ d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" }, { d: "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }],
  "wifi-off": [{ d: "M12 20h.01" }, { d: "M8.5 16.429a5 5 0 0 1 7 0" }, { d: "M5 12.859a10 10 0 0 1 5.17-2.69" }, { d: "M19 12.859a10 10 0 0 0-2.007-1.523" }, { d: "M2 8.82a15 15 0 0 1 4.177-2.643" }, { d: "M22 8.82a15 15 0 0 0-11.288-3.764" }, { d: "m2 2 20 20" }],
  alert: [{ d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }, { d: "M12 9v4" }, { d: "M12 17h.01" }],
  video: [{ d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" }, { r: [2, 6, 14, 12, 2] }],
  x: [{ d: "M18 6 6 18" }, { d: "m6 6 12 12" }],
} satisfies Record<string, Shape[]>;
export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, color = colors.navy, stroke = 1.9 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {(ICONS[name] as Shape[]).map((s, i) =>
        "d" in s ? (
          <Path key={i} d={s.d} />
        ) : "c" in s ? (
          <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} />
        ) : "r" in s ? (
          <Rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} />
        ) : (
          <Polygon key={i} points={s.poly} fill={color} />
        ),
      )}
    </Svg>
  );
}

/** An icon centred in a soft circle, the way the website marks a feature. */
export function IconDisc({ name, size = 48, bg, fg }: { name: IconName; size?: number; bg: string; fg: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

// --- Type ------------------------------------------------------------------

/** A headline in Pretendard Bold, tracked in like the website's. */
export function Headline(props: { role?: TypeRole; style?: any; children: React.ReactNode; numberOfLines?: number; live?: "polite" }) {
  const role = props.role ?? "title";
  const { size } = useTypeScale();
  const { width } = useWindowDimensions();
  const fs = typeSize(role, size, width);
  return (
    <CareText
      role={role}
      live={props.live}
      numberOfLines={props.numberOfLines}
      style={[{ fontFamily: fonts.sansBold, color: colors.navy, letterSpacing: tight(fs), lineHeight: Math.round(fs * (role === "display" ? 1.14 : 1.2)) }, props.style]}
    >
      {props.children}
    </CareText>
  );
}

/** The website's eyebrow: a small persimmon dot (or an icon) and a few words, on a white pill. */
export function Eyebrow(props: { children: React.ReactNode; icon?: IconName; tone?: "brand" | "ok" | "help" | "navy"; plate?: boolean; style?: StyleProp<ViewStyle> }) {
  const tone = props.tone ?? "brand";
  const fg = { brand: colors.brandText, ok: colors.positive, help: colors.help, navy: colors.navy }[tone];
  const dot = { brand: colors.persimmon, ok: colors.celadon, help: colors.help, navy: colors.navy }[tone];
  return (
    <View style={[styles.eyebrow, props.plate !== false && styles.eyebrowPlate, props.style]}>
      {props.icon ? <Icon name={props.icon} size={20} color={fg} /> : <View style={[styles.eyebrowDot, { backgroundColor: dot }]} />}
      <CareText role="caption" style={{ color: fg, fontFamily: fonts.sansSemi }}>
        {props.children}
      </CareText>
    </View>
  );
}

// --- Controls --------------------------------------------------------------

/** Focus on a filled control: a navy ring, so it never disappears into the fill. */
export const ON_FILL: FocusLook = { ringColor: colors.navy, ringWidth: 4, scale: 1.05, shadowOpacity: 0.24, elevation: 12 };
/** Focus on a light control: the brand ring, as the kit draws it. */
export const ON_PAPER: FocusLook = { ringColor: colors.persimmon, ringWidth: 4, scale: 1.06, shadowOpacity: 0.2, elevation: 10 };

/** A pill-shaped remote target with a word and, where it helps, an icon. */
export function PillButton(props: {
  label: string;
  onPress: () => void;
  tone?: "plain" | "primary" | "ok" | "help";
  /** A plain pill on a white card takes the canvas fill, so it stays visible where outlines are not drawn. */
  onPaper?: boolean;
  icon?: IconName;
  preferred?: boolean;
  style?: StyleProp<ViewStyle>;
  onLongPress?: () => void;
}) {
  const tone = props.tone ?? "plain";
  const bg = { plain: props.onPaper ? colors.canvas : colors.paper, primary: colors.action, ok: colors.positive, help: colors.help }[tone];
  const fg = tone === "plain" ? colors.navy : "#FFFFFF";
  return (
    <CareFocusable
      hasTVPreferredFocus={props.preferred}
      onPress={props.onPress}
      onLongPress={props.onLongPress}
      label={props.label}
      look={tone === "plain" ? ON_PAPER : ON_FILL}
      focusedStyle={tone === "plain" ? { backgroundColor: colors.brandSoft } : undefined}
      style={[styles.pill, { backgroundColor: bg }, tone === "plain" ? styles.pillPlain : styles.pillFilled, props.style]}
    >
      {props.icon ? <Icon name={props.icon} size={24} color={tone === "plain" ? colors.brandText : "#FFFFFF"} /> : null}
      <CareText role="label" style={{ color: fg, fontFamily: fonts.sansBold }}>
        {props.label}
      </CareText>
    </CareFocusable>
  );
}

export function Tag(props: { children: React.ReactNode; tone?: "soft" | "brand" | "ok" | "help" | "paper"; icon?: IconName; dot?: boolean; style?: StyleProp<ViewStyle> }) {
  const tone = props.tone ?? "soft";
  const bg = { soft: colors.warm, brand: colors.brandSoft, ok: colors.positiveSoft, help: colors.helpSoft, paper: colors.paper }[tone];
  const fg = { soft: colors.brandText, brand: colors.brandText, ok: colors.positive, help: colors.help, paper: colors.navy }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }, props.style]}>
      {props.icon ? <Icon name={props.icon} size={18} color={fg} /> : null}
      {props.dot ? <View style={[styles.tagDot, { backgroundColor: tone === "ok" ? colors.celadon : colors.persimmon }]} /> : null}
      <Text style={[styles.tagText, { color: fg }]}>{props.children}</Text>
    </View>
  );
}

// --- Pictures ----------------------------------------------------------------

/** A family member's photograph in a circle with a white edge, as on the website. */
export function Portrait({ uri, source, size = 56, ring = 3, style }: { uri?: string | null; source?: number; size?: number; ring?: number; style?: StyleProp<ViewStyle> }) {
  const image = source ?? (uri ? { uri } : null);
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.paper, padding: ring, boxShadow: shadow.soft }, style]}>
      <View style={{ flex: 1, borderRadius: size / 2, overflow: "hidden", backgroundColor: colors.cream }}>
        {image ? <Image source={image} style={{ flex: 1 }} contentFit="cover" transition={200} /> : null}
      </View>
    </View>
  );
}

/** The ripple's thin arcs, the line that joins one family across cities. */
export function OrbitArcs({ width, height, color = colors.hwangto, opacity = 0.62, dotted = false, d }: { width: number; height: number; color?: string; opacity?: number; dotted?: boolean; d: string[] }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={StyleSheet.absoluteFill} pointerEvents="none">
      {d.map((path, i) => (
        <Path key={i} d={path} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={dotted ? 3 : 1.5} strokeLinecap="round" strokeDasharray={dotted ? "0.5 9" : undefined} />
      ))}
    </Svg>
  );
}

/** The screen's ground: the app's canvas warmed at the top like the website's hero, with faint orbits. */
export function Backdrop() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <Defs>
        <RadialGradient id="warm" cx="8%" cy="-10%" r="85%">
          <Stop offset="0" stopColor={colors.hero} stopOpacity={0.95} />
          <Stop offset="0.55" stopColor={colors.warm} stopOpacity={0.6} />
          <Stop offset="1" stopColor={colors.canvas} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="mist" cx="100%" cy="105%" r="60%">
          <Stop offset="0" stopColor={colors.mist} stopOpacity={0.9} />
          <Stop offset="1" stopColor={colors.canvas} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={960} height={540} fill={colors.canvas} />
      <Rect x={0} y={0} width={960} height={540} fill="url(#warm)" />
      <Rect x={0} y={0} width={960} height={540} fill="url(#mist)" />
      <Ellipse cx={760} cy={330} rx={420} ry={250} fill="none" stroke={colors.hwangto} strokeOpacity={0.22} strokeWidth={1} />
      <Ellipse cx={760} cy={330} rx={300} ry={170} fill="none" stroke={colors.hwangto} strokeOpacity={0.16} strokeWidth={1} />
    </Svg>
  );
}

/** A soft fade at the edge of a row or a list that holds more than it shows. */
export function EdgeFade({ side, size = 72, color = colors.canvas, band = 0 }: { side: "left" | "right" | "top" | "bottom"; size?: number; color?: string; band?: number }) {
  const horizontal = side === "left" || side === "right";
  // `band` keeps a side fade inside the cards' own height, so it never steps against the backdrop above or below.
  const pos: ViewStyle =
    side === "left" ? { left: 0, top: band, bottom: band, width: size }
    : side === "right" ? { right: 0, top: band, bottom: band, width: size }
    : side === "top" ? { left: 0, right: 0, top: 0, height: size }
    : { left: 0, right: 0, bottom: 0, height: size };
  const [x1, y1, x2, y2] = side === "left" ? ["1", "0", "0", "0"] : side === "right" ? ["0", "0", "1", "0"] : side === "top" ? ["0", "1", "0", "0"] : ["0", "0", "0", "1"];
  return (
    <View style={[{ position: "absolute" }, pos]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox={horizontal ? "0 0 1 10" : "0 0 10 1"}>
        <Defs>
          <LinearGradient id={`fade-${side}`} x1={x1} y1={y1} x2={x2} y2={y2}>
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={horizontal ? 1 : 10} height={horizontal ? 10 : 1} fill={`url(#fade-${side})`} />
      </Svg>
    </View>
  );
}

/** Where the viewer is in a row: dots and "2 of 4". */
export function Position({ index, count, label }: { index: number; count: number; label: string }) {
  if (count < 1) return null;
  // At most nine dots, a window that follows the current one; the words say the rest.
  const first = Math.max(0, Math.min(index - 4, count - 9));
  const shown = Array.from({ length: Math.min(count, 9) }, (_, k) => first + k);
  return (
    <View style={styles.position} accessibilityLabel={label}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {shown.map((i) => (
          <View key={i} style={[styles.posDot, i === index && styles.posDotOn]} />
        ))}
      </View>
      <CareText role="caption" style={{ color: colors.textSoft, fontFamily: fonts.sansSemi, fontVariant: ["tabular-nums"] }}>
        {label}
      </CareText>
    </View>
  );
}

/** A round arrow at the end of a row: lit when the row holds more that way. */
export function RowArrow({ dir, on, inset = -8 }: { dir: "left" | "right"; on: boolean; inset?: number }) {
  return (
    <View style={[styles.rowArrow, dir === "left" ? { left: inset } : { right: inset }, { opacity: on ? 1 : 0 }]} pointerEvents="none">
      <Icon name={dir === "left" ? "chevron-left" : "chevron-right"} size={30} color={colors.brandText} stroke={2.4} />
    </View>
  );
}

/** A small pill at the bottom edge that says the screen goes on below; it nudges gently unless motion is reduced. */
function MoreCue({ label }: { label: string }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  return (
    <View style={styles.moreCue} pointerEvents="none" accessibilityLabel={label}>
      <Animated.View style={{ transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }}>
        <Icon name="chevron-down" size={24} color={colors.brandText} stroke={2.4} />
      </Animated.View>
      <CareText role="caption" style={{ color: colors.brandText, fontFamily: fonts.sansSemi }}>
        {label}
      </CareText>
    </View>
  );
}

/**
 * A screen that may grow past the TV's height at the larger text sizes. It scrolls
 * as the remote moves focus down, and until the bottom is in view it fades the
 * lower edge and shows a "more below" cue. It is always the same view, so changing
 * the text size never rebuilds the screen or moves the viewer's focus.
 */
export function ScrollStage(props: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  moreLabel: string;
  inset?: number;
  /** Take the content's own height and shrink inside a card, instead of filling the screen. */
  fit?: boolean;
  fade?: string;
  /** Told whether everything fits without scrolling, each time the sizes change. */
  onFit?: (fits: boolean) => void;
}) {
  const { children, contentStyle, moreLabel, inset = 16, fit = false, fade = colors.canvas, onFit } = props;
  const [view, setView] = useState(0);
  const [content, setContent] = useState(0);
  const [y, setY] = useState(0);
  const more = view > 0 && content - (y + view) > 16;
  useEffect(() => {
    if (view > 0 && content > 0) onFit?.(content <= view + 2);
  }, [view, content]);
  return (
    <View style={fit ? { flexShrink: 1, minHeight: 0, marginHorizontal: -inset } : { flex: 1, marginHorizontal: -inset, marginTop: -10 }}>
      <ScrollView
        style={fit ? { flexShrink: 1 } : { flex: 1 }}
        contentContainerStyle={[contentStyle, { flex: 0, flexGrow: 1, paddingHorizontal: inset, paddingTop: fit ? 0 : 10, paddingBottom: 6 }]}
        onLayout={(e) => setView(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContent(h)}
        onScroll={(e) => setY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {more ? (
        <>
          <EdgeFade side="bottom" size={56} color={fade} />
          <MoreCue label={moreLabel} />
        </>
      ) : null}
    </View>
  );
}

/** Three dots that pulse while the companion thinks: a sign of life, not a spinner. */
export function ThinkingDots() {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 3, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce]);
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.thinkDot,
            { opacity: reduce ? 0.7 : v.interpolate({ inputRange: [0, i, i + 0.5, i + 1, 3], outputRange: [0.35, 0.35, 1, 0.35, 0.35], extrapolate: "clamp" }) },
          ]}
        />
      ))}
    </View>
  );
}

export const panel: ViewStyle = { backgroundColor: colors.paper, borderRadius: radius.panel, boxShadow: shadow.soft } as ViewStyle;

const styles = StyleSheet.create({
  pill: { flexDirection: "row", gap: 10, paddingHorizontal: 24, paddingVertical: 11, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  pillPlain: { boxShadow: `inset 0px 0px 0px 1.5px ${colors.rule}, 0px 8px 18px rgba(28, 61, 82, 0.07)` } as ViewStyle,
  pillFilled: { boxShadow: shadow.soft } as ViewStyle,
  tag: { flexDirection: "row", gap: 6, alignItems: "center", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start" },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontFamily: fonts.sansSemi, fontSize: 18, lineHeight: 24 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start" },
  eyebrowPlate: { backgroundColor: colors.paper, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 6, boxShadow: `inset 0px 0px 0px 1px ${colors.heroEdge}` } as ViewStyle,
  eyebrowDot: { width: 9, height: 9, borderRadius: 5 },
  position: { flexDirection: "row", alignItems: "center", gap: 16 },
  posDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.parentRule },
  posDotOn: { width: 34, backgroundColor: colors.action },
  rowArrow: {
    position: "absolute", top: "38%", width: 56, height: 56, borderRadius: 28, backgroundColor: colors.paper,
    alignItems: "center", justifyContent: "center", boxShadow: shadow.lifted,
  } as ViewStyle,
  moreCue: {
    position: "absolute", bottom: 6, right: 20, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.paper, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 6, boxShadow: shadow.lifted,
  } as ViewStyle,
  thinkDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.persimmon },
});
