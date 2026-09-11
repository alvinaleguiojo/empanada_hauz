$ErrorActionPreference = "Stop"

$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Split-Path -Parent $toolsDir
$venvDir = Join-Path $apiDir ".venv"
$python = Join-Path $venvDir "Scripts\python.exe"
$requirements = Join-Path $toolsDir "requirements-tts.txt"
$transcriptionRequirements = Join-Path $toolsDir "requirements-transcription.txt"

Write-Host "== Empanada Hauz voice setup (Windows) =="

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw "Python launcher 'py' was not found. Install Python 3.11+ and enable the Python launcher."
}

if (-not (Test-Path $python)) {
  Write-Host "Creating Python virtual environment at $venvDir..."
  & py -3 -m venv $venvDir
}

Write-Host "Upgrading pip..."
& $python -m pip install --upgrade pip

Write-Host "Installing transcription dependencies..."
& $python -m pip install -r $transcriptionRequirements

Write-Host "Installing TTS dependencies..."
& $python -m pip install -r $requirements

Write-Host "Checking soundfile import..."
& $python -c "import soundfile as sf; print('soundfile OK:', sf.__version__)"

Write-Host "Checking torch import..."
& $python -c "import torch; print('torch OK:', torch.__version__)"

Write-Host "Voice Python environment is ready."
Write-Host "The API will automatically use $python when TTS_PYTHON is not set."
