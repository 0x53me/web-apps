// CPU の運転。コースの少し先の「目標点」に向かってハンドルを切る。
// カートの動き自体はプレイヤーと同じ(kart.js)で、ここでは入力(ハンドル・アクセル・ドリフト)だけを作る。
import { CONFIG } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // -180°〜180° にそろえる

export class KartAI {
  // level: 'easy' | 'normal' | 'hard'
  // opts.lane: 走るラインの左右のずれ、opts.skill: 個人差(最高速度の倍率)
  constructor(kart, level, opts = {}) {
    this.kart = kart;
    this.lane = opts.lane ?? 0;
    this.skill = opts.skill ?? 1;
    this.phase = Math.random() * Math.PI * 2; // ラインのゆらし方を1台ずつ変える
    this.time = 0;
    this.driftHold = false; // ドリフトボタンを押しているか
    this.driftTime = 0;
    this.driftSign = 0;
    this.stuck = 0;         // 動けていない時間
    this.setLevel(level);
  }

  setLevel(level) {
    this.level = CONFIG.cpu.levels[level];
  }

  // 毎フレーム呼ぶ。catchUp: 速さの調整(+ で速く、- で遅く)。カートに渡す入力を返す
  getInput(dt, catchUp = 0) {
    const k = this.kart;
    const t = k.track;
    const c = CONFIG.cpu;
    const N = t.count;
    this.time += dt;
    k.speedMul = this.level.speed * this.skill * (1 + catchUp);

    // 走るライン: 決まった位置を中心に、ゆっくり左右にゆらして自然に見せる
    const laneOff = clamp(
      this.lane + Math.sin(this.time * 0.3 + this.phase) * c.laneSwing,
      -t.halfWidth + 2,
      t.halfWidth - 2,
    );

    // i 番目の点(を laneOff だけ横にずらした場所)が、今の向きから何度ずれているか
    const angleTo = (i) => {
      const p = t.points[i];
      const r = t.rights[i];
      const x = p.x + r.x * laneOff;
      const z = p.z + r.z * laneOff;
      return wrapAngle(Math.atan2(x - k.pos.x, z - k.pos.z) - k.heading);
    };
    const ahead = Math.round(c.lookAhead + Math.max(0, k.forwardSpeed) * c.lookAheadPerSpeed);
    const diff = angleTo((k.trackIndex + ahead) % N);        // 近くの目標
    const diffFar = angleTo((k.trackIndex + ahead * 2) % N); // 遠くの目標(カーブの予告)

    // 目標が右(diff がマイナス)なら右(steer がプラス)に切る
    let steer = -diff * this.level.steerGain;

    // 道路の中心からのずれ(右がプラス)。端に近づいたら中央へ戻るようにハンドルを足す
    const off = t.query(k.pos, k.trackIndex).offset;
    const edge = Math.abs(off) - (t.halfWidth - c.edgeMargin);
    if (edge > 0) steer -= Math.sign(off) * edge * 0.6;
    steer = clamp(steer, -1, 1);

    // ---- ドリフト(ふつう・むずかしいだけ) ----
    if (this.level.drift) {
      const want = -Math.sign(diffFar); // カーブの向き(右 = 1)
      // カーブの外側の端に近いか
      const nearOuterEdge = (dir) => off * dir < 0 && Math.abs(off) > t.halfWidth - 2.5;
      if (!this.driftHold) {
        // 大きなカーブが来て、スピードが出ていたらドリフト開始(外側の端にいるときはしない)
        if (Math.abs(diffFar) > 0.45 && k.forwardSpeed > CONFIG.drift.minSpeed + 6 && !nearOuterEdge(want)) {
          this.driftHold = true;
          this.driftTime = 0;
          this.driftSign = want;
          steer = want; // 開始の瞬間はしっかり切る(ドリフト開始の条件)
        }
      } else {
        this.driftTime += dt;
        const done = this.driftTime > 0.9 && Math.abs(diffFar) < 0.15; // カーブを抜けた
        const reversed = want !== this.driftSign && Math.abs(diffFar) > 0.1; // 逆に曲がるカーブ
        const failed = this.driftTime > 0.2 && !k.drifting; // 何かで切れた
        const wide = nearOuterEdge(this.driftSign); // 外にふくらみすぎて芝生に出そう
        if (done || reversed || failed || wide || this.driftTime > 3) this.driftHold = false;
      }
    }

    // 目標がかなり横にあるとき(急カーブ・壁にぶつかった後)はブレーキ
    const brake = Math.abs(diff) > 0.8 && k.forwardSpeed > 12;

    // 引っかかって動けなくなったら、コースの真ん中に戻す
    this.stuck = Math.abs(k.forwardSpeed) < 2 ? this.stuck + dt : 0;
    if (this.stuck > 2.5) {
      k.respawnOnTrack();
      this.stuck = 0;
      this.respawns = (this.respawns || 0) + 1; // 回数(調整の確認用)
    }

    return { steer, accel: !brake, brake, drift: this.driftHold, item: false };
  }
}
