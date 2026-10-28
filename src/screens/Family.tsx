import React, { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { ScrollView, ScrollViewInstance, StyleSheet, View, ViewStyle } from "react-native";

import { CareFocusable, CareText, useFocusReturn, useInterruptibleMedia, useTypeScale } from "@ebenworks/tv-care-kit";
import { api, HubState, Message } from "../api";
import { EdgeFade, Eyebrow, Headline, Icon, nowMs, ON_PAPER, OrbitArcs, panel, PillButton, Portrait, Position, Rise, RowArrow, ScrollStage, Tag } from "../components";
import { Strings } from "../i18n";
import { colors, fonts, radius, shadow } from "../theme";

type Props = {
  s: Strings;
  lang: "en" | "ko";
  hub: HubState;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onHome: () => void;
  /** Called once the hub has marked a postcard seen, so the row and the home count both update. */
  onSeen: () => void;
};

const CARD = 300;
const GAP = 24;
/** How much of the previous postcard stays in view, under the left arrow. */
const PEEK = 64;

function ago(iso: string, s: Strings) {
  const mins = Math.max(0, Math.round((nowMs() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return s.justNow;
  if (mins < 60) return s.minAgo(mins);
  if (mins < 60 * 24) return s.hAgo(Math.round(mins / 60));
  return s.dAgo(Math.round(mins / 1440));
}

export function Family({ s, lang, hub, openId, onOpen, onHome, onSeen }: Props) {
  const { size } = useTypeScale();
  // Larger words take room from the photographs, so the whole row and its position stay on screen.
  const photoHeight = size === "large" ? 148 : size === "larger" ? 124 : 100;
  // Focus enters on the first postcard, and comes back to the one the parent opened. That
  // choice is fixed while the parent browses, so a new postcard arriving at the front, or a
  // held arrow key, never pulls focus back. focusId only drives the arrows and "2 of 4".
  const [focusId, setFocusId] = useState<string | null>(null);
  const startId = useRef<string | null>(hub.messages[0]?.id ?? null);
  const openedId = useRef<string | null>(null);
  const row = useRef<ScrollViewInstance>(null);
  const count = hub.messages.length;
  const unseen = hub.messages.filter((m) => !m.seen).length;
  const index = Math.max(0, hub.messages.findIndex((m) => m.id === focusId));
  const offset = (i: number) => Math.max(0, i * (CARD + GAP) - (i > 0 ? PEEK : 0));
  useEffect(() => {
    if (focusId) row.current?.scrollTo({ x: offset(index), animated: false });
  }, [count]);
  const open = hub.messages.find((m) => m.id === openId) || null;
  const photoOf = (m: Message) => {
    const f = hub.family.find((p) => p.id === m.from);
    return f?.photo ? api.media(f.photo) : null;
  };
  if (open) return <Postcard s={s} msg={open} portrait={photoOf(open)} onBack={() => onOpen(null)} onSeen={onSeen} />;

  // Each press of left or right moves one postcard and the row follows, so the
  // focused card always sits whole in view with its neighbours peeking.
  const focusCard = (i: number, id: string) => {
    setFocusId(id);
    row.current?.scrollTo({ x: offset(i), animated: true });
  };

  return (
    <View style={{ flex: 1 }}>
      <Rise i={0} style={styles.head}>
        <View style={{ gap: 6 }}>
          {/* The same count of new postcards as the home screen, so the two always agree. */}
          <Eyebrow icon="mail">{unseen ? s.postcardsNew(count, unseen) : s.postcards(count)}</Eyebrow>
          <Headline role="title">{s.familyTitle}</Headline>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 22 }}>
          {size === "large" ? <FamilyOrbit hub={hub} lang={lang} /> : null}
          <PillButton label={s.backHome} icon="arrow-left" onPress={onHome} />
        </View>
      </Rise>

      {count === 0 ? (
        <Rise i={1} style={styles.empty}>
          <Icon name="mail" size={40} color={colors.brandText} />
          <Headline role="heading" style={{ textAlign: "center" }}>
            {s.noPostcards}
          </Headline>
        </Rise>
      ) : null}
      <Rise i={1} style={[styles.rowWrap, count === 0 && { display: "none" }]}>
        <ScrollView ref={row} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowInner} scrollEnabled={false}>
          {hub.messages.map((m, i) => (
            <CareFocusable
              key={m.id}
              hasTVPreferredFocus={m.id === (openedId.current ?? startId.current)}
              onFocus={() => focusCard(i, m.id)}
              onPress={() => {
                openedId.current = m.id;
                onOpen(m.id);
              }}
              style={styles.card}
              look={ON_PAPER}
              label={`${m.seen ? "" : `${s.newTag}. `}${s.postcardFrom(m.from_name)}, ${ago(m.at, s)}: ${m.text}. ${s.position(i + 1, count)}`}
            >
              <View style={[styles.cardPhoto, { height: photoHeight }]}>
                {m.photo ? <Image source={{ uri: api.media(m.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.hero }]} />}
                <View style={styles.cardTags}>
                  {!m.seen ? (
                    <Tag tone="brand" dot style={styles.photoTag}>
                      {s.newTag}
                    </Tag>
                  ) : null}
                  {m.video ? (
                    <Tag tone="paper" icon="video" style={styles.photoTag}>
                      {s.videoPostcard}
                    </Tag>
                  ) : null}
                </View>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardWho}>
                  <Portrait uri={photoOf(m)} size={56} style={{ marginTop: -36 }} />
                  <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold, flexShrink: 0 }} numberOfLines={1}>
                    {m.from_name}
                  </CareText>
                  <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sans, marginLeft: "auto", flexShrink: 1 }} numberOfLines={1}>
                    {ago(m.at, s)}
                  </CareText>
                </View>
                <CareText role="caption" style={{ color: colors.textSoft, fontFamily: fonts.sans }} numberOfLines={2}>
                  {m.text}
                </CareText>
              </View>
            </CareFocusable>
          ))}
        </ScrollView>
        {index > 0 ? <EdgeFade side="left" size={PEEK + 16} band={18} /> : null}
        {index < count - 1 ? <EdgeFade side="right" size={96} band={18} /> : null}
        <RowArrow dir="left" on={index > 0} inset={20} />
        <RowArrow dir="right" on={index < count - 1} inset={20} />
      </Rise>

      <Rise i={2} style={[styles.foot, count === 0 && { display: "none" }]}>
        <Position index={index} count={count} label={s.position(index + 1, count)} />
        <View style={styles.hint}>
          <Icon name="chevron-left" size={22} color={colors.textSoft} stroke={2.2} />
          <Icon name="chevron-right" size={22} color={colors.textSoft} stroke={2.2} />
          <CareText role="caption" style={{ color: colors.textSoft, fontFamily: fonts.sans }}>
            {s.browseHint}
          </CareText>
        </View>
      </Rise>
    </View>
  );
}

