import React, { useEffect } from "react";
import { Image } from "expo-image";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { ScrollView, StyleSheet, View } from "react-native";

import { CareFocusable, CareText, useFocusReturn, useInterruptibleMedia } from "../../kit/src";
import { api, HubState, Message } from "../api";
import { nowMs, PillButton, Tag } from "../components";
import { Strings } from "../i18n";
import { colors, fonts, radius } from "../theme";

type Props = { s: Strings; hub: HubState; openId: string | null; onOpen: (id: string | null) => void; onHome: () => void };

function ago(iso: string) {
  const mins = Math.max(0, Math.round((nowMs() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

export function Family({ s, hub, openId, onOpen, onHome }: Props) {
  const open = hub.messages.find((m) => m.id === openId) || null;
  if (open) return <Postcard s={s} msg={open} onBack={() => onOpen(null)} />;
  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={styles.head}>
        <CareText role="title" style={{ color: colors.navy }}>
          {s.familyTitle}
        </CareText>
        <PillButton label={s.backHome} onPress={onHome} />
      </View>
      <ScrollView horizontal contentContainerStyle={{ gap: 22, paddingVertical: 14, paddingHorizontal: 4 }}>
        {hub.messages.map((m, i) => (
          <CareFocusable key={m.id} hasTVPreferredFocus={i === 0} onPress={() => onOpen(m.id)} style={styles.card} label={`${s.postcardFrom(m.from_name)}: ${m.text}`}>
            {m.photo ? <Image source={{ uri: api.media(m.photo) }} style={styles.photo} contentFit="cover" /> : <View style={[styles.photo, { backgroundColor: colors.cream }]} />}
            <View style={{ padding: 16, gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold }}>
                  {m.from_name}
                </CareText>
                <CareText role="caption" style={{ color: colors.muted, fontFamily: fonts.sans, flex: 1 }} numberOfLines={1}>
                  {ago(m.at)}
                </CareText>
                {m.video ? <Tag>{`▶ ${s.videoPostcard}`}</Tag> : !m.seen ? <Tag tone="ok">New</Tag> : null}
              </View>
              <CareText role="caption" style={{ color: colors.ink, fontFamily: fonts.sans }} numberOfLines={3}>
                {m.text}
              </CareText>
            </View>
          </CareFocusable>
        ))}
      </ScrollView>
    </View>
  );
}

function Postcard({ s, msg, onBack }: { s: Strings; msg: Message; onBack: () => void }) {
  useEffect(() => {
    if (!msg.seen) api.seen(msg.id).catch(() => {});
  }, [msg.id]);
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: 28 }}>
      <View style={styles.stage}>
        {msg.video ? (
          <VideoPostcard uri={api.media(msg.video)} />
        ) : msg.photo ? (
          <Image source={{ uri: api.media(msg.photo) }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 16, justifyContent: "center" }}>
        <CareText role="label" style={{ color: colors.persimmon, fontFamily: fonts.sansBold }}>
          {s.postcardFrom(msg.from_name)}
        </CareText>
        <CareText role="title" style={{ color: colors.navy }}>
          “{msg.text}”
        </CareText>
        <PillButton label={s.seeAll} onPress={onBack} preferred={!msg.video} style={{ alignSelf: "flex-start" }} />
      </View>
    </View>
  );
}

function VideoPostcard({ uri }: { uri: string }) {
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
        label={isPlaying ? "Pause" : "Play"}
      >
        <CareText role="label" style={{ color: colors.navy, fontFamily: fonts.sansBold }}>
          {isPlaying ? "❚❚  Pause" : "▶  Play"}
        </CareText>
      </CareFocusable>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  card: { width: 300, backgroundColor: colors.paper, borderRadius: radius.card, overflow: "hidden" },
  photo: { width: 300, height: 170 },
  stage: { flex: 1.7, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.cream },
  playBtn: { position: "absolute", left: 20, bottom: 20, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 999, paddingHorizontal: 22, paddingVertical: 10 },
});
