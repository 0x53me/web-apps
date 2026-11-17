// 周回とチェックポイントの管理(カート1台ごとに1つ作る)
//
// しくみ:
//   コースを CHECKPOINTS 個の区間に分け、区間を順番に通ったときだけ「チェックポイント通過」にする。
//   最後のチェックポイントを通ってからスタートラインを越えたときだけ、1周と数える。
//   → 逆走したり、区間を飛ばしたり(ショートカット)すると周回が数えられない。
import { CONFIG } from './config.js';

export class LapCounter {
  constructor(track) {
    this.track = track;
    this.K = CONFIG.race.checkpoints;
    this.reset(0);
  }

  // レース開始時に呼ぶ。time = 今のレース時間(秒)
  reset(time) {
    this.lap = 1;              // 今何周目か(1から)
    this.cp = 0;               // この周で通過したチェックポイントの数
    this.lastLd = null;        // 前のフレームのコース上の距離
    this.justCounted = false;  // 直前のライン通過で周を数えたか(後ろに戻ったときの取り消し用)
    this.lapStarts = [time];   // 各周を走り始めた時間
    this.lapTimes = [];        // 各周のタイム(秒)
    this.finished = false;
    this.finishTime = 0;
  }

  // 毎フレーム呼ぶ。周回を数えたら 'lap'、ゴールしたら 'finish' を返す
  update(kart, time) {
    if (this.finished) return null;
    const L = this.track.length;
    const K = this.K;
    const ld = this.track.dists[kart.trackIndex]; // スタートラインからの距離(0〜L)
    const prev = this.lastLd;
    this.lastLd = ld;
    if (prev === null) return null;

    if (prev > L * 0.75 && ld < L * 0.25) {
      // ---- スタートラインを前向きに越えた ----
      // 全部のチェックポイントを通っていなければ数えない(ショートカット・逆走対策)
      this.justCounted = false;
      if (this.cp === K - 1) {
        this.lapTimes.push(time - this.lapStarts[this.lapStarts.length - 1]);
        this.lapStarts.push(time);
        this.lap++;
        this.cp = 0;
        this.justCounted = true;
        if (this.lap > CONFIG.race.laps) {
          this.finished = true;
          this.finishTime = time;
          this.lap = CONFIG.race.laps;
          return 'finish';
        }
        return 'lap';
      }
    } else if (prev < L * 0.25 && ld > L * 0.75) {
      // ---- スタートラインを後ろ向きに戻った → さっき数えた周を取り消す ----
      if (this.justCounted) {
        this.justCounted = false;
        this.lap--;
        this.cp = K - 1;
        this.lapTimes.pop();
        this.lapStarts.pop();
      }
    } else {
      // ---- 次のチェックポイントの区間に入ったら通過 ----
      const next = this.cp + 1;
      if (next <= K - 1 && ld >= (next * L) / K && ld < ((next + 1) * L) / K) {
        this.cp = next;
        this.justCounted = false; // 先に進んだので、もう取り消さない
      }
    }
    return null;
  }

  // 順位を決めるための「レースでどれだけ進んだか」(大きいほど前)
  progress(kart) {
    const L = this.track.length;
    let ld = this.track.dists[kart.trackIndex];
    // 周の始めなのにラインの手前にいる(スタート直後など)ときはマイナスにする
    if (ld > L / 2 && this.cp < this.K / 2) ld -= L;
    return (this.lap - 1) * L + ld;
  }

  // 今の周を走り始めてからの時間
  currentLapTime(time) {
    return time - this.lapStarts[this.lapStarts.length - 1];
  }
}

// 秒を「分:秒.1/100秒」の文字にする(例: 83.456 → "1:23.45")
export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
