// =====================================================
//  全画面表示
//  ブラウザのルールで「ユーザーがタップしたとき」しか全画面にできない。
//  そこで、横向きになったら「次のタップ」で自動的に全画面に切り替える。
//  全画面をやめたあとは、左上の「⛶ 全画面」ボタンで戻れる。
//  ※ iPhone の Safari は全画面表示に対応していない（ホーム画面に追加して開くと全画面になる）
// =====================================================
(() => {
  const root = document.documentElement;
  const btn = document.getElementById('fsBtn');

  const request = root.requestFullscreen || root.webkitRequestFullscreen;   // 古い iPad などは webkit 付き
  const canFullscreen = !!request;
  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isLandscape = () => window.innerWidth > window.innerHeight;
  const isTouch = () => document.body.classList.contains('touch');

  let autoPending = true;          // true の間は、横向きでの次のタップで全画面にする
  let wasLandscape = isLandscape();

  function enter() {
    if (!canFullscreen || isFullscreen()) return;
    try {
      const p = request.call(root, { navigationUI: 'hide' });
      if (p && p.then) p.then(lockLandscape).catch(() => {});
      else lockLandscape();
    } catch (e) {}
  }

  // 全画面になったら向きを横に固定（Android の Chrome など対応している端末だけ）
  function lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) {}
  }

  // 「⛶ 全画面」ボタンは、タッチ端末で全画面に対応していて、今は全画面でないときだけ出す
  function updateButton() {
    btn.classList.toggle('hidden', !canFullscreen || !isTouch() || isFullscreen());
  }

  // 指を離したとき（ブラウザが「ユーザー操作」と認めるタイミング）に全画面にする
  document.addEventListener('touchend', e => {
    if (!autoPending || !isLandscape() || isFullscreen()) return;
    if (e.target.closest && e.target.closest('#backBtn, #fsBtn')) return;
    autoPending = false;
    enter();
  }, { passive: true });

  // 縦 → 横になったら、また次のタップで全画面にする
  window.addEventListener('resize', () => {
    const l = isLandscape();
    if (l && !wasLandscape) autoPending = true;
    wasLandscape = l;
    updateButton();
  });

  btn.addEventListener('click', enter);
  document.addEventListener('fullscreenchange', updateButton);
  document.addEventListener('webkitfullscreenchange', updateButton);
  document.addEventListener('touchstart', updateButton, { passive: true });   // タッチ端末と分かったらボタンを出す
  updateButton();
})();
