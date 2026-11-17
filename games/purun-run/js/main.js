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

// 穴に落ちたらスタートからやり直し（ライフは次の段階で追加）
function respawn() {
  player.reset(stage.start.x, stage.start.y);
  updateCamera(0, true);
}

// ---------- 更新 ----------
function update(dt) {
  player.update(dt, stage);
  if (player.y > stage.height + 64) respawn();   // 画面の下まで落ちた
  updateCamera(dt, false);
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
    case '?': {   // アイテムブロック（紫の箱に星マーク）
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
      if (ch !== '.') drawTile(ch, c, r, c * T - camX, r * T - camY);
    }
  }
}

function drawHud() {
  ctx.fillStyle = 'rgba(11,16,32,0.45)';
  ctx.fillRect(W - 168, 8, 160, 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${stage.name}  ${Math.floor(player.x / T)} / ${stage.colCount}`, W - 16, 20);
}

function draw() {
  drawBackground();
  drawStage();
  player.draw(ctx, Math.round(camera.x), Math.round(camera.y));
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
