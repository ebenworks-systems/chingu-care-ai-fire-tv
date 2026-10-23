/**
 * React Native bindings for the kit: a focusable card with a visible ring,
 * a type scale provider and the interrupt-and-resume overlay.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextStyle, TVFocusGuideView, useWindowDimensions, View, ViewStyle } from "react-native";

import { DEFAULT_FOCUS, FocusLook, focusStyle } from "./focus";
import { Interrupt, InterruptState, initialInterruptState, interruptReducer, mediaCommands } from "./interrupt";
import { TextSize, TypeRole, lineHeight, typeSize } from "./typeScale";

// --- Type scale ------------------------------------------------------------

type TypeContextValue = { size: TextSize; setSize: (s: TextSize) => void; families: Partial<Record<TypeRole, string>> };
const TypeContext = createContext<TypeContextValue>({ size: "large", setSize: () => {}, families: {} });

export function TypeScaleProvider(props: {
  children: React.ReactNode;
  initial?: TextSize;
  families?: Partial<Record<TypeRole, string>>;
}) {
  const [size, setSize] = useState<TextSize>(props.initial ?? "large");
  const value = useMemo(() => ({ size, setSize, families: props.families ?? {} }), [size, props.families]);
  return <TypeContext.Provider value={value}>{props.children}</TypeContext.Provider>;
}

export function useTypeScale() {
  return useContext(TypeContext);
}

/** Text at a role of the 10-foot scale. */
export function CareText(props: {
  role?: TypeRole;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
  /** "polite" makes screen readers such as VoiceView read the text when it changes. */
  live?: "polite" | "assertive";
}) {
  const { size, families } = useTypeScale();
  const { width } = useWindowDimensions();
  const role = props.role ?? "body";
  const fontSize = typeSize(role, size, width);
  return (
    <Text
      accessibilityLiveRegion={props.live}
      numberOfLines={props.numberOfLines}
      style={[{ fontSize, lineHeight: lineHeight(role, fontSize), fontFamily: families[role] }, props.style]}
    >
      {props.children}
    </Text>
  );
}

// --- Focus -----------------------------------------------------------------

export type CareFocusableProps = Omit<PressableProps, "style" | "children"> & {
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  look?: FocusLook;
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
  /** Spoken or shown name for screen readers such as VoiceView or TalkBack. */
  label?: string;
};

/** A D-pad target whose focus is visible from across the room. */
export function CareFocusable({ style, focusedStyle, look = DEFAULT_FOCUS, children, label, onFocus, onBlur, ...rest }: CareFocusableProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={label}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[styles.focusBase, style, focusStyle(focused, look) as ViewStyle, focused && focusedStyle]}
    >
      {typeof children === "function" ? children(focused) : children}
    </Pressable>
  );
}

// --- Interrupt and resume ---------------------------------------------------

type Player = { play: () => void; pause: () => void };

type InterruptContextValue = {
  state: InterruptState;
  raise: (i: Interrupt) => void;
  answer: (actionId: string) => void;
  report: (id: string, playing: boolean) => void;
  register: (id: string, player: Player) => () => void;
};

const InterruptContext = createContext<InterruptContextValue | null>(null);

