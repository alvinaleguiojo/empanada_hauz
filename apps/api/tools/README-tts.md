# Local Cebuano TTS

The admin AI voice mode uses the Cebuano-specific `Splintir/speecht5_tts-pld-ceb-solo` model with the MIT license. The SpeechT5 HiFi-GAN vocoder is also MIT-licensed.

The API starts a persistent local Python worker on `127.0.0.1` and exposes the protected `POST /tts` endpoint to authenticated admins.

## Install

From `apps/api`:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" -m pip install -r tools\requirements-tts.txt
```

Use the same Python executable as transcription when needed:

```env
TTS_PYTHON=C:\Users\NEW USER\AppData\Local\Programs\Python\Python313\python.exe
TTS_ENABLED=true
TTS_MODEL=Splintir/speecht5_tts-pld-ceb-solo
TTS_DEVICE=cpu
TTS_PORT=8766
TTS_TIMEOUT_MS=120000
TTS_STARTUP_TIMEOUT_MS=180000
```

The first synthesis downloads the model and vocoder from Hugging Face, then keeps both loaded in memory for later requests. The Cebuano solo checkpoint includes its speaker embedding, so no separate voice file is required.

For a fully offline deployment, pre-download both model repositories into the Hugging Face cache before starting the API.
