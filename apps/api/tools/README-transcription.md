# Local transcription

The API exposes `POST /transcribe` for authenticated administrators. Audio is processed locally with `faster-whisper`; no transcription API is called.

## 1. Install Python dependencies

From the repository root:

```bash
python -m venv .venv-transcription
```

Windows PowerShell:

```powershell
.\.venv-transcription\Scripts\python.exe -m pip install -r apps/api/tools/requirements-transcription.txt
```

macOS/Linux:

```bash
./.venv-transcription/bin/python -m pip install -r apps/api/tools/requirements-transcription.txt
```

Set `TRANSCRIPTION_PYTHON` to that Python executable if `python`/`python3` does not resolve to the environment.

## 2. Configure the API

Optional environment variables:

```text
TRANSCRIPTION_ENABLED=true
TRANSCRIPTION_MODEL=small
TRANSCRIPTION_PYTHON=python
TRANSCRIPTION_DEVICE=cpu
TRANSCRIPTION_COMPUTE_TYPE=int8
TRANSCRIPTION_PORT=8765
TRANSCRIPTION_TIMEOUT_MS=120000
TRANSCRIPTION_STARTUP_TIMEOUT_MS=10000
```

The NestJS service starts the local worker lazily on the first transcription request. The worker loads the configured Whisper model once and keeps it warm for later requests.

For an NVIDIA GPU machine, use:

```text
TRANSCRIPTION_DEVICE=cuda
TRANSCRIPTION_COMPUTE_TYPE=float16
```

and install a compatible CUDA-enabled environment for `faster-whisper`/CTranslate2.

## 3. Call the endpoint

The endpoint requires the existing JWT + admin authentication used by the admin API.

```bash
curl -X POST "http://localhost:3000/transcribe?language=en" \
  -H "Authorization: Bearer <admin-token>" \
  -F "file=@sample.mp3"
```

The `language` query parameter is optional. Leave it out to let Whisper detect the language.

Response shape:

```json
{
  "text": "...",
  "language": "en",
  "languageProbability": 0.98,
  "duration": 7.41,
  "segments": [
    { "start": 0.0, "end": 2.1, "text": "..." }
  ],
  "model": "small"
}
```

The API currently accepts audio uploads up to 25 MB and keeps the transcription worker bound to `127.0.0.1`.
