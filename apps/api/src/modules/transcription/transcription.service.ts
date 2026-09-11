import { BadGatewayException, Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { dirname, resolve } from "node:path";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdir } from "node:fs";
import { TranscriptionResult } from "./transcription.types";

@Injectable()
export class TranscriptionService implements OnModuleDestroy {
  private readonly logger = new Logger(TranscriptionService.name);
  private worker?: ChildProcessWithoutNullStreams;
  private workerReady?: Promise<void>;
  private readonly port = Number(process.env.TRANSCRIPTION_PORT ?? 8765);
  private readonly model = process.env.TRANSCRIPTION_MODEL ?? "small";
  private readonly python = process.env.TRANSCRIPTION_PYTHON ?? (process.platform === "win32" ? "python" : "python3");

  async onModuleDestroy() {
    if (this.worker && !this.worker.killed) this.worker.kill();
  }

  async transcribe(buffer: Buffer, filename: string, mimeType?: string, language?: string) {
    if (!buffer.length) throw new ServiceUnavailableException("Audio file is empty.");
    await this.ensureWorkerReady();

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType || "application/octet-stream" }), filename || "audio.bin");
    if (language?.trim()) form.append("language", language.trim());

    let response: Response;
    try {
      response = await fetch(`http://127.0.0.1:${this.port}/transcribe`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(Number(process.env.TRANSCRIPTION_TIMEOUT_MS ?? 120000))
      });
    } catch (error) {
      this.logger.error(`Local transcription worker request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Local transcription worker is unavailable.");
    }

    const payload = await response.text();
    if (!response.ok) {
      this.logger.warn(`Transcription worker returned ${response.status}: ${payload.slice(0, 500)}`);
      throw new BadGatewayException("Local transcription failed.");
    }

    try {
      return JSON.parse(payload) as TranscriptionResult;
    } catch {
      throw new BadGatewayException("Local transcription returned invalid data.");
    }
  }

  private async ensureWorkerReady() {
    if ((process.env.TRANSCRIPTION_ENABLED ?? "true").toLowerCase() === "false") {
      throw new ServiceUnavailableException("Local transcription is disabled.");
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
    const cwd = dirname(script);
    this.logger.log(`Starting local transcription worker with ${this.python} (${this.model})`);

    await new Promise<void>((resolvePromise, rejectPromise) => mkdir(cwd, { recursive: true }, (error) => error ? rejectPromise(error) : resolvePromise()));
    const worker = spawn(this.python, [script], {
      cwd,
      env: {
        ...process.env,
        TRANSCRIPTION_PORT: String(this.port),
        TRANSCRIPTION_MODEL: this.model
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.worker = worker;

    worker.stdout.on("data", (chunk: Buffer) => this.logger.log(`[worker] ${chunk.toString().trim()}`));
    worker.stderr.on("data", (chunk: Buffer) => this.logger.warn(`[worker] ${chunk.toString().trim()}`));
    worker.once("exit", (code, signal) => {
      this.logger.warn(`Local transcription worker exited (${code ?? "null"}/${signal ?? "null"}).`);
      if (this.worker === worker) this.worker = undefined;
    });

    const deadline = Date.now() + Number(process.env.TRANSCRIPTION_STARTUP_TIMEOUT_MS ?? 10000);
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(`Transcription worker exited with code ${worker.exitCode}.`);
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok) return;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
    }

    worker.kill();
    throw new ServiceUnavailableException("Local transcription worker did not start in time. Install the Python dependencies and ensure Python is available.");
  }

  private resolveWorkerScript() {
    const configured = process.env.TRANSCRIPTION_SCRIPT_PATH?.trim();
    if (configured) return resolve(configured);

    const candidates = [
      resolve(process.cwd(), "tools", "transcription_server.py"),
      resolve(process.cwd(), "apps/api/tools/transcription_server.py")
    ];
    const existing = candidates.find((candidate) => existsSync(candidate));
    return existing ?? candidates[1];
  }
}