/** The family's faces on one orbit, each with the city they write from. */
function FamilyOrbit({ hub, lang }: { hub: HubState; lang: "en" | "ko" }) {
  const people = hub.family.slice(0, 3);
  const w = people.length * 156;
  return (
    <View style={{ width: w, height: 84, flexDirection: "row" }}>
      <OrbitArcs width={w} height={84} dotted d={[`M40,30 Q${w / 2},-6 ${w - 40},30`]} />
      {people.map((p) => (
        <View key={p.id} style={{ width: 156, alignItems: "center", gap: 2 }}>
          <Portrait uri={p.photo ? api.media(p.photo) : null} size={52} />
          <CareText role="caption" style={{ color: colors.navy, fontFamily: fonts.sansSemi }} numberOfLines={1}>
            {`${p.name} · ${lang === "ko" && p.city_ko ? p.city_ko : p.city}`}
          </CareText>
        </View>
      ))}
    </View>
  );
}

function Postcard({ s, msg, portrait, onBack, onSeen }: { s: Strings; msg: Message; portrait: string | null; onBack: () => void; onSeen: () => void }) {
  useEffect(() => {
    if (!msg.seen) api.seen(msg.id).then(onSeen).catch(() => {});
  }, [msg.id]);
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: 32 }}>
      <Rise i={0} style={styles.stage}>
        {msg.video ? (
          <>
            {msg.photo ? <Image source={{ uri: api.media(msg.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            <VideoPostcard s={s} uri={api.media(msg.video)} />
          </>
        ) : msg.photo ? (
          <Image source={{ uri: api.media(msg.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </Rise>
      <Rise i={1} style={{ flex: 1 }}>
        <ScrollStage moreLabel={s.moreBelow} contentStyle={{ gap: 16, justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 96, height: 96, alignItems: "center", justifyContent: "center" }}>
            <OrbitArcs width={96} height={96} d={["M6,60 A44,44 0 0 1 60,6", "M90,36 A44,44 0 0 1 36,90"]} />
            <Portrait uri={portrait} size={76} />
          </View>
          <View style={{ gap: 4, flexShrink: 1 }}>
            <Eyebrow plate={false}>{s.postcardFrom(msg.from_name)}</Eyebrow>
            <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sans }}>
              {ago(msg.at, s)}
            </CareText>
          </View>
        </View>
        <Headline role="title">“{msg.text}”</Headline>
        <PillButton label={s.seeAll} icon="arrow-left" onPress={onBack} preferred={!msg.video} style={{ alignSelf: "flex-start" }} />
        </ScrollStage>
      </Rise>
    </View>
  );
}

function VideoPostcard({ s, uri }: { s: Strings; uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const report = useInterruptibleMedia("postcard-video", player);
  useEffect(() => report(isPlaying), [isPlaying, report]);
  const focusHere = useFocusReturn();
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <CareFocusable
        hasTVPreferredFocus={focusHere}
        onPress={() => (player.playing ? player.pause() : player.play())}
        style={styles.playBtn}
        look={ON_PAPER}
        focusedStyle={{ backgroundColor: colors.brandSoft }}
        label={isPlaying ? s.pause : s.play}
      >
        <Icon name={isPlaying ? "pause" : "play"} size={26} color={colors.brandText} stroke={2.2} />
        <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold }}>
          {isPlaying ? s.pause : s.play}
        </CareText>
      </CareFocusable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  rowWrap: { marginTop: 4, marginHorizontal: -40 },
  rowInner: { gap: GAP, paddingVertical: 18, paddingHorizontal: 40 },
  card: { ...panel, width: CARD, borderRadius: 32, overflow: "hidden" } as ViewStyle,
  cardPhoto: { width: CARD },
  cardTags: { position: "absolute", top: 14, left: 14, flexDirection: "row", gap: 8 },
  photoTag: { paddingVertical: 4, boxShadow: shadow.lifted } as ViewStyle,
  cardBody: { paddingHorizontal: 18, paddingBottom: 16, paddingTop: 6, gap: 4 },
  cardWho: { flexDirection: "row", alignItems: "center", gap: 10 },
  foot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  empty: { ...panel, marginTop: 24, alignItems: "center", justifyContent: "center", gap: 14, paddingVertical: 48, paddingHorizontal: 60 } as ViewStyle,
  hint: { flexDirection: "row", alignItems: "center", gap: 4 },
  stage: { flex: 1.7, borderRadius: radius.panel, overflow: "hidden", backgroundColor: colors.hero, boxShadow: shadow.soft } as ViewStyle,
  playBtn: {
    position: "absolute", left: 22, bottom: 22, flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 10,
  },
});
