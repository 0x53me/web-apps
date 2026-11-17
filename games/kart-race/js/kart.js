// カート1台分の「見た目」と「動き(自作の簡単な物理)」
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { KartEffects } from './effects.js';

const HOP_GRAVITY = 30; // ドリフト開始の小ジャンプの重力

// 値 v を target に向けて step だけ近づける(行き過ぎない)
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

const WHEEL_R = 0.42; // タイヤの半径

// 基本形状を組み合わせてカートの見た目を作る。カートの前は +z 方向
function createKartMesh(color) {
  const root = new THREE.Group(); // 位置と向きを持つ一番外側
  const body = new THREE.Group(); // 車体(カーブで傾ける部分)
  root.add(body);

  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const main = mat(color);
  const dark = mat(0x222222);
  const add = (geo, m, x, y, z, parent = body) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  add(new THREE.BoxGeometry(1.5, 0.35, 2.4), main, 0, 0.45, 0);        // 車体
  add(new THREE.BoxGeometry(1.1, 0.3, 0.7), main, 0, 0.5, 1.45);       // ノーズ
  add(new THREE.BoxGeometry(1.8, 0.25, 0.35), dark, 0, 0.4, 1.85);     // フロントバンパー
  add(new THREE.BoxGeometry(1.0, 0.7, 0.2), dark, 0, 0.95, -0.75);     // シートの背もたれ
  add(new THREE.BoxGeometry(1.7, 0.1, 0.45), main, 0, 1.3, -1.25);     // リアウイング
  add(new THREE.BoxGeometry(0.1, 0.6, 0.1), dark, -0.5, 0.98, -1.2);   // ウイングの支柱
  add(new THREE.BoxGeometry(0.1, 0.6, 0.1), dark, 0.5, 0.98, -1.2);

  // ドライバー(オリジナルの丸いヘルメットの人)
  add(new THREE.CylinderGeometry(0.32, 0.4, 0.7, 10), mat(0xf1f1f1), 0, 1.0, -0.35); // 体
  add(new THREE.SphereGeometry(0.36, 14, 10), main, 0, 1.6, -0.3);                   // ヘルメット
  add(new THREE.BoxGeometry(0.5, 0.18, 0.12), mat(0x1d3557), 0, 1.62, 0.02);         // バイザー
  const wheel = add(new THREE.TorusGeometry(0.22, 0.05, 6, 14), dark, 0, 1.05, 0.3); // ハンドル
  wheel.rotation.x = -0.6;

  // タイヤ。円柱を横に寝かせ、x軸まわりに回すと転がって見える
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.38, 14);
  tireGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.4, 0.5, 0.12); // 回転が見えるようにする模様
  const tireMat = mat(0x1a1a1a);
  const spokeMat = mat(0xcccccc);
  const makeTire = () => {
    const t = new THREE.Mesh(tireGeo, tireMat);
    const s = new THREE.Mesh(spokeGeo, spokeMat);
    t.add(s);
    return t;
  };

  const wheels = [];
  const frontPivots = [];
  for (const x of [-0.95, 0.95]) {
    // 前輪: ハンドルで向きが変わるよう、回転軸(pivot)の中に入れる
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_R, 0.95);
    root.add(pivot);
    const front = makeTire();
    pivot.add(front);
    frontPivots.push(pivot);
    wheels.push(front);
    // 後輪
    const rear = makeTire();
    rear.position.set(x, WHEEL_R, -0.95);
    root.add(rear);
    wheels.push(rear);
  }

  // 影の代わりに、足元に半透明の黒い楕円を置く(影の計算より圧倒的に軽い)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 1.45, 1);
  shadow.position.y = 0.05;
  root.add(shadow);

  return { root, body, wheels, frontPivots };
}

export class Kart {
  constructor(scene, track, color = CONFIG.kart.color) {
    this.track = track;
    const m = createKartMesh(color);
    this.mesh = m.root;
    this.body = m.body;
    this.wheels = m.wheels;
    this.frontPivots = m.frontPivots;
    scene.add(this.mesh);

    this.pos = new THREE.Vector3(); // 位置(y は使わない)
    this.heading = 0;               // 向き(ラジアン)。前方向 = (sin, cos)
    this.vx = 0;                    // 速度ベクトル
    this.vz = 0;
    this.forwardSpeed = 0;          // 前向きの速さ(マイナスはバック)
    this.steer = 0;                 // なめらかにしたハンドル入力(-1〜1)
    this.trackIndex = -1;           // コース上の位置(番号)
    this.onGrass = false;
    this.wheelSpin = 0;
    this.wallHit = 0;               // 直前に壁に当たった強さ(効果音などで使う)

    // ドリフト
    this.drifting = false;
    this.driftDir = 0;              // ドリフトの向き(右 = 1、左 = -1)
    this.driftCharge = 0;           // ミニターボをためた量(秒)
    this.driftLocked = false;       // ドリフトが途中で切れたら、ボタンを離すまで再開しない
    this.driftYaw = 0;              // 見た目だけの車体の向きのずれ
    this.hopY = 0;                  // 小ジャンプの高さ
    this.hopV = 0;
    this.boostTime = 0;             // ターボの残り時間(秒)

    this.fx = new KartEffects(scene, this.mesh);
  }

