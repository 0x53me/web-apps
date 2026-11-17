// =====================================================
//  ゲーム全体の進行（画面サイズ・ループ・カメラ・描画）
// =====================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, T = CONFIG.TILE;

// ---------- 画面サイズ：内部解像度は固定し、比率を保って画面いっぱいに拡大 ----------
function resize() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);   // 高解像度画面でもくっきり（重くなりすぎないよう最大2倍）
  canvas.style.width = Math.floor(W * scale) + 'px';
  canvas.style.height = Math.floor(H * scale) + 'px';
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
  // 以降の描画は「640×360 の座標」で書けば自動で拡大される
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- ゲームの状態 ----------
let stage = new Stage(STAGES[0]);
const player = new Player(stage.start.x, stage.start.y);
const camera = { x: 0, y: 0 };
let enemies = [];
let coins = [];      // ステージに置いてあるコイン
let items = [];      // ブロックから出てきたアイテム（あわシールド）
let effects = [];    // 飛び出すコイン・得点表示・キラキラ
let bumps = [];      // 叩かれて揺れているブロック { col, row, t }
let score = 0;
let coinCount = 0;
let time = 0;        // 経過時間（コインの回転アニメなどに使う）

// ステージを最初の状態に戻す（ブロック・コイン・敵を並べ直す）
function loadStage() {
  stage = new Stage(STAGES[0]);
  enemies = stage.enemySpawns.map(s => new Enemy(s.type, s.col, s.row));
  coins = stage.coinSpawns.map(s => new Coin(s.col, s.row));
  items = [];
  effects = [];
  bumps = [];
}
loadStage();

function addScore(points, x, y) {
  score += points;
  effects.push(new Popup(x, y, '+' + points));
}

// カメラを主人公に合わせる（すぐに合わせるなら instant = true）
function updateCamera(dt, instant) {
  const targetX = player.x + player.w / 2 - W / 2 + player.facing * CONFIG.CAMERA_LEAD;
  const targetY = player.y + player.h / 2 - H * 0.55;
  const k = instant ? 1 : 1 - Math.exp(-CONFIG.CAMERA_SMOOTH * dt);   // なめらかに追いかける
  camera.x += (targetX - camera.x) * k;
  camera.y += (targetY - camera.y) * k;
  // ステージの外は映さない
  camera.x = Math.max(0, Math.min(camera.x, stage.width - W));
  camera.y = Math.max(0, Math.min(camera.y, stage.height - H));
}

// やられたらスタートからやり直し（ライフ制はあとの段階で追加）。
// ステージは最初の状態に戻るが、スコアとコイン枚数はそのまま
function respawn() {
  loadStage();
  player.reset(stage.start.x, stage.start.y);
  updateCamera(0, true);
}

// 2つの四角形が重なっているか（AABB の当たり判定）
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------- 敵の更新と、主人公とのぶつかり判定 ----------
function updateEnemies(dt) {
  // 画面に近づいた敵から動き出す（遠くの敵が勝手に穴へ落ちないように）
  for (const e of enemies) {
    if (!e.active && e.x < camera.x + W + CONFIG.ENEMY_WAKE_MARGIN) e.active = true;
    if (e.active) e.update(dt, stage);
  }

  // 敵どうしがぶつかったら、お互いに向きを変える
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive || !a.active) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive || !b.active || !overlaps(a, b)) continue;
      if (a.x < b.x) { a.dir = -1; b.dir = 1; } else { a.dir = 1; b.dir = -1; }
    }
  }

  // 主人公とのぶつかり
  if (!player.dead) {
    // いま主人公と重なっている敵を全部集める
    const hits = enemies.filter(e => e.alive && e.active && overlaps(player, e));
    if (hits.length > 0) {
      // 落ちている途中で、1つ前の足元が敵の頭より上にあった → 上から踏んだ
      const prevBottom = player.prevY + player.h;
      const stomped = hits.filter(e => player.vy > 0 && prevBottom <= e.y + CONFIG.STOMP_TOLERANCE);
      if (stomped.length > 0) {
        // 踏めた敵は全部まとめて倒す（2匹同時に踏んでもOK）
        stomped.forEach(e => { e.stomp(); addScore(CONFIG.SCORE_STOMP, e.x + e.w / 2, e.y - 8); });
        player.bounce(Math.min(...stomped.map(e => e.y)));
      } else {
        // 横や下からぶつかった：シールドがあれば割れるだけ
        const result = player.hurt();
        if (result === 'shield') {
          effects.push(new Popup(player.x + player.w / 2, player.y - 10, 'パチン！', '#bfe9ff'));
          for (let i = 0; i < 12; i++) effects.push(new Sparkle(player.x + player.w / 2, player.y + player.h / 2, '#bfe9ff'));
        }
      }
    }
  }

  enemies = enemies.filter(e => !e.removed);
}

