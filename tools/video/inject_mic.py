#!/usr/bin/env python3
"""Plays a WAV file into the Android emulator's microphone through the emulator's gRPC API.

    python3 tools/video/inject_mic.py ANSWER.wav [--port 8566]

The emulator must be started with `-grpc <port>`. This is how the demo film
gives the TV app a spoken answer: the app records from its microphone exactly
as it would on a Fire TV, and the hub transcribes what it heard. Needs the
Python stubs generated from the SDK's emulator/lib/emulator_controller.proto
(`python -m grpc_tools.protoc ... emulator_controller.proto`) on PYTHONPATH.
"""
import argparse
import subprocess
import time

import grpc

import emulator_controller_pb2 as pb
import emulator_controller_pb2_grpc as rpc

RATE = 16000
CHUNK = RATE // 50  # 20 ms of 16-bit mono


def pcm(path: str) -> bytes:
    """Decode any audio file to 16 kHz mono signed 16-bit PCM with ffmpeg."""
    return subprocess.check_output(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(RATE), "-f", "s16le", "-"])


def packets(data: bytes, lead_silence: float):
    fmt = pb.AudioFormat(samplingRate=RATE, channels=pb.AudioFormat.Mono, format=pb.AudioFormat.AUD_FMT_S16, mode=pb.AudioFormat.MODE_REAL_TIME)
    data = b"\0" * int(RATE * 2 * lead_silence) + data + b"\0" * int(RATE * 2 * 0.4)
    start = time.time()
    for i in range(0, len(data), CHUNK * 2):
        due = start + (i / 2) / RATE
        delay = due - time.time()
        if delay > 0:
            time.sleep(delay)
        yield pb.AudioPacket(format=fmt, timestamp=int(time.time() * 1e6), audio=data[i : i + CHUNK * 2])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("wav")
    ap.add_argument("--port", type=int, default=8566)
    ap.add_argument("--lead", type=float, default=0.3, help="seconds of silence before the speech")
    args = ap.parse_args()
    channel = grpc.insecure_channel(f"localhost:{args.port}")
    rpc.EmulatorControllerStub(channel).injectAudio(packets(pcm(args.wav), args.lead))
    print("injected", args.wav)
