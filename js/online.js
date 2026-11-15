// Parties entre amis en direct (WebRTC via PeerJS, connexion directe entre appareils)
const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

export class Online {
  constructor(on) { this.on = on; this.peer = null; this.conn = null; this.isHost = false; this.closed = false; }

  _peer() {
    return new Promise((res, rej) => {
      if (!window.Peer) return rej(new Error('Module en ligne indisponible'));
      const p = new window.Peer('echecs-' + rid(), { debug: 0 });
      let opened = false;
      p.on('open', () => { opened = true; res(p); });
      p.on('disconnected', () => { if (!p.destroyed && !this.closed) try { p.reconnect(); } catch {} });
      p.on('error', err => {
        if (!opened) return rej(err);
        if (err.type === 'peer-unavailable' && !this.isHost) return; // géré par les tentatives de join
        this.on.error?.(err);
      });
    });
  }

  async host() {
    this.isHost = true;
    this.peer = await this._peer();
    this.peer.on('connection', c => {
      if (this.conn && this.conn.open) { c.on('open', () => { c.send({ t: 'busy' }); setTimeout(() => c.close(), 500); }); return; }
      this._setup(c);
    });
    return this.peer.id;
  }

  // Le guest réessaie pendant 60 s (l'hôte peut être en arrière-plan sur mobile)
  async join(id) {
    this.isHost = false;
    this.peer = await this._peer();
    const t0 = Date.now();
    while (!this.closed && Date.now() - t0 < 60000) {
      const c = this.peer.connect(id, { reliable: true });
      const ok = await new Promise(res => {
        const to = setTimeout(() => res(false), 6000);
        c.on('open', () => { clearTimeout(to); res(true); });
        c.on('error', () => { clearTimeout(to); res(false); });
      });
      if (ok) { this._setup(c, true); return; }
      try { c.close(); } catch {}
    }
    if (!this.closed) throw new Error('timeout');
  }

  _setup(c, alreadyOpen = false) {
    this.conn = c;
    const opened = () => this.on.open?.();
    if (alreadyOpen) opened(); else c.on('open', opened);
    c.on('data', d => { if (d && typeof d === 'object' && typeof d.t === 'string') this.on.data?.(d); });
    c.on('close', () => { if (this.conn === c) { this.conn = null; if (!this.closed) this.on.close?.(); } });
  }

  send(o) { try { if (this.conn && this.conn.open) this.conn.send(o); } catch {} }

  close() {
    this.closed = true;
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = this.peer = null;
  }
}
