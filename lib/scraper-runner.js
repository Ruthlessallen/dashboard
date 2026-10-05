import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scraperDir } from './rutas.js';
import { escribirIgnoradas } from './ignoradas.js';

/**
 * Lanza el scraper de ofertas (Python) en segundo plano y recuerda el estado
 * en <carpeta>/estado.json. Pensado para no martillear los portales:
 * - nunca dos a la vez
 * - automatico como mucho cada JOBS_REFRESH_HOURS (12 por defecto)
 * - tras un 429/403 espera 24 h; tras un fallo, 3 h
 * - el boton manual exige 30 min desde la ultima ejecucion
 */

const SCRIPT = 'ejecutar_todos_colectores.py';
const MANUAL_GAP_MIN = 30;

const stateFile = () => path.join(scraperDir(), 'estado.json');
const logFile = () => path.join(scraperDir(), 'ultima_ejecucion.log');
const refreshHours = () => Number(process.env.JOBS_REFRESH_HOURS) || 12;
const pythonBin = () => process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}
function writeState(state) {
  fs.writeFileSync(stateFile(), JSON.stringify(state, null, 2));
}
function readLog() {
  try { return fs.readFileSync(logFile(), 'utf8'); } catch { return ''; }
}
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

export function scraperStatus() {
  if (!fs.existsSync(path.join(scraperDir(), SCRIPT))) return { available: false };

  const s = readState() || {};
  const running = Boolean(s.pid && !s.finishedAt && isAlive(s.pid));
  const last = s.finishedAt || s.startedAt;
  const waitH = s.rateLimited ? 24 : s.exitCode ? 3 : refreshHours();
  const nextAutoAt = last ? new Date(new Date(last).getTime() + waitH * 3600e3).toISOString() : null;

  return {
    available: true,
    running,
    startedAt: s.startedAt || null,
    finishedAt: s.finishedAt || null,
    exitCode: s.exitCode ?? null,
    rateLimited: Boolean(s.rateLimited),
    error: s.error || null,
    nextAutoAt,
    logTail: running ? readLog().split(/\r?\n/).filter(Boolean).slice(-3) : [],
  };
}

export function startScraper({ force = false } = {}) {
  const status = scraperStatus();
  if (!status.available) return { started: false, reason: 'no-scraper', ...status };
  if (status.running) return { started: false, reason: 'running', ...status };

  const last = status.finishedAt || status.startedAt;
  if (last) {
    if (force) {
      if (Date.now() - new Date(last).getTime() < MANUAL_GAP_MIN * 60e3) return { started: false, reason: 'too-soon', ...status };
    } else if (Date.now() < new Date(status.nextAutoAt).getTime()) {
      return { started: false, reason: 'cooldown', ...status };
    }
  }

  // Lo que ya revisaste (aplicado, borrado o en postulaciones) no debe volver a traerse
  try { escribirIgnoradas(scraperDir()); } catch {}

  const out = fs.openSync(logFile(), 'w');
  const child = spawn(pythonBin(), [SCRIPT], {
    cwd: scraperDir(),
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  fs.closeSync(out);

  const startedAt = new Date().toISOString();
  writeState({ startedAt, pid: child.pid, trigger: force ? 'manual' : 'auto' });

  child.on('error', (err) => {
    writeState({
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: -1,
      error: err.code === 'ENOENT' ? `No encuentro Python (${pythonBin()}). Define PYTHON_BIN en .env.local` : err.message,
    });
  });
  child.on('exit', (code) => {
    writeState({
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: code,
      rateLimited: /RATE-LIMIT/.test(readLog()),
    });
  });

  return { started: true, ...scraperStatus() };
}
