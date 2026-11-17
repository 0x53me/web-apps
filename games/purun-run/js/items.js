// =====================================================
//  アイテムと演出
//  ・Coin        ステージに置いてあるコイン（触れると取れる）
//  ・PopCoin     ? ブロックから飛び出すコイン（演出だけ。叩いた時点で取ったことになる）
//  ・ShieldItem  * ブロックから出てくる「あわシールド」（取ると1回だけ敵に当たっても平気）
//  ・Popup       「+100」などの得点表示
//  ・Sparkle     コインを取ったときのキラキラ
// =====================================================

// ---------- ステージに置いてあるコイン ----------
class Coin {
  constructor(col, row) {
    this.w = 16; this.h = 20;
    this.x = col * CONFIG.TILE + (CONFIG.TILE - this.w) / 2;
    this.y = row * CONFIG.TILE + (CONFIG.TILE - this.h) / 2;
    this.taken = false;
  }
  draw(ctx, camX, camY, time) {
    const x = this.x - camX, y = this.y - camY;
    if (x < -20 || x > CONFIG.WIDTH + 20) return;
    // くるくる回って見えるように横幅を変える
    drawCoinShape(ctx, x + this.w / 2, y + this.h / 2, this.w / 2, this.h / 2, Math.cos(time * 4 + this.x * 0.05));
  }
}

// コインの絵（spin は -1〜1。横幅の倍率）
function drawCoinShape(ctx, cx, cy, rx, ry, spin) {
  const sx = Math.max(0.15, Math.abs(spin));
  ctx.fillStyle = '#e09a1a';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * sx, ry, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx * sx * 0.78, ry * 0.82, 0, 0, Math.PI * 2); ctx.fill();
  if (sx > 0.4) {   // 正面を向いているときだけ模様（しずく型）を描く
    ctx.fillStyle = '#e09a1a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry * 0.45);
    ctx.quadraticCurveTo(cx + rx * sx * 0.4, cy + ry * 0.1, cx, cy + ry * 0.4);
    ctx.quadraticCurveTo(cx - rx * sx * 0.4, cy + ry * 0.1, cx, cy - ry * 0.45);
    ctx.fill();
  }
}

// ---------- ブロックから飛び出すコイン（演出） ----------
class PopCoin {
  constructor(col, row) {
    this.x = col * CONFIG.TILE + CONFIG.TILE / 2;
    this.y = row * CONFIG.TILE;
    this.vy = -430;
    this.t = 0;
    this.done = false;
  }
  update(dt) {
    this.t += dt;
    this.vy += 1500 * dt;
    this.y += this.vy * dt;
    if (this.t > 0.5) this.done = true;
  }
  draw(ctx, camX, camY) {
    drawCoinShape(ctx, this.x - camX, this.y - camY, 8, 10, Math.cos(this.t * 30));
  }
}

// ---------- あわシールド（アイテム） ----------
// ブロックの中からゆっくり出てきて、そのあと右へ転がる。壁で跳ね返り、穴に落ちると消える
class ShieldItem {
  constructor(col, row) {
    this.w = 24; this.h = 24;
    this.x = col * CONFIG.TILE + (CONFIG.TILE - this.w) / 2;
    this.y = row * CONFIG.TILE;                 // 最初はブロックの中
    this.riseTo = row * CONFIG.TILE - this.h;   // ここまで出てきたら動き出す
    this.rising = true;
    this.vx = CONFIG.ITEM_SPEED;
    this.vy = 0;
    this.t = 0;
    this.removed = false;
  }
  update(dt, stage) {
    this.t += dt;
    if (this.rising) {
      this.y -= 50 * dt;
      if (this.y <= this.riseTo) { this.y = this.riseTo; this.rising = false; }
      return;
    }
    // 横に動く → 壁で跳ね返る
    this.x += this.vx * dt;
    const hitX = stage.boxHitsSolid(this.x, this.y, this.w, this.h);
    if (hitX) {
      this.x = this.vx > 0 ? hitX.col * CONFIG.TILE - this.w : (hitX.col + 1) * CONFIG.TILE;
      this.vx = -this.vx;
    }
    // 重力で落ちる → 床に乗る
    this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);
    this.y += this.vy * dt;
    const hitY = stage.boxHitsSolid(this.x, this.y, this.w, this.h);
    if (hitY) {
      this.y = this.vy > 0 ? hitY.row * CONFIG.TILE - this.h : (hitY.row + 1) * CONFIG.TILE;
      this.vy = 0;
    }
    if (this.y > stage.height + 64) this.removed = true;
  }
  draw(ctx, camX, camY) {
    const cx = this.x + this.w / 2 - camX, cy = this.y + this.h / 2 - camY;
    // 出てくる途中はブロックに隠れている部分を描かない
    ctx.save();
    if (this.rising) {
      ctx.beginPath();
      ctx.rect(cx - 20, cy - 40, 40, this.riseTo + this.h - camY - (cy - 40));
      ctx.clip();
    }
    drawBubble(ctx, cx, cy, 12 + Math.sin(this.t * 6) * 0.8, this.t);
    // 中の星
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5 + this.t;
      const r = i % 2 ? 2.4 : 5.5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// シャボン玉の絵（主人公のシールド表示にも使う）
function drawBubble(ctx, cx, cy, r, t) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(140,220,255,0.25)');
  g.addColorStop(1, 'rgba(120,170,255,0.55)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // 虹色のふち
  ctx.lineWidth = 2;
  ctx.strokeStyle = `hsla(${(t * 120) % 360}, 90%, 70%, 0.9)`;
  ctx.stroke();
  // つや
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
}

// ---------- 得点の表示 ----------
class Popup {
  constructor(x, y, text, color = '#ffffff') {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.t = 0; this.done = false;
  }
  update(dt) {
    this.t += dt;
    this.y -= 40 * dt;
    if (this.t > 0.8) this.done = true;
  }
  draw(ctx, camX, camY) {
    ctx.globalAlpha = Math.max(0, 1 - this.t / 0.8);
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText(this.text, this.x - camX, this.y - camY);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x - camX, this.y - camY);
    ctx.globalAlpha = 1;
  }
}

// ---------- キラキラ ----------
class Sparkle {
  constructor(x, y, color = '#fff6a8') {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 90;
    this.x = x; this.y = y;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.color = color;
    this.t = 0; this.life = 0.35 + Math.random() * 0.2;
    this.done = false;
  }
  update(dt) {
    this.t += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.t > this.life) this.done = true;
  }
  draw(ctx, camX, camY) {
    ctx.globalAlpha = Math.max(0, 1 - this.t / this.life);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - camX - 1.5, this.y - camY - 1.5, 3, 3);
    ctx.globalAlpha = 1;
  }
}