  // ためたミニターボの段階(0 = まだ、1〜3)
  get driftLevel() {
    const lv = CONFIG.drift.levels;
    let n = 0;
    while (n < lv.length && this.driftCharge >= lv[n]) n++;
    return n;
  }

  // ターボをかける(ミニターボ・アイテムのダッシュで共通)
  addBoost(seconds) {
    this.boostTime = Math.max(this.boostTime, seconds);
  }

  // ドリフトを始める
  startDrift(dir) {
    this.drifting = true;
    this.driftDir = dir;
    this.driftCharge = 0;
    this.hopV = Math.sqrt(2 * HOP_GRAVITY * CONFIG.drift.hop); // この高さまで跳ぶ初速
  }

  // ドリフトを終える。released = ボタンを離して終えたとき(ミニターボが出る)
  endDrift(released) {
    if (released) {
      const level = this.driftLevel;
      if (level > 0) this.addBoost(CONFIG.drift.boostTime[level - 1]);
    }
    this.drifting = false;
    this.driftCharge = 0;
  }

  // ドリフトボタンの状態を見て、ドリフトの開始・継続・終了を決める
  updateDrift(dt, inp, vf) {
    const d = CONFIG.drift;
    if (!inp.drift) {
      if (this.drifting) this.endDrift(true); // 離したらミニターボ
      this.driftLocked = false;
    } else if (!this.drifting && !this.driftLocked && Math.abs(inp.steer) > 0.3 && vf > d.minSpeed) {
      // 押しながらハンドルを切っていて、十分な速さがあればドリフト開始
      this.startDrift(Math.sign(inp.steer));
    }

    if (!this.drifting) return;

    // 遅くなりすぎたらドリフト終了(ミニターボなし)
    if (vf < d.minSpeed * 0.7) {
      this.endDrift(false);
      this.driftLocked = true;
      return;
    }
    // 内側にハンドルを切っているほど早くたまる。芝生ではたまらない
    if (!this.onGrass) {
      this.driftCharge += dt * (0.7 + 0.6 * Math.max(0, this.steer * this.driftDir));
    }
  }

  // スタート位置に並べる。slot = グリッドの何番目か(0から)
  placeAtStart(slot = 0) {
    const t = this.track;
    const row = Math.floor(slot / 2);
    const col = slot % 2 === 0 ? -1 : 1;
    const i = (t.count - 4 - row * 5) % t.count; // スタートラインの少し後ろ
    const p = t.points[i];
    const r = t.rights[i];
    const tan = t.tangents[i];
    this.pos.set(p.x + r.x * col * 3.5, 0, p.z + r.z * col * 3.5);
    this.heading = Math.atan2(tan.x, tan.z);
    this.vx = this.vz = this.forwardSpeed = this.steer = 0;
    this.trackIndex = t.query(this.pos).index;
    this.drifting = false;
    this.driftCharge = this.driftYaw = this.hopY = this.hopV = this.boostTime = 0;
    this.updateMesh(0);
  }

