import { useCallback, useEffect, useRef, useState } from "react";
import { AudioPlayer, createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";

import { api } from "./api";

/** Chingu's voice: the hub turns text into speech and the TV plays it. */
export function useSpeech() {
  const player = useRef<AudioPlayer | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    player.current?.pause();
    player.current?.remove();
    player.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      stop();
      const p = createAudioPlayer({ uri: api.ttsUrl(text) });
      player.current = p;
      setSpeaking(true);
      p.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) setSpeaking(false);
      });
      p.play();
    },
    [stop],
  );

  useEffect(() => stop, [stop]);
  return { speak, stop, speaking };
}

/** The parent's voice: record on the TV, transcribe on the hub. */
export function useListen() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [listening, setListening] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const start = useCallback(async () => {
    if (allowed === null || allowed === false) {
      const perm = await requestRecordingPermissionsAsync();
      setAllowed(perm.granted);
      if (!perm.granted) return false;
    }
    await setAudioModeAsync({ allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setListening(true);
    return true;
  }, [allowed, recorder]);

  const finish = useCallback(async (): Promise<string> => {
    if (!listening) return "";
    await recorder.stop();
    setListening(false);
    await setAudioModeAsync({ allowsRecording: false });
    const uri = recorder.uri;
    if (!uri) throw new Error("the recorder gave no file");
    // Android uploads need a file:// address; some recorder versions return a bare path.
    return api.asr(uri.startsWith("file://") ? uri : `file://${uri}`);
  }, [listening, recorder]);

  return { start, finish, listening, allowed };
}
