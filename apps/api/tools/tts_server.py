import io
import os
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


class SynthesisRequest(BaseModel):
    text: str


@lru_cache(maxsize=1)
def load_models():
    device = torch.device(DEVICE)
    processor = SpeechT5Processor.from_pretrained(MODEL)
    model = SpeechT5ForTextToSpeech.from_pretrained(MODEL).to(device).eval()
    vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan").to(device).eval()
    speaker_path = hf_hub_download(MODEL, "speaker.npy")
    speaker = torch.from_numpy(np.load(speaker_path)).float().unsqueeze(0).to(device)
    return processor, model, vocoder, speaker


@app.get("/health")
def health():
    load_models()
    return {"ok": True, "model": MODEL, "device": DEVICE}


@app.post("/synthesize")
def synthesize(request: SynthesisRequest):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    if len(text) > 2000:
        raise HTTPException(status_code=413, detail="Text exceeds the 2000-character limit.")

    processor, model, vocoder, speaker = load_models()
    device = next(model.parameters()).device
    inputs = processor(text=text, return_tensors="pt")["input_ids"].to(device)

    with torch.inference_mode():
        speech = model.generate_speech(inputs, speaker, vocoder=vocoder)

    audio = speech.detach().cpu().numpy()
    buffer = io.BytesIO()
    sf.write(buffer, audio, 16000, format="WAV", subtype="PCM_16")
    return Response(content=buffer.getvalue(), media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
