// オンライン対戦の通信まわり。
// PeerJS(ブラウザ同士を直接つなぐ WebRTC を簡単に使うためのライブラリ)を使う。
// つなぐときの「待ち合わせ」だけ PeerJS の無料サーバーを使い、レース中のデータはブラウザ同士で直接やりとりする。
//
// 形: 部屋を作った人(ホスト)を中心に、参加者はホストとだけつながる(星の形)。
//     参加者 → ホスト → 全員、の順にデータが流れる。
// 番号: 部屋の中の人は 0〜3 の番号(idx)を持つ。ホストは 0。この番号がそのままカートの番号になる。

const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const ID_PREFIX = 'turbo-circuit-kart-room-'; // 部屋番号の前に付ける文字(ほかのアプリと混ざらないように)
export const MAX_PLAYERS = 4;
const PING_INTERVAL = 1000;   // 「まだつながっているよ」の合図を送る間隔(ミリ秒)
const TIMEOUT = 8000;         // これだけ何も届かなければ、切れたとみなす
const CONNECT_TIMEOUT = 12000; // つなぐときに待つ時間の上限

// PeerJS は必要になったときだけ読み込む(1人で遊ぶときは読み込まない)
let loading = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.onload = () => resolve();
      s.onerror = () => {
        loading = null;
        s.remove();
        reject(new Error('通信の準備ができませんでした。ネットにつながっているか確認してください。'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// 名前は短くして、空なら「ゲスト」にする(画面には textContent で出すので HTML は効かない)
export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 8) || 'ゲスト';

// PeerJS のエラーを日本語の説明にする
function describe(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return 'その番号の部屋が見つかりませんでした。';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return 'サーバーにつながりませんでした。ネット接続を確認してください。';
    case 'browser-incompatible': return 'このブラウザはオンライン対戦に対応していません。';
    case 'webrtc': return '相手とつながりませんでした(学校や会社のネットワークでは使えないことがあります)。';
    default: return (err && err.message) || 'つながりませんでした。';
  }
}

export class Net {
  constructor() {
    this.handlers = {};
    this.reset();
  }

  reset() {
    this.peer = null;
    this.isHost = false;
    this.code = '';          // 部屋番号(4けた)
    this.myIdx = 0;          // 自分の番号
    this.members = [];       // 部屋にいる人 [{ idx, name }](ホストも含む)
    this.guests = new Map(); // ホスト用: idx → { conn, lastSeen }
    this.hostConn = null;    // 参加者用: ホストとのつながり
    this.hostSeen = 0;
    this.locked = false;     // ホスト用: true の間は新しく参加できない(レース中)
    this.timer = null;
  }

  // できごとを受け取る関数を登録する
  //   'members'(list): 部屋の顔ぶれが変わった
  //   'message'(fromIdx, msg): ゲームのデータが届いた
  //   'left'(idx): だれかが抜けた
  //   'closed'(reason): 通信が切れた(参加者側でホストがいなくなったときなど)
  on(type, fn) { this.handlers[type] = fn; }
  emit(type, ...args) { if (this.handlers[type]) this.handlers[type](...args); }

  get connected() { return !!this.peer; }

  // PeerJS の「自分」を作る(id を省くと自動で決まる)
  createPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new window.Peer(id) : new window.Peer();
      const timer = setTimeout(() => {
        peer.destroy();
        reject(new Error('サーバーにつながりませんでした。'));
      }, CONNECT_TIMEOUT);
      peer.once('open', () => { clearTimeout(timer); peer.off('error'); resolve(peer); });
      peer.once('error', (e) => { clearTimeout(timer); peer.destroy(); reject(e); });
    });
  }

  // ---- 部屋を作る(ホストになる)。部屋番号を返す ----
  async host(name) {
    await loadPeerJS();
    let lastErr = null;
    // 4けたの番号を作る。ほかの人と重なったら作り直す
    for (let i = 0; i < 5 && !this.peer; i++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      try {
        this.peer = await this.createPeer(ID_PREFIX + code);
        this.code = code;
      } catch (e) {
        lastErr = e;
        if (e.type !== 'unavailable-id') throw new Error(describe(e));
      }
    }
    if (!this.peer) throw new Error(describe(lastErr));
    this.isHost = true;
    this.myIdx = 0;
    this.members = [{ idx: 0, name: cleanName(name) }];
    this.peer.on('connection', (conn) => this.acceptGuest(conn));
    this.watch();
    this.emit('members', this.members);
    return this.code;
  }

  // ホスト用: 参加者が来たとき
  acceptGuest(conn) {
    let idx = -1; // この参加者の番号(あいさつが済むまでは -1)
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (idx < 0) {
        // 最初は「あいさつ」だけ受け付ける
        if (msg.t !== 'hello') return;
        const free = this.freeIdx();
        const reason = this.locked ? 'レース中なので入れません。終わるまで待ってください。'
          : free < 0 ? `部屋がいっぱいです(${MAX_PLAYERS}人まで)。` : '';
        if (reason) {
          conn.send({ t: 'deny', reason });
          setTimeout(() => conn.close(), 500);
          return;
        }
        idx = free;
        this.guests.set(idx, { conn, lastSeen: Date.now() });
        this.members.push({ idx, name: cleanName(msg.name) });
        this.members.sort((a, b) => a.idx - b.idx);
        conn.send({ t: 'welcome', idx });
        this.sendMembers();
        return;
      }
      const g = this.guests.get(idx);
      if (!g) return;
      g.lastSeen = Date.now();
      if (msg.t === 'ping') return;
      this.emit('message', idx, msg);
    });
    const drop = () => { if (idx >= 0) this.dropGuest(idx); };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  // 空いている番号(1〜3)。なければ -1
  freeIdx() {
    for (let i = 1; i < MAX_PLAYERS; i++) if (!this.guests.has(i)) return i;
    return -1;
  }

  // ホスト用: 参加者を部屋から外す(切れたとき)
  dropGuest(idx) {
    const g = this.guests.get(idx);
    if (!g) return;
    this.guests.delete(idx);
    try { g.conn.close(); } catch { /* もう閉じている */ }
    this.members = this.members.filter((m) => m.idx !== idx);
    this.broadcast({ t: 'left', idx });
    this.emit('left', idx);
    this.sendMembers();
  }

  sendMembers() {
    this.broadcast({ t: 'members', list: this.members });
    this.emit('members', this.members);
  }

  // ホスト用: 参加者全員に送る
  broadcast(msg) {
    for (const g of this.guests.values()) {
      if (g.conn.open) g.conn.send(msg);
    }
  }

  // ---- 部屋に参加する ----
  async join(code, name) {
    await loadPeerJS();
    try {
      this.peer = await this.createPeer();
    } catch (e) {
      throw new Error(describe(e));
    }
    const peer = this.peer;
    try {
      this.myIdx = await new Promise((resolve, reject) => {
        let joined = false;
        const timer = setTimeout(() => reject(new Error('つながりませんでした。部屋番号を確認してください。')), CONNECT_TIMEOUT);
        const fail = (e) => { clearTimeout(timer); reject(e instanceof Error && !e.type ? e : new Error(describe(e))); };
        peer.on('error', fail);

        const conn = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        conn.on('open', () => conn.send({ t: 'hello', name: cleanName(name) }));
        conn.on('data', (msg) => {
          if (!msg || typeof msg !== 'object') return;
          this.hostSeen = Date.now();
          if (!joined) {
            if (msg.t === 'welcome') {
              joined = true;
              clearTimeout(timer);
              resolve(msg.idx);
            } else if (msg.t === 'deny') {
              fail(new Error(String(msg.reason || '入れませんでした。')));
            }
            return;
          }
          if (msg.t === 'ping') return;
          if (msg.t === 'members' && Array.isArray(msg.list)) {
            this.members = msg.list;
            this.emit('members', this.members);
          } else if (msg.t === 'left') {
            this.emit('left', msg.idx);
          } else {
            this.emit('message', 0, msg);
          }
        });
        conn.on('close', () => { if (joined) this.lost('ホストとの接続が切れました。'); });
      });
    } catch (e) {
      this.close();
      throw e;
    }
    this.code = code;
    this.hostSeen = Date.now();
    this.watch();
  }

  // 参加者用: ホストに送る
  sendToHost(msg) {
    if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }

  // 定期的に「まだつながっている」合図を送り、返事がなくなった相手を切る
  watch() {
    this.timer = setInterval(() => {
      const now = Date.now();
      if (this.isHost) {
        this.broadcast({ t: 'ping' });
        for (const [idx, g] of this.guests) {
          if (now - g.lastSeen > TIMEOUT) this.dropGuest(idx);
        }
      } else if (this.hostConn) {
        this.sendToHost({ t: 'ping' });
        if (now - this.hostSeen > TIMEOUT) this.lost('ホストとの接続が切れました。');
      }
    }, PING_INTERVAL);
    // 待ち合わせサーバーとの接続だけ切れたときは、つなぎ直す(相手との直接の通信は続いている)
    this.peer.on('disconnected', () => {
      if (this.peer && !this.peer.destroyed) this.peer.reconnect();
    });
  }

  // 参加者用: ホストがいなくなった
  lost(reason) {
    if (!this.peer) return;
    this.close();
    this.emit('closed', reason);
  }

  // 部屋を出る(ホストなら部屋を閉じる)
  close() {
    if (this.timer) clearInterval(this.timer);
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* もう閉じている */ }
    }
    this.reset();
  }
}
