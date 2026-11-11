// ルーター・画面描画
// ルート一覧は docs/design.md の「4. ページ構成」を参照。
(function () {
  'use strict';

  const app = document.getElementById('app');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const esc = window.Markdown.escapeHtml;

  const SITE_NAME = 'EE Learning';
  const RECENT_KEY = 'ee-learning:recent';
  const RECENT_MAX = 5;
  const LEVEL_CLASS = { '基礎': 'basic', '標準': 'standard', '発展': 'advanced' };

  let catalog = null;
  let renderSeq = 0; // 連続して遷移したとき、古い描画結果で上書きしないための番号

  // ---------- localStorage(使えない環境でも壊れないように) ----------
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 無視 */ }
    },
  };

  function pushRecent(s, l) {
    const list = storage.get(RECENT_KEY, []).filter((r) => !(r.s === s && r.l === l));
    list.unshift({ s, l });
    storage.set(RECENT_KEY, list.slice(0, RECENT_MAX));
  }

  // ---------- 読み込み ----------
  class ServeError extends Error {}

  async function fetchText(path) {
    let res;
    try {
      res = await fetch(path, { cache: 'no-cache' });
    } catch (e) {
      throw new ServeError(path); // file:// で開いた場合など
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(path + ' の読み込みに失敗しました(' + res.status + ')');
    return res.text();
  }

  async function loadCatalog() {
    if (catalog) return catalog;
    const text = await fetchText('content/index.json');
    if (text == null) throw new Error('content/index.json が見つかりません');
    catalog = JSON.parse(text);
    return catalog;
  }

  // ---------- 公式集・用語集 ----------
  // `## 科目名` の下の `### 項目名` を1件として読む
  const REF_KINDS = {
    formulas: { label: '公式集', desc: '授業で使う公式のまとめ。', placeholder: '公式を絞り込み(例: 共振、時定数)' },
    glossary: { label: '用語集', desc: '用語と簡単な説明。', placeholder: '用語を絞り込み(例: インピーダンス、Huffman)' },
  };
  const refCache = {};

  async function loadReference(cat, kind) {
    if (refCache[kind]) return refCache[kind];
    const text = await fetchText('content/' + kind + '.md');
    refCache[kind] = text == null ? [] : parseReference(text, cat);
    return refCache[kind];
  }

  function parseReference(md, cat) {
    const entries = [];
    let subject = { id: 'other', name: 'その他' };
    let cur = null;
    let inCode = false;
    md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/).forEach((line) => {
      if (/^```/.test(line)) inCode = !inCode;
      const h2 = !inCode && line.match(/^##\s+(.+?)\s*$/);
      const h3 = !inCode && line.match(/^###\s+(.+?)\s*$/);
      if (h2) {
        const name = h2[1];
        subject = cat.subjects.find((s) => s.name === name || s.id === name) || { id: 'other', name };
        cur = null;
      } else if (h3) {
        cur = { title: h3[1], subject, body: '' };
        entries.push(cur);
      } else if (cur) {
        cur.body += line + '\n';
      }
    });
    entries.forEach((e) => {
      e.body = e.body.trim();
      e.search = (e.title + ' ' + plainText(e.body)).toLowerCase();
    });
    return entries;
  }

  // 検索・抜粋用に Markdown から記号や数式を取り除く
  function plainText(md) {
    return md
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\$\$[\s\S]+?\$\$/g, ' ')
      .replace(/\$[^$\n]+\$/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^\s*#+\s*/gm, '')
      .replace(/[*_`>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const splitWords = (q) => q.toLowerCase().split(/[\s ]+/).filter(Boolean);
  const matchesAll = (text, words) => words.every((w) => text.includes(w));

  // 一致箇所の前後を抜き出して <mark> で強調
  function snippet(text, word, len) {
    len = len || 40;
    const i = word ? text.toLowerCase().indexOf(word) : -1;
    if (i < 0) return esc(text.slice(0, len * 2)) + (text.length > len * 2 ? '…' : '');
    const s = Math.max(0, i - len);
    const e = Math.min(text.length, i + word.length + len);
    return (s > 0 ? '…' : '') + esc(text.slice(s, i)) + '<mark>' + esc(text.slice(i, i + word.length)) + '</mark>' +
      esc(text.slice(i + word.length, e)) + (e < text.length ? '…' : '');
  }

  const refHref = (kind, title) => '#/' + kind + '?item=' + encodeURIComponent(title);

  // 単元本文(検索用)。存在しない単元は null
  const lessonTextCache = {};
  async function loadLessonText(sid, lid) {
    const key = sid + '/' + lid;
    if (!(key in lessonTextCache)) {
      const md = await fetchText('content/' + sid + '/' + lid + '.md');
      lessonTextCache[key] = md == null ? null : plainText(md);
    }
    return lessonTextCache[key];
  }

  function findSubject(cat, sid) {
    return cat.subjects.find((s) => s.id === sid) || null;
  }

  function findLesson(cat, sid, lid) {
    const subject = findSubject(cat, sid);
    if (!subject) return null;
    const index = subject.lessons.findIndex((l) => l.id === lid);
    if (index < 0) return null;
    return { subject, lesson: subject.lessons[index], index };
  }

  // ---------- 部品 ----------
  const lessonHref = (sid, lid) => '#/l/' + encodeURIComponent(sid) + '/' + encodeURIComponent(lid);
  const subjectHref = (sid) => '#/s/' + encodeURIComponent(sid);

  function levelTag(level) {
    return '<span class="level level-' + (LEVEL_CLASS[level] || 'basic') + '">' + esc(level) + '</span>';
  }

  function toolChips(ids) {
    if (!ids || !ids.length) return '';
    return ids.map((id) => {
      const t = window.TOOLS[id];
      return t
        ? '<a class="chip" href="#/tools/' + encodeURIComponent(id) + '">' + esc(t.title) + '</a>'
        : '<span class="chip chip-pending" title="準備中">' + esc(id) + '</span>';
    }).join('');
  }

  function breadcrumb(items) {
    return '<nav class="breadcrumb" aria-label="パンくずリスト"><a href="#/">ホーム</a>' +
      items.map((it) => '<span class="sep">›</span>' +
        (it.href ? '<a href="' + it.href + '">' + esc(it.label) + '</a>' : '<span>' + esc(it.label) + '</span>')).join('') +
      '</nav>';
  }

  function subjectClass(sid) {
    return 'subj subj-' + String(sid).replace(/[^a-z0-9-]/gi, '');
  }

  // ---------- 各画面 ----------
  // 各 view は { title, html, after? } を返す。after は DOM 反映後に呼ばれる。

  function viewHome(cat) {
    const recent = storage.get(RECENT_KEY, [])
      .map((r) => findLesson(cat, r.s, r.l))
      .filter(Boolean);

    const recentHtml = recent.length
      ? '<section class="section"><h2 class="section-title">最近見た単元</h2><ul class="link-list">' +
        recent.map(({ subject, lesson }) =>
          '<li><a href="' + lessonHref(subject.id, lesson.id) + '">' +
          '<span class="muted small">' + esc(subject.name) + '</span>' +
          '<span>' + esc(lesson.title) + '</span></a></li>').join('') +
        '</ul></section>'
      : '';

    const cards = cat.subjects.map((s) =>
      '<a class="card ' + subjectClass(s.id) + '" href="' + subjectHref(s.id) + '">' +
      '<span class="card-title">' + esc(s.name) + '</span>' +
      '<span class="card-desc">' + esc(s.desc || '') + '</span>' +
      '<span class="card-meta">' + s.lessons.length + ' 単元</span></a>').join('');

    const toolIds = Object.keys(window.TOOLS);
    const toolsHtml = toolIds.length
      ? '<div class="chips">' + toolChips(toolIds) + '</div>'
      : '<p class="muted">教材は準備中です。</p>';

    return {
      title: '',
      html:
        '<section class="hero"><h1>電気電子情報系 学習ノート</h1>' +
        '<p class="muted">授業の復習用。解説・動かせる教材・公式集・用語集をまとめています。</p></section>' +
        recentHtml +
        '<section class="section"><h2 class="section-title">科目</h2><div class="card-grid">' + cards + '</div></section>' +
        '<section class="section"><h2 class="section-title">動かせる教材 <a class="more" href="#/tools">一覧 →</a></h2>' + toolsHtml + '</section>',
    };
  }

  function viewSubject(cat, sid) {
    const s = findSubject(cat, sid);
    if (!s) return viewNotFound();
    const items = s.lessons.map((l, i) =>
      '<li><a class="lesson-item" href="' + lessonHref(s.id, l.id) + '">' +
      '<span class="lesson-no">' + (i + 1) + '</span>' +
      '<span class="lesson-title">' + esc(l.title) + '</span>' +
      '<span class="lesson-tags">' + levelTag(l.level) + toolChips(l.tools) + '</span>' +
      '</a></li>').join('');
    return {
      title: s.name,
      html:
        breadcrumb([{ label: s.name }]) +
        '<header class="page-head ' + subjectClass(s.id) + '"><h1>' + esc(s.name) + '</h1>' +
        '<p class="muted">' + esc(s.desc || '') + '</p></header>' +
        '<ol class="lesson-list">' + items + '</ol>',
    };
  }

  async function viewLesson(cat, sid, lid) {
    const found = findLesson(cat, sid, lid);
    if (!found) return viewNotFound();
    const { subject, lesson, index } = found;
    pushRecent(sid, lid);

    const path = 'content/' + sid + '/' + lid + '.md';
    const md = await fetchText(path);
    const body = md == null
      ? '<h1>' + esc(lesson.title) + '</h1>' +
        '<div class="empty">まだ本文がありません。<code>src/' + esc(path) + '</code> を作成すると表示されます。</div>'
      : window.Markdown.render(md);

    const prev = subject.lessons[index - 1];
    const next = subject.lessons[index + 1];
    const pager =
      '<nav class="pager" aria-label="前後の単元">' +
      (prev ? '<a class="pager-prev" href="' + lessonHref(sid, prev.id) + '"><span class="muted small">◀ 前の単元</span><span>' + esc(prev.title) + '</span></a>' : '<span></span>') +
      (next ? '<a class="pager-next" href="' + lessonHref(sid, next.id) + '"><span class="muted small">次の単元 ▶</span><span>' + esc(next.title) + '</span></a>' : '<span></span>') +
      '</nav>';

    return {
      title: lesson.title,
      html:
        breadcrumb([{ label: subject.name, href: subjectHref(sid) }, { label: lesson.title }]) +
        '<div class="lesson-layout">' +
        '<details class="toc" id="toc"><summary>目次</summary><ol id="toc-list"></ol></details>' +
        '<div class="lesson-main">' +
        '<article class="prose" id="lesson-body">' + body + '</article>' +
        '<div id="lesson-refs"></div>' +
        pager +
        '</div></div>',
      after() {
        const article = document.getElementById('lesson-body');
        let h1 = article.querySelector('h1');
        if (!h1) {
          article.insertAdjacentHTML('afterbegin', '<h1>' + esc(lesson.title) + '</h1>');
          h1 = article.querySelector('h1');
        }
        h1.insertAdjacentHTML('afterend',
          '<div class="lesson-meta">' + levelTag(lesson.level) + toolChips(lesson.tools) + '</div>');
        buildToc(article);
        window.mountTools(article);
        showLessonRefs(cat, sid, lid);
      },
    };
  }

  // 公式集・用語集のうち、この単元へリンクしている項目を単元の末尾に並べる
  async function showLessonRefs(cat, sid, lid) {
    const link = '(#/l/' + sid + '/' + lid + ')';
    let formulas, glossary;
    try {
      [formulas, glossary] = await Promise.all([loadReference(cat, 'formulas'), loadReference(cat, 'glossary')]);
    } catch (e) {
      return; // 読めなくても本文の表示には影響させない
    }
    const box = document.getElementById('lesson-refs');
    if (!box) return; // 読み込み中に別ページへ移動した
    const pick = (list) => list.filter((e) => e.body.includes(link));
    const f = pick(formulas);
    const g = pick(glossary);
    if (!f.length && !g.length) return;
    const chips = (kind, list) => list.map((e) =>
      '<a class="chip" href="' + refHref(kind, e.title) + '">' + esc(e.title) + '</a>').join('');
    box.innerHTML =
      '<section class="lesson-refs">' +
      (f.length ? '<div><h2 class="section-title">この単元の公式</h2><div class="chips">' + chips('formulas', f) + '</div></div>' : '') +
      (g.length ? '<div><h2 class="section-title">この単元の用語</h2><div class="chips">' + chips('glossary', g) + '</div></div>' : '') +
      '</section>';
  }

  // 本文の ## 見出しから目次を作る
  function buildToc(article) {
    const toc = document.getElementById('toc');
    const list = document.getElementById('toc-list');
    const heads = article.querySelectorAll('h2');
    if (!heads.length) {
      toc.hidden = true;
      return;
    }
    heads.forEach((h, i) => {
      h.id = 'sec-' + (i + 1);
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = h.textContent;
      btn.addEventListener('click', () => h.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      li.appendChild(btn);
      list.appendChild(li);
    });
    // PC では開いた状態、スマホでは折りたたみ
    toc.open = window.matchMedia('(min-width: 900px)').matches;
  }

  function lessonsUsingTool(cat, id) {
    const out = [];
    cat.subjects.forEach((s) => s.lessons.forEach((l) => {
      if ((l.tools || []).includes(id)) out.push({ subject: s, lesson: l });
    }));
    return out;
  }

  function viewTools() {
    const ids = Object.keys(window.TOOLS);
    const body = ids.length
      ? '<div class="card-grid">' + ids.map((id) => {
          const t = window.TOOLS[id];
          return '<a class="card" href="#/tools/' + encodeURIComponent(id) + '">' +
            '<span class="card-title">' + esc(t.title) + '</span>' +
            '<span class="card-desc">' + esc(t.desc || '') + '</span></a>';
        }).join('') + '</div>'
      : '<div class="empty">教材は準備中です。</div>';
    return {
      title: '動かせる教材',
      html: breadcrumb([{ label: '動かせる教材' }]) + '<header class="page-head"><h1>動かせる教材</h1></header>' + body,
    };
  }

  function viewTool(cat, id) {
    const t = window.TOOLS[id];
    if (!t) return viewNotFound();
    const related = lessonsUsingTool(cat, id);
    const relatedHtml = related.length
      ? '<section class="section"><h2 class="section-title">関連単元</h2><ul class="link-list">' +
        related.map(({ subject, lesson }) =>
          '<li><a href="' + lessonHref(subject.id, lesson.id) + '"><span class="muted small">' + esc(subject.name) +
          '</span><span>' + esc(lesson.title) + '</span></a></li>').join('') + '</ul></section>'
      : '';
    return {
      title: t.title,
      html:
        breadcrumb([{ label: '動かせる教材', href: '#/tools' }, { label: t.title }]) +
        '<header class="page-head"><h1>' + esc(t.title) + '</h1><p class="muted">' + esc(t.desc || '') + '</p></header>' +
        '<div id="tool-mount"></div>' + relatedHtml,
      after() {
        window.mountTool(document.getElementById('tool-mount'), id);
      },
    };
  }

  // 公式集・用語集(絞り込みはその場で行い、URL は replaceState で更新)
  async function viewReference(cat, kind, params) {
    const conf = REF_KINDS[kind];
    const entries = await loadReference(cat, kind);
    const q0 = params.get('q') || '';
    const s0 = params.get('s') || 'all';
    const item = params.get('item');

    // 科目ごとにまとめる(index.json の科目順、その他は最後)
    const order = cat.subjects.map((s) => s.id);
    const groups = [];
    entries.forEach((e, i) => {
      let g = groups.find((x) => x.subject.id === e.subject.id && x.subject.name === e.subject.name);
      if (!g) { g = { subject: e.subject, items: [] }; groups.push(g); }
      g.items.push(i);
    });
    groups.sort((a, b) => (order.indexOf(a.subject.id) + 1 || 99) - (order.indexOf(b.subject.id) + 1 || 99));

    const chips = [{ id: 'all', name: 'すべて' }].concat(groups.map((g) => g.subject)).map((s) =>
      '<button type="button" class="filter-chip" data-s="' + esc(s.id) + '" aria-pressed="' + (s.id === s0) + '">' +
      esc(s.name) + '</button>').join('');

    const list = groups.map((g) =>
      '<section class="ref-group ' + subjectClass(g.subject.id) + '" data-s="' + esc(g.subject.id) + '">' +
      '<h2 class="ref-group-title">' + esc(g.subject.name) + '</h2>' +
      g.items.map((i) => {
        const e = entries[i];
        return '<article class="ref-item" id="ref-' + i + '" data-i="' + i + '">' +
          '<h3 class="ref-title">' + esc(e.title) + '</h3>' +
          '<div class="prose ref-body">' + window.Markdown.render(e.body) + '</div></article>';
      }).join('') + '</section>').join('');

    return {
      title: conf.label,
      html:
        breadcrumb([{ label: conf.label }]) +
        '<header class="page-head"><h1>' + conf.label + '</h1><p class="muted">' + conf.desc + '</p></header>' +
        (entries.length
          ? '<div class="ref-controls">' +
            '<input type="search" class="ref-filter" id="ref-filter" placeholder="' + esc(conf.placeholder) + '" aria-label="絞り込み" value="' + esc(q0) + '">' +
            '<div class="filter-chips" role="group" aria-label="科目">' + chips + '</div>' +
            '<p class="muted small" id="ref-count" aria-live="polite"></p></div>' +
            '<div id="ref-list">' + list + '</div>' +
            '<div class="empty" id="ref-empty" hidden>一致する項目はありません。</div>'
          : '<div class="empty"><code>src/content/' + kind + '.md</code> に項目がありません。</div>'),
      after() {
        if (!entries.length) return;
        const input = document.getElementById('ref-filter');
        const state = { q: q0, s: s0 };

        function apply() {
          const words = splitWords(state.q);
          let shown = 0;
          document.querySelectorAll('.ref-item').forEach((el) => {
            const e = entries[+el.dataset.i];
            const ok = (state.s === 'all' || e.subject.id === state.s) && matchesAll(e.search, words);
            el.hidden = !ok;
            if (ok) shown++;
          });
          document.querySelectorAll('.ref-group').forEach((g) => {
            g.hidden = !g.querySelector('.ref-item:not([hidden])');
          });
          document.getElementById('ref-count').textContent = shown + ' / ' + entries.length + ' 件';
          document.getElementById('ref-empty').hidden = shown > 0;
          const qs = new URLSearchParams();
          if (state.q) qs.set('q', state.q);
          if (state.s !== 'all') qs.set('s', state.s);
          const hash = '#/' + kind + (qs.toString() ? '?' + qs : '');
          if (location.hash !== hash) history.replaceState(null, '', hash);
        }

        input.addEventListener('input', () => { state.q = input.value.trim(); apply(); });
        document.querySelectorAll('.filter-chip').forEach((b) => b.addEventListener('click', () => {
          state.s = b.dataset.s;
          document.querySelectorAll('.filter-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          apply();
        }));

        if (item) {
          // 検索結果などから来たときは該当項目へスクロールして強調
          const idx = entries.findIndex((e) => e.title === item);
          if (idx >= 0) {
            history.replaceState(null, '', '#/' + kind);
            const el = document.getElementById('ref-' + idx);
            el.classList.add('is-target');
            requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
          }
        }
        apply();
      },
    };
  }

  async function viewSearch(cat, q) {
    const words = splitWords(q);
    if (!words.length) {
      return {
        title: '検索',
        html: breadcrumb([{ label: '検索' }]) + '<header class="page-head"><h1>検索</h1></header>' +
          '<div class="empty">キーワードを入力してください。</div>',
      };
    }

    // 単元(タイトル+本文)・公式・用語をまとめて検索
    const all = [];
    cat.subjects.forEach((s) => s.lessons.forEach((l) => all.push({ subject: s, lesson: l })));
    const [formulas, glossary, texts] = await Promise.all([
      loadReference(cat, 'formulas'),
      loadReference(cat, 'glossary'),
      Promise.all(all.map(({ subject, lesson }) => loadLessonText(subject.id, lesson.id))),
    ]);

    const lessonHits = [];
    all.forEach((x, i) => {
      const body = texts[i] || '';
      const hay = (x.lesson.title + ' ' + x.subject.name + ' ' + body).toLowerCase();
      if (matchesAll(hay, words)) {
        const w = words.find((w) => body.toLowerCase().includes(w));
        lessonHits.push(Object.assign({ snip: body && w ? snippet(body, w) : '' }, x));
      }
    });
    const formulaHits = formulas.filter((e) => matchesAll(e.search, words));
    const glossaryHits = glossary.filter((e) => matchesAll(e.search, words));
    const total = lessonHits.length + formulaHits.length + glossaryHits.length;

    const group = (label, items) => items.length
      ? '<section class="section"><h2 class="section-title">' + label + '(' + items.length + '件)</h2><ul class="link-list">' + items.join('') + '</ul></section>'
      : '';
    const li = (href, sub, title, extra) =>
      '<li><a href="' + href + '"><span class="muted small">' + esc(sub) + '</span><span>' + esc(title) + '</span>' +
      (extra ? '<span class="search-snip">' + extra + '</span>' : '') + '</a></li>';

    const html =
      group('単元', lessonHits.map((h) => li(lessonHref(h.subject.id, h.lesson.id), h.subject.name, h.lesson.title, h.snip))) +
      group('公式', formulaHits.map((e) => li(refHref('formulas', e.title), e.subject.name, e.title))) +
      group('用語', glossaryHits.map((e) => li(refHref('glossary', e.title), e.subject.name, e.title,
        snippet(plainText(e.body), words.find((w) => plainText(e.body).toLowerCase().includes(w)), 30))));

    return {
      title: '検索: ' + q,
      html:
        breadcrumb([{ label: '検索' }]) +
        '<header class="page-head"><h1>「' + esc(q) + '」の検索結果</h1>' +
        '<p class="muted small">' + total + ' 件(単元の本文・公式集・用語集から検索)</p></header>' +
        (total ? html : '<div class="empty">一致するものはありません。</div>'),
    };
  }

  function viewNotFound() {
    return {
      title: 'ページが見つかりません',
      html: '<header class="page-head"><h1>ページが見つかりません</h1></header>' +
        '<p><a href="#/">ホームに戻る</a></p>',
    };
  }

  function viewError(err) {
    if (err instanceof ServeError) {
      return {
        title: '読み込みエラー',
        html:
          '<header class="page-head"><h1>コンテンツを読み込めません</h1></header>' +
          '<div class="empty"><p>このサイトは Markdown ファイルを読み込むため、ファイルを直接開く(file://)と動きません。簡易サーバー経由で開いてください。</p>' +
          '<ul><li>VS Code の Live Server で <code>src/index.html</code> を開く</li>' +
          '<li><code>src</code> フォルダで <code>python -m http.server 8000</code> を実行し、http://localhost:8000/ を開く</li></ul></div>',
      };
    }
    console.error(err);
    return {
      title: 'エラー',
      html: '<header class="page-head"><h1>エラーが発生しました</h1></header><div class="empty">' + esc(err.message || String(err)) + '</div>',
    };
  }

  // ---------- ルーター ----------
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const qi = raw.indexOf('?');
    const path = qi >= 0 ? raw.slice(0, qi) : raw;
    const params = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : '');
    const parts = path.split('/').filter(Boolean).map((p) => {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { parts, params };
  }

  async function resolve(cat, parts, params) {
    const [a, b, c] = parts;
    if (!a) return viewHome(cat);
    if (a === 's' && b) return viewSubject(cat, b);
    if (a === 'l' && b && c) return viewLesson(cat, b, c);
    if (a === 'tools' && !b) return viewTools();
    if (a === 'tools' && b) return viewTool(cat, b);
    if (a === 'formulas' || a === 'glossary') return viewReference(cat, a, params);
    if (a === 'search') return viewSearch(cat, params.get('q') || '');
    return viewNotFound();
  }

  function updateNav(section) {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      if (el.dataset.nav === section) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
  }

  async function route() {
    const seq = ++renderSeq;
    const { parts, params } = parseHash();
    updateNav(parts[0]);
    if (parts[0] === 'search') searchInput.value = params.get('q') || '';

    let view;
    try {
      const cat = await loadCatalog();
      view = await resolve(cat, parts, params);
    } catch (e) {
      view = viewError(e);
    }
    if (seq !== renderSeq) return; // より新しい遷移が始まっている

    app.innerHTML = view.html;
    document.title = view.title ? view.title + ' | ' + SITE_NAME : SITE_NAME;
    window.scrollTo(0, 0);
    if (view.after) {
      try { view.after(); } catch (e) { console.error(e); }
    }
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) location.hash = '#/search?q=' + encodeURIComponent(q);
  });

  window.addEventListener('hashchange', route);
  route();
})();
