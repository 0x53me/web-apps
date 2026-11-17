// =====================================================
//  入力（キーボード ＋ スマホの仮想ボタン）
//  ゲーム側は Input.left / right / jump / dash を見るだけでよい。
//  ジャンプは「押した瞬間」も必要なので Input.consumeJumpPress() で受け取る。
// =====================================================
const Input = {
  left: false, right: false, jump: false, dash: false,
  _key: { left: false, right: false, jump: false, dash: false },    // キーボードの状態
  _touch: { left: false, right: false, jump: false, dash: false },  // 仮想ボタンの状態
  _jumpPressed: false,   // ジャンプが新しく押されたか

  // キーボードとタッチをまとめて、最終的な状態を作る
  _combine() {
    const wasJump = this.jump;
    for (const k of ['left', 'right', 'jump', 'dash']) this[k] = this._key[k] || this._touch[k];
    if (this.jump && !wasJump) this._jumpPressed = true;
  },

  // ジャンプの「押した瞬間」を1回だけ受け取る
  consumeJumpPress() {
    const p = this._jumpPressed;
    this._jumpPressed = false;
    return p;
  },

  // 画面が切り替わったときなどに、押されている状態を全部リセットする
  clear() {
    for (const k of ['left', 'right', 'jump', 'dash']) { this._key[k] = false; this._touch[k] = false; this[k] = false; }
    this._jumpPressed = false;
  },
};

// ---------- キーボード ----------
(() => {
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump',
    ShiftLeft: 'dash', ShiftRight: 'dash', KeyX: 'dash',
  };
  function onKey(e, down) {
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();             // スペースでページがスクロールしないように
    if (e.repeat) return;           // 押しっぱなしの連続入力は無視
    Input._key[k] = down;
    Input._combine();
  }
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  // ウィンドウ外に出たら全部離したことにする（押しっぱなし事故の防止）
  window.addEventListener('blur', () => {
    for (const k in Input._key) Input._key[k] = false;
    Input._combine();
  });
})();

// ---------- 仮想ボタン（マルチタッチ対応） ----------
// 画面に触れている指を全部調べて、どのボタンの上にあるかを毎回計算する。
// こうすると「左を押したままジャンプ」や「指をすべらせて ◀ → ▶」ができる。
(() => {
  const buttons = [...document.querySelectorAll('#controls .btn')];
  const HIT_MARGIN = 16;   // ボタンの見た目より少し広めに反応させる（ピクセル）

  function update(touches) {
    const state = { left: false, right: false, jump: false, dash: false };
    const rects = buttons.map(b => ({ key: b.dataset.key, r: b.getBoundingClientRect() }));
    for (const t of touches) {
      // 指に一番近いボタン（反応範囲の中にあるもの）を探す
      let best = null, bestD = Infinity;
      for (const { key, r } of rects) {
        if (t.clientX < r.left - HIT_MARGIN || t.clientX > r.right + HIT_MARGIN ||
            t.clientY < r.top - HIT_MARGIN || t.clientY > r.bottom + HIT_MARGIN) continue;
        const d = Math.hypot(t.clientX - (r.left + r.right) / 2, t.clientY - (r.top + r.bottom) / 2);
        if (d < bestD) { bestD = d; best = key; }
      }
      if (best) state[best] = true;
    }
    Input._touch = state;
    Input._combine();
    buttons.forEach(b => b.classList.toggle('on', state[b.dataset.key]));
  }

  function onTouch(e) {
    // タッチ端末だと分かったら仮想ボタンを表示
    document.body.classList.add('touch');
    // 左上のボタンや、タイトル・クリアなどの画面のボタンは普通にタップできるようにする
    const isUi = e.target.closest && e.target.closest('#topLeft, .overlay');
    if (!isUi) e.preventDefault();   // それ以外ではスクロール・拡大・長押しメニューを止める
    update(e.touches);
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
    document.addEventListener(type, onTouch, { passive: false });
  }

  // 最初からタッチ端末と分かる場合は表示しておく
  if (window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  // 長押しメニュー・iOS のピンチ・ダブルクリック拡大を止める
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
})();
