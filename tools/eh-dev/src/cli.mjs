#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CACHE_DIR = join(ROOT, '.eh-dev');
const FILE_CACHE = join(CACHE_DIR, 'file-hashes.json');
const PRISMA_CACHE = join(CACHE_DIR, 'prisma-fingerprint.json');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const spawnOptions = {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
};

const sharedDependencyPaths = [
  'packages/shared/src',
  'packages/shared/package.json',
  'packages/shared/tsconfig.json',
];

const workspaces = {
  shared: {
    name: '@empanada-hauz/shared',
    paths: [...sharedDependencyPaths, 'tsconfig.base.json', 'package-lock.json'],
    output: 'packages/shared/dist',
    cacheFile: 'shared-build.json',
    command: ['run', 'build', '--workspace', '@empanada-hauz/shared'],
  },
  api: {
    name: '@empanada-hauz/api',
    paths: [
      'apps/api/src',
      'apps/api/prisma/schema.prisma',
      'apps/api/package.json',
      'apps/api/tsconfig.json',
      'apps/api/nest-cli.json',
      ...sharedDependencyPaths,
      'tsconfig.base.json',
      'package-lock.json',
      'apps/api/.env',
      'apps/api/.env.local',
    ],
    output: 'apps/api/dist/main.js',
    cacheFile: 'api-build.json',
    command: ['run', 'build:compile', '--workspace', '@empanada-hauz/api'],
  },
  web: {
    name: '@empanada-hauz/web',
    paths: [
      'apps/web/src',
      'apps/web/public',
      'apps/web/package.json',
      'apps/web/tsconfig.json',
      'apps/web/next.config.ts',
      'apps/web/postcss.config.mjs',
      'apps/web/tailwind.config.ts',
      ...sharedDependencyPaths,
      'tsconfig.base.json',
      'package-lock.json',
      'apps/web/.env',
      'apps/web/.env.local',
    ],
    output: 'apps/web/.next/BUILD_ID',
    cacheFile: 'web-build.json',
    command: ['run', 'build', '--workspace', '@empanada-hauz/web'],
  },
};

const prismaSpec = {
  paths: [
    'apps/api/prisma/schema.prisma',
    'apps/api/package.json',
    'package-lock.json',
  ],
  output: 'node_modules/.prisma/client',
  command: ['run', 'prisma:generate', '--workspace', '@empanada-hauz/api'],
};

function ensureCacheDir() {
  mkdirSync(CACHE_DIR, { recursive: true });
}

function loadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, value) {
  ensureCacheDir();
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function workspaceCacheFile(key) {
  return join(CACHE_DIR, workspaces[key].cacheFile);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function walkFiles(rootPath) {
  if (!existsSync(rootPath)) return [];
  const stat = statSync(rootPath);
  if (stat.isFile()) return [rootPath];

  const files = [];
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const absolute = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.next', 'dist', '.git', '.eh-dev', '.expo'].includes(entry.name)) continue;
      files.push(...walkFiles(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function resolveInputFiles(relativeInput) {
  const absolute = join(ROOT, relativeInput);
  if (!existsSync(absolute)) return [];
  return statSync(absolute).isDirectory() ? walkFiles(absolute) : [absolute];
}

function hashFiles(files, fileHashes) {
  const parts = [];
  let changedCount = 0;

  for (const file of files.sort()) {
    const rel = relative(ROOT, file).replaceAll('\\', '/');
    const stat = statSync(file);
    const cached = fileHashes[rel];
    let contentHash = cached?.hash;

    if (!cached || cached.size !== stat.size || cached.mtimeMs !== stat.mtimeMs) {
      contentHash = sha256(readFileSync(file));
      fileHashes[rel] = { size: stat.size, mtimeMs: stat.mtimeMs, hash: contentHash };
      changedCount += 1;
    }

    parts.push(`${rel}:${contentHash}`);
  }

  return { fingerprint: sha256(parts.join('\n')), changedCount };
}

function fingerprintForSpec(spec) {
  ensureCacheDir();
  const fileHashes = loadJson(FILE_CACHE, {});
  const files = spec.paths.flatMap(resolveInputFiles);
  const result = hashFiles(files, fileHashes);
  saveJson(FILE_CACHE, fileHashes);
  return result;
}

function packageFingerprint(key) {
  return fingerprintForSpec(workspaces[key]);
}

function prismaFingerprint() {
  return fingerprintForSpec(prismaSpec);
}

function outputExists(key) {
  return existsSync(join(ROOT, workspaces[key].output));
}

function prismaOutputExists() {
  return existsSync(join(ROOT, prismaSpec.output));
}

function execute(command, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...spawnOptions,
      env: { ...process.env, ...extraEnv },
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`${command} exited with code ${code}`));
      else resolvePromise();
    });
  });
}

