// ゲーム一覧のデータと描画（games/index.html と others/index.html で共用）
// ゲームを追加したら GAMES に1件足す。path は games/ からの相対パス。
//   section: 'main' はトップに直接並ぶ、'others' は「その他ゲーム」の中に並ぶ
//   tags:    先頭2つがカードに表示される（絞り込みは全タグが対象）
//   best():  ベスト記録の表示文字列（localStorage から読む。なければ null）
//   thumb(c, w, h): サムネイルを Canvas に描く（320×240 の座標系）

// ---------- 小物 ----------
const _ls = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const _num = k => Number(_ls(k)) || 0;
const _best = k => () => { const n = _num(k); return n > 0 ? 'BEST ' + n : null; };

function _rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function _star(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
}
function _bgStars(c, w, h, n) {
  c.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.2 + (i % 5) * 0.12;
    c.fillRect((i * 97.3) % w, (i * 61.7 + 13) % h, 1.6, 1.6);
  }
  c.globalAlpha = 1;
}

// ---------- ゲーム一覧 ----------
const GAMES = [
  {
    section: 'main', path: 'orbit-dash/', icon: '🪐', name: 'Orbit Dash',
    desc: 'タップで回転方向を切り替えて、隕石をよけながら★を集める',
    tags: ['ワンタップ', '反射神経', 'エンドレス'],
    best: _best('orbit-dash-best'),
    thumb(c, w, h) {
      c.fillStyle = '#0b1020'; c.fillRect(0, 0, w, h);
      _bgStars(c, w, h, 40);
      const cx = w / 2, cy = h / 2 + 6, R = 78;
      c.strokeStyle = 'rgba(92,225,255,.35)'; c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = -0.5 - i * 0.07;
        c.globalAlpha = (8 - i) / 8 * 0.4; c.fillStyle = '#5ce1ff';
        c.beginPath(); c.arc(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 10 * (1 - i / 10), 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
      c.shadowColor = '#5ce1ff'; c.shadowBlur = 18; c.fillStyle = '#5ce1ff';
      c.beginPath(); c.arc(cx + Math.cos(-0.5) * R, cy + Math.sin(-0.5) * R, 11, 0, Math.PI * 2); c.fill();
      c.shadowColor = '#ffd84d'; c.fillStyle = '#ffd84d';
      _star(c, cx + Math.cos(2.3) * R, cy + Math.sin(2.3) * R, 13); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = '#7a7f9a';
      for (const [x, y, r] of [[52, 52, 14], [268, 196, 18], [150, 128, 8]]) {
        c.beginPath();
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, k = 0.8 + ((i * 7) % 3) * 0.1; c.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k); }
        c.closePath(); c.fill();
      }
    },
  },
  {
    section: 'main', path: 'color-gate/', icon: '🚦', name: 'Color Gate',
    desc: 'タップで自分の色を切り替えて、同じ色のゲートをくぐり抜ける',
    tags: ['ワンタップ', '反射神経', 'エンドレス'],
    best: _best('color-gate-best'),
    thumb(c, w, h) {
      const C = ['#ff5c7a', '#5ca8ff', '#ffd84d'];
      c.fillStyle = '#0b1020'; c.fillRect(0, 0, w, h);
      const gates = [[40, [[0, .55, 1], [.55, 1, 2]]], [112, [[0, .3, 0], [.3, .68, 1], [.68, 1, 2]]]];
      for (const [y, segs] of gates) {
        for (const [a, b, ci] of segs) {
          c.fillStyle = C[ci]; c.shadowColor = C[ci]; c.shadowBlur = 10;
          _rr(c, a * w + 4, y - 8, (b - a) * w - 8, 16, 8); c.fill();
        }
      }
      c.shadowBlur = 0;
      c.strokeStyle = 'rgba(120,150,255,.18)'; c.lineWidth = 2; c.setLineDash([6, 8]);
      c.beginPath(); c.moveTo(0, 190); c.lineTo(w, 190); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 0.3; c.strokeStyle = C[1]; c.lineWidth = 3;
      c.beginPath(); c.moveTo(150, 120); c.lineTo(150, 176); c.stroke(); c.globalAlpha = 1;
      c.fillStyle = C[1]; c.shadowColor = C[1]; c.shadowBlur = 18;
      c.beginPath(); c.arc(150, 190, 14, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0; c.fillStyle = 'rgba(255,255,255,.85)';
      c.beginPath(); c.arc(150, 190, 5.5, 0, Math.PI * 2); c.fill();
    },
  },
  {
    section: 'main', path: 'tsumiage/', icon: '🏗️', name: 'ツミアゲ',
    desc: 'タップでブロックを落として積み上げる。ぴったり重ねて高さを目指そう',
    tags: ['ワンタップ', 'タイミング', 'エンドレス'],
    best: _best('tsumiage-best'),
    thumb(c, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'hsl(230,40%,14%)'); g.addColorStop(1, 'hsl(190,45%,24%)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      _bgStars(c, w, 90, 14);
      const BH = 20, hue0 = 15;
      const rows = [[0, 170], [0, 170], [4, 160], [-2, 150], [6, 140], [6, 140], [1, 128], [-4, 118], [-4, 118]];
      rows.forEach(([x, bw], i) => {
        const y = h - (i + 1) * BH, px = w / 2 + x - bw / 2;
        c.fillStyle = `hsl(${hue0 + i * 9},75%,62%)`; c.fillRect(px, y, bw, BH);
        c.fillStyle = `hsl(${hue0 + i * 9},75%,74%)`; c.fillRect(px, y, bw, 4);
        c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px, y + BH - 4, bw, 4);
      });
      const i = rows.length, y = h - (i + 1) * BH, bw = 118, px = w / 2 + 30 - bw / 2;
      c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(px, y + BH, bw, h);
      c.fillStyle = `hsl(${hue0 + i * 9},75%,62%)`; c.fillRect(px, y, bw, BH);
      c.fillStyle = `hsl(${hue0 + i * 9},75%,74%)`; c.fillRect(px, y, bw, 4);
      c.save(); c.translate(250, 150); c.rotate(0.5);
      c.fillStyle = `hsl(${hue0 + 7 * 9},75%,62%)`; c.fillRect(-6, -10, 12, 20); c.restore();
    },
  },
  {
    section: 'main', path: 'kart-race/', icon: '🏎️', name: 'ターボサーキット',
    desc: '3Dのカートでコースを走ろう。スマホはボタンか傾けて操作',
    tags: ['レース', '3D', 'アクション'],
    best() { // 3周の合計のベストタイム(秒)を "BEST 1:23.45" の形で
      const s = _num('kart-race-best-total');
      if (!(s > 0)) return null;
      const cs = Math.floor(s * 100);
      return `BEST ${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
    },
    thumb(c, w, h) {
      const sky = c.createLinearGradient(0, 0, 0, h * 0.45);
      sky.addColorStop(0, '#5bb8f0'); sky.addColorStop(1, '#bfe6ff');
      c.fillStyle = sky; c.fillRect(0, 0, w, h * 0.45);
      c.fillStyle = '#5fae3f'; c.fillRect(0, h * 0.45, w, h);
      const hy = h * 0.45, vx = w * 0.56;
      c.fillStyle = '#2e7d32';
      for (const [x, s] of [[30, 1], [70, 0.7], [250, 0.9], [292, 1.2]]) {
        c.beginPath(); c.moveTo(x, hy - 34 * s); c.lineTo(x - 12 * s, hy + 4); c.lineTo(x + 12 * s, hy + 4); c.fill();
      }
      c.fillStyle = '#d62828';
      c.beginPath(); c.moveTo(vx - 6, hy); c.lineTo(vx + 6, hy); c.lineTo(w * 0.98, h); c.lineTo(w * 0.02, h); c.fill();
      c.fillStyle = '#5a5d63';
      c.beginPath(); c.moveTo(vx - 4, hy); c.lineTo(vx + 4, hy); c.lineTo(w * 0.92, h); c.lineTo(w * 0.08, h); c.fill();
      c.strokeStyle = '#f2f2f2'; c.lineWidth = 3; c.setLineDash([14, 12]);
      c.beginPath(); c.moveTo(vx, hy); c.lineTo(w * 0.5, h); c.stroke(); c.setLineDash([]);
      const kx = w * 0.5, ky = h * 0.8;
      c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(kx, ky + 26, 60, 10, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a1a1a'; c.fillRect(kx - 56, ky, 22, 26); c.fillRect(kx + 34, ky, 22, 26);
      c.fillStyle = '#e63946'; _rr(c, kx - 40, ky - 4, 80, 24, 6); c.fill();
      c.fillRect(kx - 46, ky - 26, 92, 7);
      c.fillStyle = '#222'; c.fillRect(kx - 34, ky - 20, 5, 18); c.fillRect(kx + 29, ky - 20, 5, 18);
      c.fillStyle = '#e63946'; c.beginPath(); c.arc(kx, ky - 30, 15, 0, Math.PI * 2); c.fill();
    },
  },
  {
    section: 'others', path: 'others/snake/', icon: '🐍', name: 'スネークゲーム',
    desc: 'エサを食べて長くなろう。壁と自分の体に注意。',
    tags: ['アクション', '定番'],
    best: _best('snakeBest'),
    thumb(c, w, h) {
      const S = 16;
      c.fillStyle = '#11111b'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 1;
      for (let x = 0; x <= w; x += S) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += S) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      const body = [[12, 6], [11, 6], [10, 6], [9, 6], [8, 6], [8, 7], [8, 8], [8, 9], [9, 9], [10, 9], [11, 9], [12, 9], [13, 9], [13, 10], [13, 11], [12, 11], [11, 11]];
      body.forEach(([x, y], i) => { c.fillStyle = i === 0 ? '#a6e3a1' : '#74c7a0'; c.fillRect(x * S + 1, y * S + 1, S - 2, S - 2); });
      c.fillStyle = '#f38ba8'; c.fillRect(15 * S + 2, 6 * S + 2, S - 4, S - 4);
    },
  },
  {
    section: 'others', path: 'others/tetris/', icon: '🧱', name: 'テトリス風',
    desc: '落ちてくるブロックを並べてラインを消そう。',
    tags: ['パズル', 'アクション', '定番'],
    best: _best('tetrisBest'),
    thumb(c, w, h) {
      const B = 20, x0 = (w - 10 * B) / 2;
      const COL = { I: '#89dceb', O: '#f9e2af', T: '#cba6f7', S: '#a6e3a1', Z: '#f38ba8', J: '#89b4fa', L: '#fab387' };
      c.fillStyle = '#1e1e2e'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#11111b'; c.fillRect(x0, 0, 10 * B, h);
      const rows = ['..........', 'JJ......OO', 'J...SS..OO', 'JLLSS.ZZII', 'TLTTT.ZZII', 'TTOOZ.LLII', 'IIIIZ.LJJI'];
      rows.forEach((r, i) => [...r].forEach((ch, x) => {
        if (ch === '.') return;
        c.fillStyle = COL[ch]; c.fillRect(x0 + x * B + 1, h - (rows.length - i) * B + 1, B - 2, B - 2);
      }));
      c.globalAlpha = 0.25; c.fillStyle = COL.I;
      for (let k = 0; k < 4; k++) c.fillRect(x0 + 5 * B + 1, h - 7 * B + k * B + 1 + B * 3, B - 2, B - 2);
      c.globalAlpha = 1; c.fillStyle = COL.T;
      for (const [x, y] of [[4, 2], [5, 2], [6, 2], [5, 1]]) c.fillRect(x0 + x * B + 1, y * B + 1, B - 2, B - 2);
    },
  },
  {
    section: 'others', path: 'others/breakout/', icon: '🏓', name: 'ブロック崩し',
    desc: 'パドルでボールを打ち返して全ブロックを壊そう。',
    tags: ['アクション', '定番'],
    best: _best('breakoutBest'),
    thumb(c, w, h) {
      const RC = ['#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#89b4fa'];
      c.fillStyle = '#11111b'; c.fillRect(0, 0, w, h);
      const BW = w / 8, gone = new Set([3, 4, 11, 12, 13, 20, 29, 30]);
      for (let r = 0; r < 5; r++) for (let k = 0; k < 8; k++) {
        if (gone.has(r * 8 + k)) continue;
        c.fillStyle = RC[r]; c.fillRect(k * BW + 2, 26 + r * 16 + 2, BW - 4, 12);
      }
      c.fillStyle = '#cdd6f4';
      c.fillRect(120, 214, 70, 9);
      c.beginPath(); c.arc(176, 150, 6, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.25;
      c.beginPath(); c.arc(186, 168, 5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(196, 186, 4, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    },
  },
  {
    section: 'others', path: 'others/game2048/', icon: '🔢', name: '2048',
    desc: '同じ数字を合体させて2048を目指そう。',
    tags: ['パズル', 'じっくり', '定番'],
    best: _best('best2048'),
    thumb(c, w, h) {
      const COL = { 0: '#313244', 2: '#cdd6f4', 4: '#b4befe', 8: '#fab387', 16: '#f9a56b', 32: '#f38ba8', 64: '#eb6f92', 128: '#f9e2af', 256: '#f5d98a', 512: '#a6e3a1' };
      const g = [[2, 0, 4, 2], [8, 16, 4, 0], [32, 64, 128, 8], [512, 256, 16, 4]];
      c.fillStyle = '#1e1e2e'; c.fillRect(0, 0, w, h);
      const T = 46, G = 6, S = 4 * T + 5 * G, x0 = (w - S) / 2, y0 = (h - S) / 2;
      c.fillStyle = '#45475a'; _rr(c, x0, y0, S, S, 8); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      g.forEach((row, y) => row.forEach((v, x) => {
        const px = x0 + G + x * (T + G), py = y0 + G + y * (T + G);
        c.fillStyle = COL[v]; _rr(c, px, py, T, T, 5); c.fill();
        if (v) { c.fillStyle = '#1e1e2e'; c.font = `bold ${v >= 100 ? 17 : 21}px system-ui,sans-serif`; c.fillText(v, px + T / 2, py + T / 2 + 1); }
      }));
    },
  },
  {
    section: 'others', path: 'others/minesweeper/', icon: '💣', name: 'マインスイーパー',
    desc: '数字を手がかりに地雷を避けて全マスを開けよう。',
    tags: ['パズル', 'じっくり', '定番'],
    best() {
      for (const [i, n] of [[2, '上級'], [1, '中級'], [0, '初級']]) {
        const s = _num('msBest' + i);
        if (s > 0) return `${n} ${s}秒`;
      }
      return null;
    },
    thumb(c, w, h) {
      const NC = { 1: '#89b4fa', 2: '#a6e3a1', 3: '#f38ba8' };
      const m = ['  1F1    ', '  111  11', '111   12F', 'F1    1F2', '11  1121 ', '   12F#  ', '   1F##  '];
      c.fillStyle = '#1e1e2e'; c.fillRect(0, 0, w, h);
      const S = 28, x0 = (w - 9 * S) / 2, y0 = (h - 7 * S) / 2;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      m.forEach((r, y) => [...r].forEach((ch, x) => {
        const px = x0 + x * S, py = y0 + y * S;
        const closed = ch === '#' || ch === 'F';
        c.fillStyle = closed ? '#7f849c' : '#313244'; _rr(c, px + 1, py + 1, S - 2, S - 2, 3); c.fill();
        if (ch === 'F') { c.font = '15px system-ui,sans-serif'; c.fillText('🚩', px + S / 2, py + S / 2 + 1); }
        else if (NC[ch]) { c.fillStyle = NC[ch]; c.font = 'bold 16px system-ui,sans-serif'; c.fillText(ch, px + S / 2, py + S / 2 + 1); }
      }));
    },
  },
];

// タグの表示順（ここにないタグは後ろに並ぶ）
const TAG_ORDER = ['ワンタップ', '反射神経', 'タイミング', 'アクション', 'レース', '3D', 'パズル', 'じっくり', 'エンドレス', '定番'];

// ---------- 一覧の描画 ----------
//   root:    このページから games/ への相対パス（トップは ''、others は '../'）
//   section: 'main' ならトップ（絞り込み時は全ゲームが対象）、'others' ならその中だけ
//   folder:  絞り込みなしのときに並べるフォルダカード（トップの「その他ゲーム」）
function renderGameList({ root = '', section = 'main', folder = null }) {
  const listEl = document.getElementById('list');
  const tagsEl = document.getElementById('tags');
  const pool = section === 'main' ? GAMES : GAMES.filter(g => g.section === section);

  const rank = t => { const i = TAG_ORDER.indexOf(t); return i < 0 ? 999 : i; };
  const tags = [...new Set(pool.flatMap(g => g.tags))].sort((a, b) => rank(a) - rank(b));

  let cur = new URLSearchParams(location.search).get('tag');
  if (!tags.includes(cur)) cur = null;

  function setTag(t) {
    cur = cur === t ? null : t;
    const url = new URL(location.href);
    if (cur) url.searchParams.set('tag', cur); else url.searchParams.delete('tag');
    history.replaceState(null, '', url);
    draw();
  }

  function chip(label, active, onClick, count) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (active ? ' on' : '');
    b.textContent = label;
    if (count != null) {
      const n = document.createElement('span');
      n.className = 'n'; n.textContent = count;
      b.appendChild(n);
    }
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  // サムネイル Canvas（320×240 座標で描き、高解像度画面ではきれいに）
  function thumbCanvas(fn) {
    const cv = document.createElement('canvas');
    const k = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = 320 * k; cv.height = 240 * k;
    const c = cv.getContext('2d');
    c.scale(k, k);
    try { fn(c, 320, 240); } catch (e) { c.fillStyle = '#151c35'; c.fillRect(0, 0, 320, 240); }
    return cv;
  }

  function card(g, href, isFolder) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'card' + (isFolder ? ' folder' : '');
    a.href = href;
    a.innerHTML = '<div class="thumb"></div><div class="body"><div class="name"><span class="icon"></span><span class="title"></span></div><div class="desc"></div><div class="tags"></div></div>';
    const th = a.querySelector('.thumb');
    if (g.thumb) th.appendChild(thumbCanvas(g.thumb));
    const best = g.best && g.best();
    if (best) {
      const b = document.createElement('span');
      b.className = 'best'; b.textContent = best;
      th.appendChild(b);
    }
    a.querySelector('.icon').textContent = g.icon;
    a.querySelector('.title').textContent = g.name;
    a.querySelector('.desc').textContent = g.desc;
    // タグは先頭2つ（絞り込み中のタグがそれ以外なら追加で表示）
    const shown = (g.tags || []).slice(0, 2);
    if (cur && g.tags && g.tags.includes(cur) && !shown.includes(cur)) shown.push(cur);
    const tg = a.querySelector('.tags');
    for (const t of shown) {
      const s = document.createElement('span');
      s.className = 'tag' + (t === cur ? ' on' : '');
      s.textContent = '#' + t;
      tg.appendChild(s);
    }
    li.appendChild(a);
    return li;
  }

  function draw() {
    tagsEl.innerHTML = '';
    tagsEl.appendChild(chip('すべて', !cur, () => { if (cur) setTag(cur); }));
    for (const t of tags) {
      tagsEl.appendChild(chip('#' + t, t === cur, () => setTag(t), pool.filter(g => g.tags.includes(t)).length));
    }
    // 選択中のタグが横スクロールで隠れているときだけ見える位置へ
    const on = tagsEl.querySelector('.chip.on');
    if (on) {
      const l = on.offsetLeft, r = l + on.offsetWidth;
      if (l < tagsEl.scrollLeft || r > tagsEl.scrollLeft + tagsEl.clientWidth) tagsEl.scrollLeft = l - 16;
    }

    listEl.innerHTML = '';
    if (cur) {
      for (const g of pool.filter(g => g.tags.includes(cur))) listEl.appendChild(card(g, root + g.path));
    } else {
      for (const g of pool.filter(g => section !== 'main' || g.section === 'main')) listEl.appendChild(card(g, root + g.path));
      if (folder) listEl.appendChild(card(folder, folder.path, true));
    }
  }

  draw();
  // 別タブで遊んで戻ってきたときに BEST を更新
  window.addEventListener('pageshow', e => { if (e.persisted) draw(); });
}
