// Cola secuencial de trabajos MT5.

import { randomUUID } from 'node:crypto';
import { launchJob } from './launch.js';

/**
 * Ejecuta jobs uno tras otro. Cancelación por id o de toda la cola.
 */
export class JobQueue {
  constructor({ launch = launchJob } = {}) {
    this._launch = launch;
    this._pending = [];
    this._current = null;
    this._history = [];
    this._running = false;
    this._abort = null;
  }

  /**
   * @param {object} job — args de launchJob + { id?, label? }
   * @returns {string} id
   */
  enqueue(job) {
    const id = job.id || randomUUID();
    const entry = {
      id,
      label: job.label || job.iniPath || id,
      status: 'queued',
      enqueuedAt: new Date().toISOString(),
      opts: { ...job, id },
      result: null,
      error: null,
    };
    this._pending.push(entry);
    return id;
  }

  /** Arranca el procesamiento si no está activo. */
  start() {
    if (this._running) return;
    this._running = true;
    this._pump().catch(() => {
      this._running = false;
    });
  }

  async _pump() {
    while (this._pending.length) {
      const entry = this._pending.shift();
      this._current = entry;
      entry.status = 'running';
      entry.startedAt = new Date().toISOString();
      const ac = new AbortController();
      this._abort = ac;
      entry.opts.signal = ac.signal;
      try {
        const result = await this._launch(entry.opts);
        entry.result = result;
        entry.status = result.ok ? 'done' : (result.canceled ? 'canceled' : 'failed');
      } catch (err) {
        entry.error = String(err.message || err);
        entry.status = ac.signal.aborted ? 'canceled' : 'failed';
        entry.result = {
          ok: false,
          message: entry.error,
          canceled: ac.signal.aborted,
        };
      }
      entry.finishedAt = new Date().toISOString();
      this._history.push(entry);
      this._current = null;
      this._abort = null;
    }
    this._running = false;
  }

  /**
   * Cancela el job actual y/o elimina pendientes.
   * @param {string} [id] — si se omite, cancela todo
   */
  cancel(id) {
    if (!id) {
      this._pending.forEach((e) => { e.status = 'canceled'; });
      this._history.push(...this._pending.map((e) => ({ ...e, finishedAt: new Date().toISOString() })));
      this._pending = [];
      if (this._abort) this._abort.abort();
      if (this._current) this._current.status = 'canceled';
      return { canceled: 'all' };
    }
    const qi = this._pending.findIndex((e) => e.id === id);
    if (qi >= 0) {
      const [e] = this._pending.splice(qi, 1);
      e.status = 'canceled';
      e.finishedAt = new Date().toISOString();
      this._history.push(e);
      return { canceled: id, was: 'queued' };
    }
    if (this._current?.id === id && this._abort) {
      this._abort.abort();
      return { canceled: id, was: 'running' };
    }
    return { canceled: null, message: 'Job no encontrado' };
  }

  status() {
    return {
      running: this._running,
      current: this._current
        ? {
            id: this._current.id,
            label: this._current.label,
            status: this._current.status,
            startedAt: this._current.startedAt,
          }
        : null,
      pending: this._pending.map((e) => ({
        id: e.id,
        label: e.label,
        status: e.status,
        enqueuedAt: e.enqueuedAt,
      })),
      recent: this._history.slice(-20).map((e) => ({
        id: e.id,
        label: e.label,
        status: e.status,
        message: e.result?.message || e.error,
        reportPath: e.result?.reportPath || null,
        finishedAt: e.finishedAt,
      })),
    };
  }
}