export function InterruptProvider(props: { children: React.ReactNode; onAnswer?: (interrupt: Interrupt, actionId: string) => void }) {
  const players = useRef(new Map<string, Player>());
  const prev = useRef<InterruptState>(initialInterruptState);
  const [state, dispatch] = useReducer(interruptReducer, initialInterruptState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const onAnswerRef = useRef(props.onAnswer);
  onAnswerRef.current = props.onAnswer;

  // Screen readers announce a reminder the moment it takes the screen.
  useEffect(() => {
    if (state.active) AccessibilityInfo.announceForAccessibility(state.active.body ? `${state.active.title}. ${state.active.body}` : state.active.title);
  }, [state.active?.id]);

  useEffect(() => {
    const { pause, play } = mediaCommands(prev.current, state);
    pause.forEach((id) => players.current.get(id)?.pause());
    play.forEach((id) => players.current.get(id)?.play());
    prev.current = state;
  }, [state]);

  // These stay the same object for the provider's life, so a player that
  // registers in an effect is not torn down and re-registered on every change.
  const raise = useCallback((interrupt: Interrupt) => dispatch({ type: "raise", interrupt }), []);
  const answer = useCallback((actionId: string) => {
    const active = stateRef.current.active;
    if (active) onAnswerRef.current?.(active, actionId);
    dispatch({ type: "answer", actionId });
  }, []);
  const report = useCallback((id: string, playing: boolean) => dispatch({ type: "media", media: { id, playing } }), []);
  const register = useCallback((id: string, player: Player) => {
    players.current.set(id, player);
    return () => {
      players.current.delete(id);
      dispatch({ type: "media-gone", id });
    };
  }, []);

  const value = useMemo<InterruptContextValue>(() => ({ state, raise, answer, report, register }), [state, raise, answer, report, register]);
  return <InterruptContext.Provider value={value}>{props.children}</InterruptContext.Provider>;
}

export function useInterrupts() {
  const ctx = useContext(InterruptContext);
  if (!ctx) throw new Error("useInterrupts must be used inside <InterruptProvider>");
  return ctx;
}

/**
 * Register a player so reminders can pause and resume it.
 * Call `report(true|false)` whenever the player starts or stops by itself.
 */
export function useInterruptibleMedia(id: string, player: Player | null) {
  const { register, report } = useInterrupts();
  const playerRef = useRef(player);
  playerRef.current = player;
  const hasPlayer = player !== null;
  useEffect(() => {
    if (!hasPlayer) return;
    return register(id, {
      play: () => playerRef.current?.play(),
      pause: () => playerRef.current?.pause(),
    });
  }, [id, register, hasPlayer]);
  return useCallback((playing: boolean) => report(id, playing), [id, report]);
}

/**
 * True when no interrupt is showing. Pass it to `hasTVPreferredFocus` on the
 * control the viewer was using, so focus goes back there when the reminder closes
 * instead of jumping to the first focusable view on screen.
 */
export function useFocusReturn() {
  return useInterrupts().state.active === null;
}

/** The overlay for the active interrupt. Focus stays inside it until the viewer answers. */
export function InterruptOverlay(props: {
  render?: (interrupt: Interrupt, answer: (id: string) => void) => React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  bodyStyle?: StyleProp<TextStyle>;
  actionStyle?: StyleProp<ViewStyle>;
  actionTextStyle?: StyleProp<TextStyle>;
}) {
  const { state, answer } = useInterrupts();
  const active = state.active;
  if (!active) return null;
  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      {props.render ? (
        props.render(active, answer)
      ) : (
        <View style={[styles.card, props.cardStyle]}>
          <CareText role="title" style={props.titleStyle}>
            {active.title}
          </CareText>
          {active.body ? (
            <CareText role="body" style={props.bodyStyle}>
              {active.body}
            </CareText>
          ) : null}
          <TVFocusGuideView autoFocus trapFocusUp trapFocusDown trapFocusLeft trapFocusRight style={styles.actions}>
            {active.actions.map((a, i) => (
              <CareFocusable key={a.id} hasTVPreferredFocus={i === 0} onPress={() => answer(a.id)} style={props.actionStyle} label={a.label}>
                <CareText role="label" style={props.actionTextStyle}>
                  {a.label}
                </CareText>
              </CareFocusable>
            ))}
          </TVFocusGuideView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  focusBase: { borderRadius: 20 },
  scrim: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(250, 246, 240, 0.86)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: { backgroundColor: "#FFFFFF", borderRadius: 28, padding: 36, minWidth: 520, gap: 16 },
  actions: { flexDirection: "row", gap: 20, marginTop: 12 },
});