async function ensurePrismaGenerated(options = {}) {
  const { fingerprint, changedCount } = prismaFingerprint();
  const cached = loadJson(PRISMA_CACHE, {});
  const hit = !options.clean && cached?.fingerprint === fingerprint && prismaOutputExists();

  if (hit) {
    console.log(`[eh-dev] prisma: CACHE HIT (${changedCount} filesystem changes since last scan)`);
    return { cached: true };
  }

  console.log(`[eh-dev] prisma: generating${cached ? ' (cache miss)' : '...'}`);
  const started = Date.now();
  await execute(npmCommand, prismaSpec.command);
  const durationMs = Date.now() - started;

  saveJson(PRISMA_CACHE, {
    fingerprint,
    generatedAt: new Date().toISOString(),
    durationMs,
  });
  console.log(`[eh-dev] prisma: generated in ${(durationMs / 1000).toFixed(2)}s`);
  return { cached: false, durationMs };
}

async function buildWorkspace(key, options = {}) {
  const spec = workspaces[key];
  const { fingerprint, changedCount } = packageFingerprint(key);
  const cacheFile = workspaceCacheFile(key);
  const cached = loadJson(cacheFile, {});
  const hit = !options.clean && cached?.fingerprint === fingerprint && outputExists(key);

  if (hit) {
    console.log(`[eh-dev] ${key}: CACHE HIT (${changedCount} filesystem changes since last scan)`);
    return { key, cached: true };
  }

  console.log(`[eh-dev] ${key}: building${cached ? ' (cache miss)' : '...'}`);
  const started = Date.now();
  await execute(npmCommand, spec.command);
  const duration = Date.now() - started;

  saveJson(cacheFile, {
    fingerprint,
    builtAt: new Date().toISOString(),
    durationMs: duration,
  });
  console.log(`[eh-dev] ${key}: built in ${(duration / 1000).toFixed(2)}s`);
  return { key, cached: false, durationMs: duration };
}

async function buildApi(options = {}) {
  const { fingerprint, changedCount } = packageFingerprint('api');
  const cacheFile = workspaceCacheFile('api');
  const cached = loadJson(cacheFile, {});
  const hit = !options.clean && cached?.fingerprint === fingerprint && outputExists('api');

  if (hit) {
    console.log(`[eh-dev] api: CACHE HIT (${changedCount} filesystem changes since last scan)`);
    return { key: 'api', cached: true };
  }

  await ensurePrismaGenerated(options);
  console.log(`[eh-dev] api: building${cached ? ' (cache miss)' : '...'}`);
  const started = Date.now();
  await execute(npmCommand, workspaces.api.command);
  const duration = Date.now() - started;

  saveJson(cacheFile, {
    fingerprint,
    builtAt: new Date().toISOString(),
    durationMs: duration,
  });
  console.log(`[eh-dev] api: built in ${(duration / 1000).toFixed(2)}s`);
  return { key: 'api', cached: false, durationMs: duration };
}

async function build(options = {}) {
  if (options.clean) {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    console.log('[eh-dev] local build cache cleared');
  }

  const started = Date.now();
  console.log('[eh-dev] production build');
  console.log('[eh-dev] phase 1: shared dependency');
  await buildWorkspace('shared', options);

  console.log('[eh-dev] phase 2: API + Web in parallel');
  await Promise.all([
    buildApi(options),
    buildWorkspace('web', options),
  ]);

  console.log(`[eh-dev] production build complete in ${((Date.now() - started) / 1000).toFixed(2)}s`);
}

function startProcess(label, args) {
  const child = spawn(npmCommand, args, spawnOptions);

  child.on('error', (error) => {
    console.error(`[eh-dev] ${label} failed: ${error.message}`);
    process.exitCode = 1;
  });
  return child;
}

function dev() {
  console.log('[eh-dev] starting API + Web development servers');
  const api = startProcess('api', ['run', 'dev', '--workspace', '@empanada-hauz/api']);
  const web = startProcess('web', ['run', 'dev', '--workspace', '@empanada-hauz/web']);

  const shutdown = () => {
    api.kill('SIGTERM');
    web.kill('SIGTERM');
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function stats() {
  console.log('EH-DEV BUILD CACHE');
  for (const key of Object.keys(workspaces)) {
    const item = loadJson(workspaceCacheFile(key), {});
    console.log(`${key.padEnd(8)} ${item.builtAt ? `${new Date(item.builtAt).toLocaleString()} ${item.durationMs}ms` : 'no cached build'}`);
  }
  const prisma = loadJson(PRISMA_CACHE, {});
  console.log(`prisma   ${prisma.generatedAt ? `${new Date(prisma.generatedAt).toLocaleString()} ${prisma.durationMs}ms` : 'no cached generate'}`);
}

function usage() {
  console.log(`eh-dev <command>\n\nCommands:\n  dev             Start API + Web development servers\n  build           Incremental production build\n  build --clean   Clear eh-dev cache before a full build\n  stats           Show local build-cache statistics`);
}

const command = process.argv[2] ?? 'dev';
const clean = process.argv.includes('--clean');

try {
  if (command === 'dev') dev();
  else if (command === 'build') await build({ clean });
  else if (command === 'stats') stats();
  else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[eh-dev] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
