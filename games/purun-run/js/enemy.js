// =====================================================
//  敵
//  ・左右に歩き、壁にぶつかると向きを変える
//  ・上から踏まれるとつぶれて消える（判定は main.js）
//  新しい敵を作るときは ENEMY_TYPES に1つ足し、stage.js の ENEMY_CHARS に文字を足す。
// =====================================================
const ENEMY_TYPES = {
  // どんぐりん：ゆっくり歩く。足場の端から落ちる
  e: { name: 'どんぐりん', w: 26, h: 24, speed: () => CONFIG.ENEMY_SLOW_SPEED, turnAtLedge: false, draw: drawDongurin },
  // ツノカブ：速く歩く。足場の端で引き返す
  k: { name: 'ツノカブ', w: 30, h: 22, speed: () => CONFIG.ENEMY_FAST_SPEED, turnAtLedge: true, draw: drawTsunokabu },
};

class Enemy {
  constructor(type, col, row) {
    const def = ENEMY_TYPES[type];
    this.type = type;
    this.def = def;
    this.w = def.w;
    this.h = def.h;
    // マスの中央・床の上に置く
    this.x = col * CONFIG.TILE + (CONFIG.TILE - def.w) / 2;
    this.y = (row + 1) * CONFIG.TILE - def.h;
    this.vy = 0;
    this.dir = -1;           // 進む向き（最初は左＝主人公の方へ）
    this.active = false;     // 画面に近づくまでは動かない
    this.alive = true;       // 踏まれたら false
    this.removed = false;    // true になったら配列から消す
    this.onGround = false;
    this.deadT = 0;          // つぶれてからの時間
    this.t = Math.random() * 10;   // 歩きアニメ用（敵ごとにずらす）
  }

  update(dt, stage) {
    this.t += dt;

    // つぶれた後は少しだけ表示して消える
    if (!this.alive) {
      this.deadT += dt;
      if (this.deadT > 0.5) this.removed = true;
      return;
    }

    // 足場の端で引き返すタイプ：一歩先の足元に床がなければ向きを変える
    if (this.def.turnAtLedge && this.onGround) {
      const aheadX = this.dir > 0 ? this.x + this.w + 1 : this.x - 1;
      const col = Math.floor(aheadX / CONFIG.TILE);
      const row = Math.floor((this.y + this.h + 1) / CONFIG.TILE);
      if (!stage.isSolid(col, row)) this.dir *= -1;
    }

    // 横に動く → 壁にめり込んだら押し戻して向きを変える
    this.x += this.dir * this.def.speed() * dt;
    const hitX = stage.boxHitsSolid(this.x, this.y, this.w, this.h);
    if (hitX) {
      this.x = this.dir > 0 ? hitX.col * CONFIG.TILE - this.w : (hitX.col + 1) * CONFIG.TILE;
      this.dir *= -1;
    }

    // 重力で落ちる → 床にめり込んだら床の上に乗せる
    this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);
    this.y += this.vy * dt;
    this.onGround = false;
    const hitY = stage.boxHitsSolid(this.x, this.y, this.w, this.h);
    if (hitY) {
      if (this.vy > 0) { this.y = hitY.row * CONFIG.TILE - this.h; this.onGround = true; }
      else this.y = (hitY.row + 1) * CONFIG.TILE;
      this.vy = 0;
    }

    // 穴に落ちたら消える
    if (this.y > stage.height + 64) this.removed = true;
  }

  // 踏まれた
  stomp() {
    this.alive = false;
    this.deadT = 0;
  }

  draw(ctx, camX, camY) {
    const x = this.x - camX, y = this.y - camY;
    if (x + this.w < -20 || x > CONFIG.WIDTH + 20) return;   // 画面の外は描かない
    ctx.save();
    if (!this.alive) {
      // つぶれた姿：足元を基準に縦につぶす
      ctx.translate(x + this.w / 2, y + this.h);
      ctx.scale(1.25, 0.35);
      ctx.translate(-(x + this.w / 2), -(y + this.h));
      ctx.globalAlpha = Math.max(0, 1 - this.deadT * 1.6);
    }
    this.def.draw(ctx, x, y, this.w, this.h, this.dir, this.t, this.alive);
    ctx.restore();

    if (CONFIG.DEBUG_HITBOX) {
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, this.w - 1, this.h - 1);
    }
  }
}

