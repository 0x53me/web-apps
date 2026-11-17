// =====================================================
//  主人公「プルン」（丸いゼリーのキャラクター）
//  動き（速度・ジャンプ）と、地形との当たり判定（AABB）を担当する。
// =====================================================

// 値を目標に向かって step だけ近づける（行き過ぎない）
function approach(value, target, step) {
  if (value < target) return Math.min(value + step, target);
  return Math.max(value - step, target);
}

class Player {
  constructor(x, y) {
    this.w = CONFIG.PLAYER_W;
    this.h = CONFIG.PLAYER_H;
    this.reset(x, y);
  }

  // スタート位置に戻す
  reset(x, y) {
    this.x = x; this.y = y;     // 当たり判定の四角の左上
    this.vx = 0; this.vy = 0;   // 速度
    this.onGround = false;      // 地面に立っているか
    this.facing = 1;            // 向き（1 = 右、-1 = 左）
    this.coyote = 0;            // 足場から落ちた直後のジャンプ猶予の残り時間
    this.jumpBuffer = 0;        // 先行入力したジャンプの残り時間
    this.jumping = false;       // ジャンプで上昇中か（長押し判定用）
    this.squash = 0;            // 見た目の伸び縮み（+ でつぶれる / - で伸びる）
    this.t = 0;                 // アニメーション用の時間
  }

  // ---------- 毎フレームの更新 ----------
  update(dt, stage) {
    this.t += dt;

    // --- 左右の移動 ---
    const dir = (Input.right ? 1 : 0) - (Input.left ? 1 : 0);
    const maxSpeed = Input.dash ? CONFIG.DASH_SPEED : CONFIG.WALK_SPEED;
    if (dir !== 0) {
      this.facing = dir;
      let accel = this.onGround ? CONFIG.GROUND_ACCEL : CONFIG.AIR_ACCEL;
      if (Math.sign(this.vx) === -dir) accel *= 2;   // 逆向きに切り返すときは素早く
      if (Math.abs(this.vx) <= maxSpeed) {
        this.vx = approach(this.vx, dir * maxSpeed, accel * dt);
      } else {
        // ダッシュをやめたときなど、最高速度を超えている分はゆっくり落とす
        this.vx = approach(this.vx, dir * maxSpeed, CONFIG.GROUND_FRICTION * 0.5 * dt);
      }
    } else {
      const friction = this.onGround ? CONFIG.GROUND_FRICTION : CONFIG.AIR_FRICTION;
      this.vx = approach(this.vx, 0, friction * dt);
    }

    // --- ジャンプ ---
    if (Input.consumeJumpPress()) this.jumpBuffer = CONFIG.JUMP_BUFFER;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    this.coyote = this.onGround ? CONFIG.COYOTE_TIME : Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      // 速く走っているほど少し高く跳べる
      const bonus = CONFIG.DASH_JUMP_BONUS * Math.min(1, Math.abs(this.vx) / CONFIG.DASH_SPEED);
      this.vy = -(CONFIG.JUMP_SPEED + bonus);
      this.jumping = true;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.squash = -0.35;   // 縦に伸びる
    }

    // --- 重力 ---
    // ボタンを押したまま上昇している間は重力を弱くする → 長押しで高く跳べる
    if (this.jumping && (!Input.jump || this.vy >= 0)) this.jumping = false;
    const gravity = this.jumping ? CONFIG.GRAVITY_HOLD : CONFIG.GRAVITY;
    this.vy = Math.min(this.vy + gravity * dt, CONFIG.MAX_FALL);

    // --- 移動と当たり判定 ---
    this.moveAndCollide(this.vx * dt, this.vy * dt, stage);

    // ステージの左端・右端から出ない
    if (this.x < 0) { this.x = 0; this.vx = 0; }
    if (this.x > stage.width - this.w) { this.x = stage.width - this.w; this.vx = 0; }