// ---------- ブロックを下から叩いた ----------
function hitBlock(col, row) {
  const ch = stage.tileAt(col, row);
  if (ch === '?') {
    // コインが飛び出す（叩いた時点で取ったことになる）
    stage.setTile(col, row, 'U');
    effects.push(new PopCoin(col, row));
    coinCount++;
    addScore(CONFIG.SCORE_COIN, (col + 0.5) * T, row * T - 24);
  } else if (ch === '*') {
    // あわシールドが出てくる
    stage.setTile(col, row, 'U');
    items.push(new ShieldItem(col, row));
  } else if (ch !== 'B') {
    return;   // 地面・かたいブロック・柱・使用済みブロックは何も起きない
  }
  bumps.push({ col, row, t: 0 });   // ブロックをぴょこっと揺らす

  // ブロックの上に乗っている敵は、突き上げられて倒れる
  for (const e of enemies) {
    if (!e.alive || !e.active) continue;
    const onTop = Math.abs(e.y + e.h - row * T) < 2 && e.x + e.w > col * T && e.x < (col + 1) * T;
    if (onTop) { e.stomp(); addScore(CONFIG.SCORE_STOMP, e.x + e.w / 2, e.y - 8); }
  }
}

// ---------- コイン・アイテム・演出の更新 ----------
function updateItems(dt) {
  // 置いてあるコインを取る
  for (const c of coins) {
    if (c.taken || !overlaps(player, c)) continue;
    c.taken = true;
    coinCount++;
    score += CONFIG.SCORE_COIN;
    for (let i = 0; i < 6; i++) effects.push(new Sparkle(c.x + c.w / 2, c.y + c.h / 2));
  }
  coins = coins.filter(c => !c.taken);

  // あわシールド
  for (const it of items) {
    it.update(dt, stage);
    if (!it.rising && overlaps(player, it)) {
      it.removed = true;
      player.shield = true;
      addScore(CONFIG.SCORE_ITEM, it.x + it.w / 2, it.y - 8);
      for (let i = 0; i < 10; i++) effects.push(new Sparkle(it.x + it.w / 2, it.y + it.h / 2, '#bfe9ff'));
    }
  }
  items = items.filter(it => !it.removed);

  for (const ef of effects) ef.update(dt);
  effects = effects.filter(ef => !ef.done);
  for (const b of bumps) b.t += dt;
  bumps = bumps.filter(b => b.t < 0.2);
}

// ---------- 更新 ----------
function update(dt) {
  time += dt;
  player.update(dt, stage);
  if (player.headHit) {                         // 頭でブロックを叩いた
    hitBlock(player.headHit.col, player.headHit.row);
    player.headHit = null;
  }
  if (!player.dead) updateEnemies(dt);          // やられている間は敵も止める
  if (!player.dead) updateItems(dt);
  if (!player.dead && player.y > stage.height + 64) respawn();       // 穴に落ちた
  if (player.dead && player.deadT > CONFIG.RESPAWN_DELAY) respawn(); // やられ演出が終わった
  if (!player.dead) updateCamera(dt, false);    // やられている間はカメラを止める
}

