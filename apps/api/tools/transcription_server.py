import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel
import uvicorn

HOST = "127.0.0.1"
PORT = int(os.getenv("TRANSCRIPTION_PORT", "8765"))
DEFAULT_MODEL = os.getenv("TRANSCRIPTION_MODEL", "small")
DEVICE = os.getenv("TRANSCRIPTION_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("TRANSCRIPTION_COMPUTE_TYPE", "int8" if DEVICE == "cpu" else "float16")
CPU_THREADS = int(os.getenv("TRANSCRIPTION_CPU_THREADS", "4"))
MAX_BYTES = 25 * 1024 * 1024

app = FastAPI(title="Empanada Hauz Local Transcription")
_models: dict[tuple[str, str, str], WhisperModel] = {}


def get_model(name: str) -> WhisperModel:
    key = (name, DEVICE, COMPUTE_TYPE)
    if key not in _models:
        print(f"Loading Whisper model: {name} ({DEVICE}/{COMPUTE_TYPE})", flush=True)
        _models[key] = WhisperModel(
            name,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            cpu_threads=CPU_THREADS,
        )
    return _models[key]


@app.get("/health")
def health():
    return {"ok": True, "model": DEFAULT_MODEL, "device": DEVICE, "computeType": COMPUTE_TYPE}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    model: str | None = Form(None),
):
    safe_name = Path(file.filename or "audio.bin").name
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Audio file is empty.")
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Audio file exceeds the 25 MB limit.")

    suffix = Path(safe_name).suffix or ".bin"
    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(contents)
            temp_path = temp.name

        whisper = get_model((model or DEFAULT_MODEL).strip() or DEFAULT_MODEL)
        segments, info = whisper.transcribe(
            temp_path,
            language=language.strip() if language and language.strip() else None,
            task="transcribe",
            vad_filter=True,
            beam_size=5,
            condition_on_previous_text=False,
        )

        normalized = []
        parts = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            normalized.append({
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "text": text,
            })
            parts.append(text)

        return {
            "text": " ".join(parts).strip(),
            "language": getattr(info, "language", None),
            "languageProbability": round(float(getattr(info, "language_probability", 0.0)), 4),
            "duration": round(float(getattr(info, "duration", 0.0)), 3),
            "segments": normalized,
            "model": model or DEFAULT_MODEL,
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Transcription error: {exc}", flush=True)
        raise HTTPException(status_code=500, detail="Transcription failed.") from exc
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
