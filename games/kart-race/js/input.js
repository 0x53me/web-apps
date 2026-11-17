// 入力(キーボード・画面のボタン・端末の傾き)をまとめて、
// { steer, accel, brake } という同じ形で読めるようにする。
import { CONFIG } from './config.js';

// キーボードのキーと操作の対応
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'accel', KeyW: 'accel',
  ArrowDown: 'brake', KeyS: 'brake',
  ShiftLeft: 'drift', ShiftRight: 'drift',
  Space: 'item',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Input {
  constructor(controlsEl) {
    this.mode = 'buttons';      // 'buttons'(ボタン操作) か 'tilt'(傾け操作)
    this.autoAccel = false;     // true ならブレーキを押していない間はずっとアクセル(スマホ用)
    this.keys = new Set();      // 押されているキーボードのキー
    this.touchKeys = new Set(); // 指で押されている画面のボタン
    this.mouseKey = null;       // マウスで押されている画面のボタン(PCでの確認用)
    this.tilt = 0;              // 傾きから計算したハンドル(-1〜1)
    this.buttons = [...controlsEl.querySelectorAll('[data-key]')];

    // ---- キーボード ----
    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (k) { this.keys.add(k); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.keys.delete(k);
    });
    window.addEventListener('blur', () => { // 別のウィンドウに移ったら全部離す
      this.keys.clear(); this.touchKeys.clear(); this.mouseKey = null; this.refresh();
    });

    // ---- タッチ(マルチタッチ対応) ----
    // 触れている全部の指について「指の下にあるボタン」を調べ直す。
    // こうすると、指をすべらせて ◀ から ▶ に移っても反応する。
    const onTouch = (e) => {
      e.preventDefault(); // スクロールや拡大を止める
      this.touchKeys.clear();
      for (const t of e.touches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const btn = el && el.closest('[data-key]');
        if (btn) this.touchKeys.add(btn.dataset.key);
      }
      this.refresh();
    };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      controlsEl.addEventListener(type, onTouch, { passive: false });
    }

    // ---- マウス(PCで画面のボタンを試すとき用) ----
    controlsEl.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('[data-key]');
      if (btn) { this.mouseKey = btn.dataset.key; this.refresh(); }
    });
    window.addEventListener('mouseup', () => { this.mouseKey = null; this.refresh(); });

    // ---- 端末の傾き ----
    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
  }

  // iOS では傾きセンサーを使う前に許可が必要。ボタンを押した直後に呼ぶこと
  static async requestTiltPermission() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        return (await DeviceOrientationEvent.requestPermission()) === 'granted';
      } catch {
        return false;
      }
    }
    return true; // Android などは許可なしで使える
  }

  // 傾きをハンドルの値に変える
  onOrientation(e) {
    if (e.beta == null) return;
    // 横向きのとき、ハンドルのように左右に傾けると beta が変わる。
    // 画面の向き(左に90度回したか、右に90度回したか)で符号が逆になる
    const angle = screen.orientation ? screen.orientation.angle : (window.orientation || 0);
    let v;
    if (angle === 90) v = e.beta;
    else if (angle === 270 || angle === -90) v = -e.beta;
    else v = e.gamma || 0; // 縦向きのとき(参考)
    const { maxAngle, deadZone } = CONFIG.tilt;
    const a = Math.abs(v) < deadZone ? 0 : (v - Math.sign(v) * deadZone) / (maxAngle - deadZone);
    this.tilt = clamp(a, -1, 1);
  }

  // その操作が押されているか
  has(k) {
    return this.keys.has(k) || this.touchKeys.has(k) || this.mouseKey === k;
  }

  // ボタンの見た目(押されている間だけ光る)を更新
  refresh() {
    for (const b of this.buttons) b.classList.toggle('on', this.has(b.dataset.key));
  }

  // 今の入力をまとめて返す
  getState() {
    let steer = (this.has('right') ? 1 : 0) - (this.has('left') ? 1 : 0);
    if (this.mode === 'tilt' && steer === 0) steer = this.tilt; // キーを押していないときは傾きを使う
    return {
      steer,
      accel: this.has('accel') || (this.autoAccel && !this.has('brake')),
      brake: this.has('brake'),
      drift: this.has('drift'),
      item: this.has('item'),
    };
  }
}