    // 見た目の伸び縮みを元に戻していく
    this.squash = approach(this.squash, 0, dt * 3);
  }

  // ---------- 移動と当たり判定 ----------
  // 速いときに壁をすり抜けないよう、1回の移動を「1/4マス以下」の小さな歩幅に分けて進める。
  // さらに「横に動かして押し戻す」→「縦に動かして押し戻す」を別々に行うのがコツ。
  moveAndCollide(dx, dy, stage) {
    const maxStep = CONFIG.TILE / 4;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
    const sx = dx / steps, sy = dy / steps;
    const wasOnGround = this.onGround;
    this.onGround = false;

    for (let i = 0; i < steps; i++) {
      // 横方向
      if (sx !== 0) {
        this.x += sx;
        this.resolveX(sx, stage);
      }
      // 縦方向
      if (sy !== 0) {
        this.y += sy;
        this.resolveY(sy, stage);
      }
    }

    // 着地した瞬間はぷにっとつぶれる
    if (this.onGround && !wasOnGround) this.squash = 0.3;
  }

  // 自分の四角と重なっているマスの範囲（列・行）
  overlapRange() {
    const T = CONFIG.TILE;
    return {
      c0: Math.floor(this.x / T),
      c1: Math.floor((this.x + this.w - 0.001) / T),
      r0: Math.floor(this.y / T),
      r1: Math.floor((this.y + this.h - 0.001) / T),
    };
  }

  // 横に動いたあと、壁にめり込んでいたら押し戻す
  resolveX(sx, stage) {
    const T = CONFIG.TILE;
    const { c0, c1, r0, r1 } = this.overlapRange();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!stage.isSolid(c, r)) continue;
        if (sx > 0) this.x = c * T - this.w;      // 右に進んでいた → 壁の左側へ
        else this.x = (c + 1) * T;                // 左に進んでいた → 壁の右側へ
        this.vx = 0;
        return;
      }
    }
  }

  // 縦に動いたあと、床や天井にめり込んでいたら押し戻す
  resolveY(sy, stage) {
    const T = CONFIG.TILE;
    const { c0, c1, r0, r1 } = this.overlapRange();
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!stage.isSolid(c, r)) continue;
        if (sy > 0) {
          this.y = r * T - this.h;                // 落ちていた → 床の上に立つ
          this.onGround = true;
        } else {
          this.y = (r + 1) * T;                   // 上がっていた → 天井に頭をぶつける
          this.jumping = false;
        }
        this.vy = 0;
        return;
      }
    }
  }

  // ---------- 描画 ----------
  // camX, camY はカメラの位置（画面の左上がステージのどこか）
  draw(ctx, camX, camY) {
    const cx = this.x + this.w / 2 - camX;   // 足元の中心
    const by = this.y + this.h - camY;

    // 歩いているときは少しぷるぷる揺れる
    const moving = this.onGround && Math.abs(this.vx) > 20;
    const wobble = moving ? Math.sin(this.t * 22) * 0.06 : Math.sin(this.t * 3) * 0.03;
    const s = this.squash + wobble;
    const rw = (this.w / 2 + 3) * (1 + s);        // 横の半径（つぶれると広がる）
    const rh = (this.h / 2 + 2) * (1 - s);        // 縦の半径

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, by + 1, rw * 0.9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // からだ（下が平らな、おもち型）
    const top = by - rh * 2;
    const grad = ctx.createLinearGradient(0, top, 0, by);
    grad.addColorStop(0, '#9ff5d6');
    grad.addColorStop(1, '#2fc79a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - rw, by);
    ctx.bezierCurveTo(cx - rw * 1.05, top + rh * 0.2, cx - rw * 0.55, top, cx, top);
    ctx.bezierCurveTo(cx + rw * 0.55, top, cx + rw * 1.05, top + rh * 0.2, cx + rw, by);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1b8f6c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // つや
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx - rw * 0.45 * this.facing, top + rh * 0.55, rw * 0.18, rh * 0.22, -0.5 * this.facing, 0, Math.PI * 2);
    ctx.fill();

    // 目（向いている方向に寄せる）
    const ex = cx + this.facing * rw * 0.25, ey = top + rh * 0.95;
    ctx.fillStyle = '#123';
    for (const off of [-rw * 0.28, rw * 0.28]) {
      ctx.beginPath();
      ctx.ellipse(ex + off, ey, 2.6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // ほっぺ
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    for (const off of [-rw * 0.55, rw * 0.55]) {
      ctx.beginPath();
      ctx.ellipse(ex + off, ey + 6, 3.5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 開発用：当たり判定の四角
    if (CONFIG.DEBUG_HITBOX) {
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x - camX + 0.5, this.y - camY + 0.5, this.w - 1, this.h - 1);
    }
  }
}
