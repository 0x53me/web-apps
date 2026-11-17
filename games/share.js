// ゲーム結果のシェア（全ゲーム共通）
//   GameShare.share(text) … 結果テキスト＋このページのURLを共有する
//   GameShare.show(text)  … 画面下に「結果をシェア」ボタンを出す（ゲーム終了時に呼ぶ）
//   GameShare.hide()      … ボタンを消す（リスタート時に呼ぶ）
// スマホなど Web Share API が使える環境では共有メニュー、使えなければクリップボードにコピー。
(() => {
  const pageUrl = () => location.origin + location.pathname;

  let toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 76px);' +
        'transform:translateX(-50%);z-index:10001;padding:10px 18px;border-radius:999px;' +
        'background:rgba(20,24,40,.95);color:#e8ecff;font:600 14px system-ui,sans-serif;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none;transition:opacity .25s;white-space:nowrap';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 1800);
  }

  async function copy(s) {
    try { await navigator.clipboard.writeText(s); return true; } catch (e) {}
    // 古いブラウザ・非 https 向けの予備
    try {
      const ta = document.createElement('textarea');
      ta.value = s; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  async function share(text) {
    const url = pageUrl();
    if (navigator.share) {
      try { await navigator.share({ title: document.title, text, url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; } // キャンセルは何もしない
    }
    const all = text + '\n' + url;
    if (await copy(all)) toast('結果とURLをコピーしました');
    else window.prompt('コピーしてシェアしてください', all);
  }

  let btn = null, current = '';
  function show(text) {
    current = text;
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = '📤 結果をシェア';
      btn.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 16px);' +
        'transform:translateX(-50%);z-index:10000;padding:12px 26px;border:0;border-radius:999px;' +
        'background:#89b4fa;color:#1e1e2e;font:800 16px system-ui,sans-serif;cursor:pointer;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.45)';
      // ゲーム側のタップ・キー操作に反応させない
      ['pointerdown', 'touchstart', 'mousedown'].forEach(t => btn.addEventListener(t, e => e.stopPropagation()));
      btn.addEventListener('click', e => { e.stopPropagation(); btn.blur(); share(current); });
      document.body.appendChild(btn);
    }
    btn.style.display = '';
  }
  function hide() { if (btn) btn.style.display = 'none'; }

  window.GameShare = { share, show, hide };
})();
