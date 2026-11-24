"""Kokoro-82M v1.1-zh narration (Apache-2.0) through kokoro-onnx, called by voice.ts.

Reads one JSON request on stdin: {text, voice, speed, seed, model_dir, out, pronunciation: [{term, reading}]}. Term readings
replace the terms before grapheme-to-phoneme conversion (misaki zh, with misaki en and the bundled espeak-ng for English
words). The decoder injects noise, so ONNX Runtime is seeded first: the same request gives the same samples.
Sentences are synthesized one by one and joined with a short pause. Writes a 24 kHz float WAV to `out` and prints
{sample_rate, reading_text, phonemes, model_sha256, voices_sha256} as JSON.
"""
import hashlib
import json
import re
import sys
import warnings

warnings.filterwarnings("ignore")

import espeakng_loader  # noqa: E402
import numpy as np  # noqa: E402
import onnxruntime  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro_onnx import Kokoro  # noqa: E402
from phonemizer.backend.espeak.wrapper import EspeakWrapper  # noqa: E402

EspeakWrapper.set_library(espeakng_loader.get_library_path())
EspeakWrapper.set_data_path(espeakng_loader.get_data_path())
from misaki import en, espeak, zh  # noqa: E402

MODEL, VOICES = "kokoro-v1.1-zh.onnx", "voices-v1.1-zh.bin"
SENTENCE = re.compile(r"[^。！？；!?;]+[。！？；!?;]*")
PAUSE_SECONDS = 0.28


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def main():
    req = json.load(sys.stdin)
    onnxruntime.set_seed(int(req.get("seed", 0)))
    text = req["text"]
    for item in sorted(req.get("pronunciation", []), key=lambda p: -len(p["term"])):
        text = text.replace(item["term"], item["reading"])
    english = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
    g2p = zh.ZHG2P(version="1.1", en_callable=lambda t: english(t)[0])
    model_dir = req["model_dir"]
    kokoro = Kokoro(f"{model_dir}/{MODEL}", f"{model_dir}/{VOICES}")
    pieces, phonemes, rate = [], [], 24000
    for sentence in (s.strip() for s in SENTENCE.findall(text)):
        if not sentence:
            continue
        ph, _ = g2p(sentence)
        audio, rate = kokoro.create(ph, voice=req["voice"], speed=req["speed"], is_phonemes=True)
        if pieces:
            pieces.append(np.zeros(int(rate * PAUSE_SECONDS), dtype=np.float32))
        pieces.append(audio.astype(np.float32))
        phonemes.append(ph)
    sf.write(req["out"], np.concatenate(pieces), rate, subtype="FLOAT")
    print(json.dumps({"sample_rate": rate, "reading_text": text, "phonemes": " ".join(phonemes),
                      "model_sha256": sha256(f"{model_dir}/{MODEL}"), "voices_sha256": sha256(f"{model_dir}/{VOICES}")},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
