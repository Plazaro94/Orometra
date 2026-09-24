// Cliente IPC hacia el host Node del ledger (child_process).
// Usa el binario `node` del sistema para que better-sqlite3 cargue el prebuild de Node,
// no el ABI de Electron.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HOST = path.join(ROOT, 'desktop/main/ledger/host.js');

function nodeBinary() {
  return process.versions.electron ? 'node' : process.execPath;
}

export class LedgerClient {
  constructor() {
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  async start(dbPath) {
    if (this.proc) return this.call('open', { dbPath });

    this.proc = spawn(nodeBinary(), [HOST], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env },
      windowsHide: true,
    });

    await new Promise((resolve, reject) => {
      const rl = readline.createInterface({ input: this.proc.stdout });
      let settled = false;
      rl.on('line', (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch { return; }
        if (!settled && msg.result?.ready) {
          settled = true;
          resolve();
        }
        if (msg.id == null) return;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error || 'Error en ledger'));
      });
      this.proc.on('error', (err) => {
        if (!settled) reject(err);
      });
      this.proc.on('exit', (code) => {
        for (const [, p] of this.pending) p.reject(new Error(`Ledger host salió (${code})`));
        this.pending.clear();
        this.proc = null;
      });
    });

    return this.call('open', { dbPath });
  }

  call(method, args = {}) {
    if (!this.proc) return Promise.reject(new Error('Ledger no iniciado'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(`${JSON.stringify({ id, method, args })}\n`);
    });
  }

  stop() {
    if (!this.proc) return;
    try { this.proc.stdin.end(); } catch { /* */ }
    try { this.proc.kill(); } catch { /* */ }
    this.proc = null;
  }
}

export function createLedgerClient() {
  return new LedgerClient();
}
