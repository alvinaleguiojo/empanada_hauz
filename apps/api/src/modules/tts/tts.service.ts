import { BadGatewayException, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { dirname, resolve } from "node:path";
import { spawn, ChildProcessByStdio } from "node:child_process";
import { existsSync, mkdir } from "node:fs";
import { Readable } from "node:stream";

@Injectable()
export class TtsService implements OnModuleDestroy {
  private readonly logger = new Logger(TtsService.name);
  private worker?: ChildProcessByStdio<null, Readable, Readable>;
  private workerReady?: Promise<void>;
  private readonly port = Number(process.env.TTS_PORT ?? 8766);
  private readonly model = process.env.TTS_MODEL ?? "Splintir/speecht5_tts-pld-ceb-solo";
  private readonly device = process.env.TTS_DEVICE ?? "cpu";
  private readonly python = this.resolvePython();

  async onModuleDestroy() {
    this.killWorker();
  }

  async synthesize(text: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new ServiceUnavailableException("TTS text is empty.");
    if (trimmed.length > 2000) throw new ServiceUnavailableException("TTS text exceeds the 2000-character limit.");

    await this.ensureWorkerReady();

    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${this.port}/synthesize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
        signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS ?? 120000))
      });
    } catch (error) {
      this.workerReady = undefined;
      this.logger.error(`Local TTS worker request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Local TTS worker is unavailable.");
    }

    if (!response.ok) {
      const payload = await response.text();
      this.logger.warn(`TTS worker returned ${response.status}: ${payload.slice(0, 500)}`);
      throw new BadGatewayException("Local TTS synthesis failed.");
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private killWorker() {
    if (this.worker && !this.worker.killed) this.worker.kill();
    this.worker = undefined;
    this.workerReady = undefined;
  }

  private async ensureWorkerReady() {
    if ((process.env.TTS_ENABLED ?? "true").toLowerCase() === "false") {
      throw new ServiceUnavailableException("Local TTS is disabled.");
    }

    if (!this.workerReady) {
      this.workerReady = this.startWorker().catch((error) => {
        this.workerReady = undefined;
        throw error;
      });
    }

    await this.workerReady;

    try {
      const response = await fetch(`http://127.0.0.1:${this.port}/health`, { signal: AbortSignal.timeout(1500) });
      if (!response.ok) throw new Error(`health ${response.status}`);
    } catch {
      this.workerReady = undefined;
      this.killWorker();
      this.workerReady = this.startWorker().catch((error) => {
        this.workerReady = undefined;
        throw error;
      });
      await this.workerReady;
    }
  }

  private async startWorker(): Promise<void> {
    if (this.worker && !this.worker.killed) return;

    const script = this.resolveWorkerScript();
    if (!existsSync(script)) {
      throw new ServiceUnavailableException(`TTS worker script was not found: ${script}`);
    }

    const cwd = dirname(script);
    this.logger.log(`Starting local Cebuano TTS worker with ${this.python} (${this.model}/${this.device})`);

    await new Promise<void>((resolvePromise, rejectPromise) =>
      mkdir(cwd, { recursive: true }, (error) => (error ? rejectPromise(error) : resolvePromise()))
    );

    const worker = spawn(this.python, [script], {
      cwd,
      env: {
        ...process.env,
        TTS_PORT: String(this.port),
        TTS_MODEL: this.model,
        TTS_DEVICE: this.device
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.worker = worker;

    worker.stdout.on("data", (chunk: Buffer) => this.logger.log(`[worker] ${chunk.toString().trim()}`));
    worker.stderr.on("data", (chunk: Buffer) => this.logger.warn(`[worker] ${chunk.toString().trim()}`));
    worker.once("exit", (code, signal) => {
      this.logger.warn(`Local TTS worker exited (${code ?? "null"}/${signal ?? "null"}).`);
      if (this.worker === worker) {
        this.worker = undefined;
        this.workerReady = undefined;
      }
    });

    const deadline = Date.now() + Number(process.env.TTS_STARTUP_TIMEOUT_MS ?? 180000);
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(`TTS worker exited with code ${worker.exitCode}.`);
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
      }
    }

    worker.kill();
    this.worker = undefined;
    throw new ServiceUnavailableException("Local TTS worker did not start in time. Run the voice setup script or install the Python dependencies and ensure Python is available.");
  }

  private resolvePython() {
    const venvPython = process.platform === "win32"
      ? resolve(process.cwd(), ".venv", "Scripts", "python.exe")
      : resolve(process.cwd(), ".venv", "bin", "python");
    if (existsSync(venvPython)) return venvPython;

    const apiVenvPython = process.platform === "win32"
      ? resolve(process.cwd(), "apps/api/.venv/Scripts/python.exe")
      : resolve(process.cwd(), "apps/api/.venv/bin/python");
    if (existsSync(apiVenvPython)) return apiVenvPython;

    const configured = process.env.TTS_PYTHON?.trim();
    if (configured) return configured;

    return process.platform === "win32" ? "python" : "python3";
  }

  private resolveWorkerScript() {
    const configured = process.env.TTS_SCRIPT_PATH?.trim();
    if (configured) return resolve(configured);

    const candidates = [
      resolve(process.cwd(), "tools", "tts_server.py"),
      resolve(process.cwd(), "apps/api/tools/tts_server.py")
    ];
    const existing = candidates.find((candidate) => existsSync(candidate));
    return existing ?? candidates[1];
  }
}