// ---------- 描画 ----------
function drawBackground() {
  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#6ec3ff');
  sky.addColorStop(1, '#d9f1ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 雲（ゆっくり動く＝遠くにある）
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 8; i++) {
    const x = ((i * 260 - camera.x * 0.15) % (W + 300) + W + 300) % (W + 300) - 150;
    const y = 40 + (i * 53) % 90;
    for (const [ox, oy, r] of [[0, 0, 18], [20, -8, 22], [42, 0, 17], [20, 6, 18]]) {
      ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 丘（2枚重ねて奥行きを出す）
  drawHills(0.25, 230, 40, '#9ad7a8', 0.008);
  drawHills(0.5, 270, 30, '#6fc48a', 0.013);
}

function drawHills(parallax, baseY, amp, color, freq) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    const wx = x + camera.x * parallax;
    const y = baseY - camera.y * parallax + Math.sin(wx * freq) * amp + Math.sin(wx * freq * 2.7) * amp * 0.35;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// マスを1つ描く
function drawTile(ch, col, row, x, y) {
  switch (ch) {
    case '#': {   // 地面（上が空なら草を生やす）
      ctx.fillStyle = '#9b6a45';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#87593a';
      ctx.fillRect(x + 6, y + 14, 4, 4);
      ctx.fillRect(x + 20, y + 22, 5, 4);
      if (!stage.isSolid(col, row - 1)) {
        ctx.fillStyle = '#5bd16b';
        ctx.fillRect(x, y, T, 9);
        ctx.fillStyle = '#41b052';
        ctx.fillRect(x, y + 9, T, 3);
      }
      break;
    }
    case 'B': {   // レンガ
      ctx.fillStyle = '#d9733f';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#a84e24';
      ctx.fillRect(x, y + 15, T, 2);
      ctx.fillRect(x, y + T - 2, T, 2);
      ctx.fillRect(x + 15, y, 2, 15);
      ctx.fillRect(x + 7, y + 17, 2, 13);
      ctx.fillRect(x + 23, y + 17, 2, 13);
      break;
    }
    case 'U': {   // 使い終わったブロック（くすんだ色・星なし）
      ctx.fillStyle = '#8a7f9e';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#a69cb8';
      ctx.fillRect(x, y, T, 3);
      ctx.fillRect(x, y, 3, T);
      ctx.fillStyle = '#5f5672';
      ctx.fillRect(x, y + T - 3, T, 3);
      ctx.fillRect(x + T - 3, y, 3, T);
      ctx.fillRect(x + 7, y + 7, 3, 3);
      ctx.fillRect(x + T - 10, y + 7, 3, 3);
      ctx.fillRect(x + 7, y + T - 10, 3, 3);
      ctx.fillRect(x + T - 10, y + T - 10, 3, 3);
      break;
    }
    case '?':     // アイテムブロック（紫の箱に星マーク）
    case '*': {   // シールドブロック（見た目は ? と同じ。何が出るかはお楽しみ）
      ctx.fillStyle = '#7d5cff';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#a58bff';
      ctx.fillRect(x, y, T, 3);
      ctx.fillRect(x, y, 3, T);
      ctx.fillStyle = '#4b2fc2';
      ctx.fillRect(x, y + T - 3, T, 3);
      ctx.fillRect(x + T - 3, y, 3, T);
      // きらきら揺れる星
      const k = 1 + Math.sin(performance.now() / 250 + col) * 0.12;
      drawStar(x + T / 2, y + T / 2, 8 * k, '#ffe066');
      break;
    }
    case 'H': {   // かたいブロック
      ctx.fillStyle = '#7b84a3';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#a3abc7';
      ctx.fillRect(x, y, T, 4);
      ctx.fillRect(x, y, 4, T);
      ctx.fillStyle = '#545b78';
      ctx.fillRect(x, y + T - 4, T, 4);
      ctx.fillRect(x + T - 4, y, 4, T);
      break;
    }
    case 'P': {   // 柱（左右どちら側か・一番上かで形を変える）
      const leftEdge = stage.tileAt(col - 1, row) !== 'P';
      const isTop = stage.tileAt(col, row - 1) !== 'P';
      ctx.fillStyle = '#3f8fd6';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = leftEdge ? '#6fb5f0' : '#2c6eac';
      ctx.fillRect(leftEdge ? x + 4 : x + T - 10, y, 6, T);
      if (isTop) {   // 柱の頭（少し太い）
        ctx.fillStyle = '#2f75b8';
        ctx.fillRect(leftEdge ? x - 3 : x, y, T + 3, 12);
        ctx.fillStyle = '#8ccaff';
        ctx.fillRect(leftEdge ? x - 3 : x, y, T + 3, 3);
      }
      break;
    }
  }
}

function drawStar(cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// 画面に映っている範囲のマスだけを描く（全部描くと重い）
function drawStage() {
  const camX = Math.round(camera.x), camY = Math.round(camera.y);
  const c0 = Math.floor(camX / T), c1 = Math.floor((camX + W) / T);
  const r0 = Math.floor(camY / T), r1 = Math.floor((camY + H) / T);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const ch = stage.tileAt(c, r);
      if (ch === '.') continue;
      // 叩かれたブロックは少しだけ上にぴょこっと動く
      const bump = bumps.find(b => b.col === c && b.row === r);
      const lift = bump ? Math.sin(bump.t / 0.2 * Math.PI) * 8 : 0;
      drawTile(ch, c, r, c * T - camX, r * T - camY - lift);
    }
  }
}

function drawHud() {
  // 右上：コイン枚数とスコア
  ctx.fillStyle = 'rgba(11,16,32,0.45)';
  ctx.fillRect(W - 218, 8, 210, 26);
  drawCoinShape(ctx, W - 202, 21, 7, 9, 1);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('× ' + coinCount, W - 190, 21);
  ctx.textAlign = 'right';
  ctx.fillText('SCORE ' + String(score).padStart(6, '0'), W - 16, 21);
}

function draw() {
  drawBackground();
  drawStage();
  const camX = Math.round(camera.x), camY = Math.round(camera.y);
  for (const c of coins) c.draw(ctx, camX, camY, time);
  for (const it of items) it.draw(ctx, camX, camY);
  for (const e of enemies) e.draw(ctx, camX, camY);
  player.draw(ctx, camX, camY);
  for (const ef of effects) ef.draw(ctx, camX, camY);
  drawHud();
}

// ---------- ゲームループ ----------
// 端末ごとの速度差をなくすため、経過時間（デルタタイム）を「1/120秒ずつ」に区切って更新する。
// 60fps の端末なら1フレームに2回、120fps なら1回更新される。
const STEP = 1 / 120;
let last = performance.now();
let acc = 0;

function isPortraitTouch() {
  return document.body.classList.contains('touch') && window.innerHeight > window.innerWidth;
}

function loop(now) {
  const frame = Math.min((now - last) / 1000, 0.1);   // タブ切り替え後などの大きな飛びは切り捨て
  last = now;
  if (!isPortraitTouch()) {          // 縦画面の案内中は止める
    acc += frame;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
  }
  draw();
  requestAnimationFrame(loop);
}

updateCamera(0, true);
requestAnimationFrame(loop);