  // 毎フレームの更新。inp = { steer, accel, brake, ... }
  update(dt, inp) {
    const c = CONFIG.kart;

    // ハンドルは急に切り替わらないよう少しずつ近づける
    this.steer += (inp.steer - this.steer) * Math.min(1, c.steerResponse * dt);

    // 速度を「前向き成分 vf」と「横向き成分 vl」に分ける
    let fx = Math.sin(this.heading);
    let fz = Math.cos(this.heading);
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * -fz + this.vz * fx;

    // 道路の外(芝生)にいるか
    const info = this.track.query(this.pos, this.trackIndex);
    this.trackIndex = info.index;
    this.onGrass = Math.abs(info.offset) > this.track.halfWidth;

    // ターボ中は最高速度が上がり、芝生でも減速しない
    const boosting = this.boostTime > 0;
    if (boosting) this.boostTime = Math.max(0, this.boostTime - dt);
    const maxF = boosting ? c.maxSpeed * CONFIG.boost.speedMul
      : (this.onGrass ? c.grassMaxSpeed : c.maxSpeed);

    // ドリフトの開始・終了
    this.updateDrift(dt, inp, vf);

    // アクセル・ブレーキ
    if (boosting) {
      vf = Math.min(maxF, vf + CONFIG.boost.accel * dt); // ターボはアクセルを押していなくても加速
    } else if (inp.accel && !inp.brake) {
      if (vf < 0) vf = Math.min(0, vf + c.brake * dt);        // バック中ならまず止まる
      else if (vf < maxF) vf = Math.min(maxF, vf + c.accel * dt);
    } else if (inp.brake && !inp.accel) {
      if (vf > 0) vf = Math.max(0, vf - c.brake * dt);        // 前進中ならブレーキ
      else vf = Math.max(-c.reverseMax, vf - c.reverseAccel * dt); // 止まっていたらバック
    } else {
      vf = approach(vf, 0, c.coastDrag * dt);                 // 何も押していないと自然に減速
    }
    // 最高速度を超えていたら減速(芝生に入ったときは強く、ターボが切れたときはゆるやかに)
    if (vf > maxF) vf = approach(vf, maxF, (this.onGrass ? c.grassDrag : c.overSpeedDrag) * dt);

    // ハンドル: 遅いときは曲がれず、速すぎると少し曲がりにくい
    const speedAbs = Math.abs(vf);
    const turnFactor = Math.min(1, speedAbs / c.turnFullSpeed)
      * (1 - c.highSpeedTurnLoss * Math.min(1, speedAbs / c.maxSpeed));
    let steer = this.steer;
    if (this.drifting) {
      // ドリフト中はずっとドリフトの向きに曲がり続ける。
      // 内側に切ると鋭く、外側に切るとゆるく曲がる
      const d = CONFIG.drift;
      const t = (this.steer * this.driftDir + 1) / 2; // 外側いっぱい=0 〜 内側いっぱい=1
      steer = this.driftDir * (d.steerMin + (d.steerMax - d.steerMin) * t);
    }
    this.heading -= steer * c.turnSpeed * turnFactor * Math.sign(vf) * dt;

    // 新しい向きで速度を組み立て直す。横すべりはグリップで減らす(ドリフト中は滑りやすい)
    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    vl *= Math.exp(-(this.drifting ? CONFIG.drift.grip : c.grip) * dt);
    this.vx = fx * vf - fz * vl;
    this.vz = fz * vf + fx * vl;

    // 移動
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    this.collideWalls();

    this.forwardSpeed = this.vx * fx + this.vz * fz;
    this.updateMesh(dt);
  }

  // 壁に当たったら押し戻して跳ね返す
  collideWalls() {
    const c = CONFIG.kart;
    const info = this.track.query(this.pos, this.trackIndex);
    this.trackIndex = info.index;
    this.wallHit = 0;
    const limit = this.track.wallOffset - c.radius;
    const over = Math.abs(info.offset) - limit;
    if (over <= 0) return;

    const s = Math.sign(info.offset);
    const nx = info.right.x * s; // 壁の外向きの方向
    const nz = info.right.z * s;
    this.pos.x -= nx * over;     // めり込んだ分を押し戻す
    this.pos.z -= nz * over;
    const vn = this.vx * nx + this.vz * nz; // 壁に向かう速さ
    if (vn > 0) {
      this.vx -= (1 + c.wallBounce) * vn * nx;
      this.vz -= (1 + c.wallBounce) * vn * nz;
      // 強く当たるほど減速する(軽くこするだけならほとんど減速しない)
      const keep = 1 - (1 - c.wallFriction) * Math.min(1, vn / 10);
      this.vx *= keep;
      this.vz *= keep;
      this.wallHit = vn;

      // 正面から当たって止まると抜け出せないので、向きを壁に沿う方向へ少し回す
      const t = info.tangent;
      const dir = Math.sin(this.heading) * t.x + Math.cos(this.heading) * t.z >= 0 ? 1 : -1;
      let diff = Math.atan2(t.x * dir, t.z * dir) - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(0.3, Math.max(0.05, vn * 0.03));
    }
  }

  // 見た目(位置・向き・車体の傾き・タイヤの回転)を更新する
  updateMesh(dt) {
    // 小ジャンプ
    if (this.hopY > 0 || this.hopV > 0) {
      this.hopV -= HOP_GRAVITY * dt;
      this.hopY += this.hopV * dt;
      if (this.hopY <= 0) { this.hopY = 0; this.hopV = 0; }
    }
    // ドリフト中は車体を内側に向けて、滑っている感じを出す
    const yawGoal = this.drifting ? -this.driftDir * CONFIG.drift.visualYaw : 0;
    this.driftYaw += (yawGoal - this.driftYaw) * Math.min(1, 10 * dt);

    this.mesh.position.set(this.pos.x, this.hopY, this.pos.z);
    this.mesh.rotation.y = this.heading + this.driftYaw;

    const sr = Math.min(1, Math.abs(this.forwardSpeed) / CONFIG.kart.maxSpeed);
    const roll = -this.steer * sr * 0.12; // 曲がるとき外側に傾く
    this.body.rotation.z += (roll - this.body.rotation.z) * Math.min(1, 8 * dt);
    // 芝生ではガタガタ揺れる
    this.body.position.y = this.onGrass && sr > 0.05 ? Math.sin(performance.now() * 0.05) * 0.04 : 0;

    this.wheelSpin += (this.forwardSpeed * dt) / WHEEL_R;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const p of this.frontPivots) p.rotation.y = -this.steer * 0.45;

    this.fx.update(dt, this);
  }
}