// ---------- 見た目 ----------

// どんぐりん：帽子をかぶったどんぐり。ちょこちょこ歩く
function drawDongurin(ctx, x, y, w, h, dir, t, alive) {
  const cx = x + w / 2;
  const step = alive ? Math.sin(t * 12) : 0;

  // 足
  ctx.fillStyle = '#4a2a14';
  ctx.fillRect(cx - 9 + step * 2, y + h - 5, 7, 5);
  ctx.fillRect(cx + 2 - step * 2, y + h - 5, 7, 5);

  // からだ（下がふくらんだ実）
  ctx.fillStyle = '#c98a4b';
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.58, w / 2 - 1, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a5527';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 帽子（ぼうし）
  ctx.fillStyle = '#6b4423';
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.3, w / 2 + 1, h * 0.26, 0, Math.PI, 0);
  ctx.lineTo(cx + w / 2 + 1, y + h * 0.36);
  ctx.lineTo(cx - w / 2 - 1, y + h * 0.36);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8b5a2b';     // 帽子のつぶつぶ
  for (const ox of [-7, 0, 7]) ctx.fillRect(cx + ox - 1.5, y + h * 0.18, 3, 3);
  ctx.fillStyle = '#4a2a14';     // 帽子のへた
  ctx.fillRect(cx - 1.5, y + h * 0.02, 3, 5);

  // 目（進む方向を見る・少し怒り顔）
  const ex = cx + dir * 3;
  ctx.fillStyle = '#fff';
  for (const ox of [-5, 5]) { ctx.beginPath(); ctx.ellipse(ex + ox, y + h * 0.56, 3.2, 3.8, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#1a1a1a';
  for (const ox of [-5, 5]) { ctx.beginPath(); ctx.arc(ex + ox + dir * 1.2, y + h * 0.58, 1.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#4a2a14';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ex - 8, y + h * 0.42); ctx.lineTo(ex - 2, y + h * 0.46);
  ctx.moveTo(ex + 8, y + h * 0.42); ctx.lineTo(ex + 2, y + h * 0.46);
  ctx.stroke();
}

// ツノカブ：前にツノがある紫のカブトムシ。せかせか歩く
function drawTsunokabu(ctx, x, y, w, h, dir, t, alive) {
  const cx = x + w / 2;
  const step = alive ? Math.sin(t * 20) : 0;

  // 足（3本ずつ、交互に動く）
  ctx.strokeStyle = '#2b1640';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    const lx = cx + i * 8, s = (i % 2 === 0 ? step : -step) * 2.5;
    ctx.moveTo(lx, y + h - 6);
    ctx.lineTo(lx + s, y + h);
  }
  ctx.stroke();

  // 甲羅（こうら）
  const shell = ctx.createLinearGradient(0, y, 0, y + h);
  shell.addColorStop(0, '#b583ff');
  shell.addColorStop(1, '#6a3fc4');
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.ellipse(cx - dir * 2, y + h - 6, w / 2 - 2, h - 7, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3d2170';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // 甲羅の真ん中の線とつや
  ctx.beginPath();
  ctx.moveTo(cx - dir * 2, y + 2); ctx.lineTo(cx - dir * 2, y + h - 6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx - dir * 7, y + 7, 4, 2.5, -0.4 * dir, 0, Math.PI * 2);
  ctx.fill();

  // 頭とツノ
  const hx = cx + dir * (w / 2 - 4);
  ctx.fillStyle = '#3d2170';
  ctx.beginPath();
  ctx.arc(hx, y + h - 9, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffcf4d';
  ctx.beginPath();
  ctx.moveTo(hx, y + h - 13);
  ctx.quadraticCurveTo(hx + dir * 10, y + h - 16, hx + dir * 9, y + h - 24);
  ctx.lineTo(hx + dir * 4, y + h - 12);
  ctx.closePath();
  ctx.fill();
  // 目
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(hx + dir * 2, y + h - 10, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0245e';
  ctx.beginPath(); ctx.arc(hx + dir * 2.6, y + h - 10, 1.2, 0, Math.PI * 2); ctx.fill();
}
