"""edge-tts sidecar for Tool_Voxsave.

Reads text from --text or --textfile (UTF-8), synthesizes with Microsoft Edge
neural TTS via the `edge-tts` library, and writes an MP3 to --out.

CLI:
  --text TEXT          Inline text (use --textfile for long input).
  --textfile PATH      Path to UTF-8 .txt file containing the input text.
  --voice NAME         edge-tts voice (default: ko-KR-SunHiNeural).
  --rate STR           Rate, e.g. "+0%", "-10%", "+25%".
  --pitch STR          Pitch, e.g. "+0Hz", "-5Hz", "+10Hz".
  --out PATH           Output .mp3 path (required unless --list).
  --list               Print available voices as JSON and exit.

Exit codes:
  0  success
  2  bad arguments / empty text
  3  edge-tts runtime error
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import edge_tts


def _read_text(args: argparse.Namespace) -> str:
    if args.textfile:
        return Path(args.textfile).read_text(encoding="utf-8")
    if args.text is not None:
        return args.text
    return ""


async def _list_voices() -> int:
    voices = await edge_tts.list_voices()
    json.dump(voices, sys.stdout, ensure_ascii=False)
    return 0


async def _synthesize(text: str, voice: str, rate: str, pitch: str, out: str) -> int:
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(out)
    return 0


def main() -> int:
    p = argparse.ArgumentParser(prog="edge-tts-sidecar")
    p.add_argument("--text")
    p.add_argument("--textfile")
    p.add_argument("--voice", default="ko-KR-SunHiNeural")
    p.add_argument("--rate", default="+0%")
    p.add_argument("--pitch", default="+0Hz")
    p.add_argument("--out")
    p.add_argument("--list", action="store_true")
    args = p.parse_args()

    if args.list:
        return asyncio.run(_list_voices())

    text = _read_text(args).strip()
    if not text:
        print("error: empty text (use --text or --textfile)", file=sys.stderr)
        return 2
    if not args.out:
        print("error: --out is required", file=sys.stderr)
        return 2

    try:
        return asyncio.run(
            _synthesize(text, args.voice, args.rate, args.pitch, args.out)
        )
    except Exception as e:  # noqa: BLE001 - surface any TTS error to caller
        print(f"edge-tts error: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
