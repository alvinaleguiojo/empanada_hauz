import io
import os
import threading
from functools import lru_cache

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from huggingface_hub import hf_hub_download
from pydantic import BaseModel
from transformers import SpeechT5ForTextToSpeech, SpeechT5HifiGan, SpeechT5Processor
import uvicorn

PORT = int(os.getenv("TTS_PORT", "8766"))
MODEL = os.getenv("TTS_MODEL", "Splintir/speecht5_tts-pld-ceb-solo")
DEVICE = os.getenv("TTS_DEVICE", "cpu")

app = FastAPI(title="Empanada Hauz Cebuano TTS")
_models_lock = threading.Lock()


class SynthesisRequest(BaseModel):
    text: str


@lru_cache(maxsize=1)
def _load_models_once():
    print(f"Loading Cebuano TTS models: {MODEL} ({DEVICE})", flush=True)
    device = torch.device(DEVICE)
    processor = SpeechT5Processor.from_pretrained(MODEL)
    model = SpeechT5ForTextToSpeech.from_pretrained(MODEL).to(device).eval()
    vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan").to(device).eval()
    speaker_path = hf_hub_download(MODEL, "speaker.npy")
    speaker = torch.from_numpy(np.load(speaker_path)).float().unsqueeze(0).to(device)
    print("Cebuano TTS models ready", flush=True)
    return processor, model, vocoder, speaker


def load_models():
    with _models_lock:
        return _load_models_once()


@app.get("/health")
def health():
    return {"ok": True, "model": MODEL, "device": DEVICE}


@app.get("/ready")
def ready():
    try:
        load_models()
        return {"ok": True, "ready": True, "model": MODEL, "device": DEVICE}
    except Exception as error:
        print(f"TTS model load failed: {type(error).__name__}: {error}", flush=True)
        raise HTTPException(status_code=503, detail=f"TTS model is not ready: {error}") from error


@app.post("/synthesize")
def synthesize(request: SynthesisRequest):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    if len(text) > 2000:
        raise HTTPException(status_code=413, detail="Text exceeds the 2000-character limit.")

    try:
        print(f"Synthesizing Cebuano TTS: {len(text)} chars", flush=True)
        processor, model, vocoder, speaker = load_models()
        device = next(model.parameters()).device
        inputs = processor(text=text, return_tensors="pt")["input_ids"].to(device)

        with torch.inference_mode():
            speech = model.generate_speech(inputs, speaker, vocoder=vocoder)

        audio = speech.detach().cpu().numpy()
        buffer = io.BytesIO()
        sf.write(buffer, audio, 16000, format="WAV", subtype="PCM_16")
        print("Cebuano TTS synthesis complete", flush=True)
        return Response(content=buffer.getvalue(), media_type="audio/wav")
    except Exception as error:
        print(f"TTS synthesis failed: {type(error).__name__}: {error}", flush=True)
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {error}") from error


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
