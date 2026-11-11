// Markdown + 数式(LaTeX)のレンダリング
// marked が `_` や `\` を解釈して数式が壊れないよう、数式を退避 → marked → KaTeX で戻す。
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function renderMath(tex, display) {
    if (!window.katex) {
      // KaTeX が読み込めなかった(オフライン等)場合は TeX ソースをそのまま見せる
      return '<code class="math-fallback">' + escapeHtml(display ? '$$' + tex + '$$' : '$' + tex + '$') + '</code>';
    }
    try {
      return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html' });
    } catch (e) {
      return '<code class="math-error" title="数式エラー">' + escapeHtml(tex) + '</code>';
    }
  }

  function render(src) {
    const codes = [];
    const maths = [];

    // 1. コードブロック・インラインコードを退避(中の $ を数式扱いしない)
    let text = src.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
      codes.push(m);
      return '%%CODE' + (codes.length - 1) + '%%';
    });

    // 2. エスケープされた \$ はただのドル記号
    text = text.replace(/\\\$/g, '%%DOLLAR%%');

    // 3. ディスプレイ数式 $$...$$ → インライン数式 $...$ の順に退避
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      maths.push(renderMath(tex.trim(), true));
      return '%%MATH' + (maths.length - 1) + '%%';
    });
    text = text.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
      maths.push(renderMath(tex.trim(), false));
      return '%%MATH' + (maths.length - 1) + '%%';
    });

    // 4. コードを戻してから Markdown を変換
    text = text.replace(/%%CODE(\d+)%%/g, (_, i) => codes[+i]);
    let html = window.marked ? window.marked.parse(text, { gfm: true }) : '<pre>' + escapeHtml(text) + '</pre>';

    // 5. 数式を戻す(ディスプレイ数式だけの段落は <p> を外す)
    html = html.replace(/<p>\s*%%MATH(\d+)%%\s*<\/p>/g, (m, i) =>
      maths[+i].indexOf('katex-display') >= 0 ? maths[+i] : m);
    html = html.replace(/%%MATH(\d+)%%/g, (_, i) => maths[+i]);
    html = html.replace(/%%DOLLAR%%/g, '$');
    return html;
  }

  window.Markdown = { render, escapeHtml };
})();
