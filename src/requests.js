import {requestConfig} from './request-config.js';

export const abortError = () => new DOMException('Aborted', 'AbortError');
export function createMonitor(enabled = false) {
  const counts = {}, events = [];
  return {
    setEnabled(value) { enabled = !!value; },
    record({api, reason = 'request', id = '', mode = '', status}) {
      if (!enabled) return;
      // Deliberately never accept URLs, request bodies, headers, responses or errors.
      const event = {api, reason, id, mode, status,
        cache: status === 'cache-hit' ? 'hit' : status === 'requested' ? 'miss' : 'n/a'};
      counts[api + ':' + status] = (counts[api + ':' + status] || 0) + 1;
      events.push(event); if (events.length > 100) events.shift();
    },
    snapshot: () => ({counts: {...counts}, events: events.map(e => ({...e}))}),
    report() { console.table(this.snapshot().counts); },
    reset() { for (const k of Object.keys(counts)) delete counts[k]; events.length = 0; },
  };
}

// Bounded, lazy-expiring memory only. Call retain() to restrict live data to the
// current view; TTL does NOT establish permission to cache Google content.
export class RequestPool {
  constructor({ttlMs = 0, maxEntries = requestConfig.maxCacheEntries, now = Date.now,
    monitor = createMonitor(), api = 'route', cacheable = () => true} = {}) {
    Object.assign(this, {ttlMs, maxEntries, now, monitor, api, cacheable});
    this.cache = new Map(); this.pending = new Map(); this.allowed = () => true;
  }
  sweep() { for (const [k, e] of this.cache) if (e.expires <= this.now()) this.cache.delete(k); }
  retain(allowed) {
    this.allowed = allowed; this.sweep();
    for (const k of this.cache.keys()) if (!allowed(k)) this.cache.delete(k);
    for (const [k, e] of this.pending) if (!allowed(k)) e.controller.abort();
  }
  clear() { this.cache.clear(); for (const e of this.pending.values()) e.controller.abort(); }
  async run(key, task, {signal, reason, id, mode} = {}) {
    const event = status => this.monitor.record({api: this.api, reason, id, mode, status});
    if (signal?.aborted) { event('aborted'); throw abortError(); }
    this.sweep();
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key); this.cache.set(key, cached); event('cache-hit'); return cached.value;
    }
    let entry = this.pending.get(key);
    if (entry?.controller.signal.aborted) entry = null;
    if (entry) event('shared');
    else {
      event('requested');
      entry = {controller: new AbortController(), users: 0, settled: false};
      const current = entry;
      entry.promise = Promise.resolve().then(() => {
        if(current.controller.signal.aborted)throw abortError();
        return task(current.controller.signal);
      }).then(value => {
        if (current.controller.signal.aborted) { event('stale-discarded'); throw abortError(); }
        if (this.ttlMs > 0 && this.maxEntries > 0 && this.allowed(key) && this.cacheable(value)) {
          this.sweep(); this.cache.delete(key);
          this.cache.set(key, {value, expires: this.now() + this.ttlMs});
          while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
        }
        event(value?.status==='error'||value?.ok===false?'failed':'confirmed'); return value;
      }, error => { throw error; }).catch(error => {
        event(error.name === 'AbortError' ? 'cancelled' : 'failed'); throw error;
      }).finally(() => {
        current.settled = true;
        if (this.pending.get(key) === current) this.pending.delete(key);
      });
      this.pending.set(key, entry);
    }
    entry.users++;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (fn, value) => {
        if (done) return; done = true; signal?.removeEventListener('abort', cancel); entry.users--; fn(value);
      };
      const cancel = () => {
        event('aborted'); finish(reject, abortError());
        // Let a newer generation join the same request before cancelling the last user.
        queueMicrotask(() => { if (!entry.users && !entry.settled) entry.controller.abort(); });
      };
      signal?.addEventListener('abort', cancel, {once: true});
      entry.promise.then(value => finish(resolve, value), error => finish(reject, error));
    });
  }
}

export function debounce(fn, delay) {
  let timer;
  const call = (...args) => { clearTimeout(timer); timer = setTimeout(() => { timer = null; fn(...args); }, delay); };
  call.cancel = () => { clearTimeout(timer); timer = null; };
  return call;
}
