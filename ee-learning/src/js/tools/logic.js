// 教材: 論理式 → 真理値表・カルノー図・最小積和形
(function () {
  'use strict';

  const MAX_VARS = 4;
  const DC = 2; // ドントケア

  // ---------- 論理式のパーサ ----------
  // 優先順位: NOT > AND > XOR > OR
  // NOT: A' / !A / ~A / ¬A   AND: AB / A*B / A·B / A&B   XOR: A^B / A⊕B   OR: A+B / A|B
  function tokenize(s) {
    const toks = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (/\s/.test(c)) continue;
      if (/[A-Za-z]/.test(c)) toks.push({ t: 'var', v: c.toUpperCase() });
      else if (c === '0' || c === '1') toks.push({ t: 'const', v: +c });
      else if ('+|∨'.includes(c)) toks.push({ t: 'or' });
      else if ('*·&∧.・'.includes(c)) toks.push({ t: 'and' });
      else if ('^⊕'.includes(c)) toks.push({ t: 'xor' });
      else if ('!~¬'.includes(c)) toks.push({ t: 'not' });
      else if ("'’′".includes(c)) toks.push({ t: 'post' });
      else if (c === '(' || c === '（') toks.push({ t: 'lp' }); // 全角括弧も可
      else if (c === ')' || c === '）') toks.push({ t: 'rp' });
      else throw new Error('「' + c + '」は使えない文字です');
    }
    return toks;
  }

  function parse(src) {
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i] && toks[i].t;
    const startsUnary = () => ['var', 'const', 'lp', 'not'].includes(peek());

    function parseOr() {
      let a = parseXor();
      while (peek() === 'or') { i++; a = { op: 'or', a, b: parseXor() }; }
      return a;
    }
    function parseXor() {
      let a = parseAnd();
      while (peek() === 'xor') { i++; a = { op: 'xor', a, b: parseAnd() }; }
      return a;
    }
    function parseAnd() {
      let a = parseUnary();
      for (;;) {
        if (peek() === 'and') { i++; a = { op: 'and', a, b: parseUnary() }; }
        else if (startsUnary()) a = { op: 'and', a, b: parseUnary() }; // AB のような省略形
        else return a;
      }
    }
    function parseUnary() {
      if (peek() === 'not') { i++; return { op: 'not', a: parseUnary() }; }
      let a = parsePrimary();
      while (peek() === 'post') { i++; a = { op: 'not', a }; }
      return a;
    }
    function parsePrimary() {
      const t = toks[i];
      if (!t) throw new Error('式が途中で終わっています');
      if (t.t === 'var') { i++; return { op: 'var', name: t.v }; }
      if (t.t === 'const') { i++; return { op: 'const', v: t.v }; }
      if (t.t === 'lp') {
        i++;
        const e = parseOr();
        if (peek() !== 'rp') throw new Error('「)」が足りません');
        i++;
        return e;
      }
      throw new Error('式の書き方が正しくありません');
    }

    if (!toks.length) throw new Error('論理式を入力してください');
    const ast = parseOr();
    if (i < toks.length) throw new Error(toks[i].t === 'rp' ? '「(」が足りません' : '式の書き方が正しくありません');
    return ast;
  }

  function collectVars(node, set) {
    if (node.op === 'var') set.add(node.name);
    if (node.a) collectVars(node.a, set);
    if (node.b) collectVars(node.b, set);
    return set;
  }

  function evaluate(node, env) {
    switch (node.op) {
      case 'var': return env[node.name];
      case 'const': return node.v;
      case 'not': return 1 - evaluate(node.a, env);
      case 'and': return evaluate(node.a, env) & evaluate(node.b, env);
      case 'or': return evaluate(node.a, env) | evaluate(node.b, env);
      case 'xor': return evaluate(node.a, env) ^ evaluate(node.b, env);
    }
    return 0;
  }

  // ---------- 簡単化(クワイン・マクラスキー法、4変数までなので全探索) ----------
  // 項(キューブ)は { v: 値, m: ドントケアのビット } で表す。ビットの最上位が1番目の変数。
  function cellsOf(v, m) {
    const cells = [];
    let s = m;
    for (;;) {
      cells.push(v | s);
      if (s === 0) break;
      s = (s - 1) & m;
    }
    return cells;
  }

  const popcount = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };

  function minimize(n, out) {
    const N = 1 << n;
    const on = [];
    for (let r = 0; r < N; r++) if (out[r] === 1) on.push(r);
    if (!on.length) return [];

    // 0 を含まず、1 を少なくとも1つ含むキューブ = 内項
    const cubes = [];
    for (let m = 0; m < N; m++) {
      for (let v = 0; v < N; v++) {
        if (v & m) continue;
        const cells = cellsOf(v, m);
        if (cells.every((c) => out[c] !== 0) && cells.some((c) => out[c] === 1)) cubes.push({ v, m, cells });
      }
    }
    // 他の内項に含まれないもの = 主項
    const primes = cubes.filter((a) => !cubes.some((b) =>
      b !== a && (b.m & a.m) === a.m && b.m !== a.m && (a.v & ~b.m) === b.v));

    const covers = (p, r) => p.cells.includes(r);
    const literals = (p) => n - popcount(p.m);

    // 必須主項
    const chosen = [];
    on.forEach((r) => {
      const ps = primes.filter((p) => covers(p, r));
      if (ps.length === 1 && !chosen.includes(ps[0])) chosen.push(ps[0]);
    });
    const rest = on.filter((r) => !chosen.some((p) => covers(p, r)));
    const cand = primes.filter((p) => !chosen.includes(p) && rest.some((r) => covers(p, r)));

    // 残りを最少の項数(同数ならリテラル数最少)で覆う組合せを探す
    let best = null;
    const cost = (set) => [set.length, set.reduce((s, p) => s + literals(p), 0)];
    const better = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    function search(start, set) {
      if (best && set.length > best.set.length) return;
      if (rest.every((r) => set.some((p) => covers(p, r)))) {
        const c = cost(set);
        if (!best || better(c, best.cost)) best = { set: set.slice(), cost: c };
        return;
      }
      for (let k = start; k < cand.length; k++) {
        set.push(cand[k]);
        search(k + 1, set);
        set.pop();
      }
    }
    if (rest.length) search(0, []);

    return chosen.concat(best ? best.set : []).sort((a, b) => Math.min.apply(null, a.cells) - Math.min.apply(null, b.cells));
  }

  function termTex(p, vars) {
    const n = vars.length;
    const lits = [];
    vars.forEach((name, k) => {
      const bit = 1 << (n - 1 - k);
      if (p.m & bit) return;
      lits.push(p.v & bit ? name : '\\overline{' + name + '}');
    });
    return lits.length ? lits.join('') : '1';
  }

  // ---------- 教材 ----------
  const PRESETS = [
    { label: 'AB + AB\'', expr: "AB + AB'" },
    { label: '多数決', expr: 'AB + BC + CA' },
    { label: '3変数', expr: "A'B'C + A'BC + AB'C + ABC" },
    { label: '四隅', expr: "A'B'C'D' + A'B'CD' + AB'C'D' + AB'CD'" },
    { label: 'XOR', expr: 'A ^ B' },
    { label: 'ド・モルガン', expr: "(A + B)'" },
  ];

  const GRAY = { 1: [0, 1], 2: [0, 1, 3, 2] };
  const GROUP_COLORS = ['--plot-1', '--plot-2', '--plot-3', '--plot-4', '--plot-5', '--plot-6'];

  window.registerTool('logic', {
    title: '論理式と真理値表・カルノー図',
    desc: '論理式から真理値表とカルノー図を作り、最小積和形に簡単化する',

    mount(el) {
      const K = window.ToolKit;
      el.innerHTML =
        '<div class="tk-field tk-field-wide">' +
        '  <label class="tk-label" for="logic-expr">F =</label>' +
        '  <input class="tk-input tk-mono" id="logic-expr" type="text" spellcheck="false" autocomplete="off">' +
        '</div>' +
        '<div class="tk-row tk-presets" data-k="presets"></div>' +
        '<p class="tk-note">NOT: <code>A\'</code> <code>!A</code>、AND: <code>AB</code> <code>A*B</code>、OR: <code>A+B</code>、XOR: <code>A^B</code>。変数は英字1文字で4つまで。' +
        '真理値表やカルノー図の F をクリックすると 0 → 1 → X(ドントケア)と切り替わります。</p>' +
        '<div class="tk-error" data-k="error" hidden></div>' +
        '<div class="tk-result" data-k="result"></div>' +
        '<div class="tk-logic-grid"><div data-k="table"></div><div data-k="kmap"></div></div>';
      const q = (k) => el.querySelector('[data-k="' + k + '"]');
      const input = el.querySelector('#logic-expr');
      input.id = 'logic-expr-' + Math.random().toString(36).slice(2, 8);
      el.querySelector('label[for="logic-expr"]').htmlFor = input.id;

      const state = { vars: [], out: [], fromTable: false, groups: [], hover: -1 };

      PRESETS.forEach((p) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tk-btn tk-btn-small';
        b.textContent = p.label;
        b.addEventListener('click', () => { input.value = p.expr; fromExpr(); });
        q('presets').appendChild(b);
      });

      function fromExpr() {
        const err = q('error');
        try {
          const ast = parse(input.value);
          const vars = Array.from(collectVars(ast, new Set())).sort();
          if (vars.length > MAX_VARS) throw new Error('変数は ' + MAX_VARS + ' 個までです(' + vars.join(', ') + ')');
          if (!vars.length) throw new Error('変数を1つ以上使ってください');
          const N = 1 << vars.length;
          const out = [];
          for (let r = 0; r < N; r++) {
            const env = {};
            vars.forEach((name, k) => { env[name] = (r >> (vars.length - 1 - k)) & 1; });
            out.push(evaluate(ast, env));
          }
          state.vars = vars;
          state.out = out;
          state.fromTable = false;
          err.hidden = true;
          input.classList.remove('is-stale');
          render();
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
        }
      }

      function toggle(r) {
        state.out[r] = (state.out[r] + 1) % 3;
        state.fromTable = true;
        input.classList.add('is-stale');
        render();
      }

      const sym = (v) => (v === DC ? 'X' : String(v));

      function render() {
        const n = state.vars.length;
        state.groups = minimize(n, state.out);

        // 結果
        const terms = state.groups.map((p, i) =>
          '<span class="tk-term" data-g="' + i + '" style="--g:var(' + GROUP_COLORS[i % GROUP_COLORS.length] + ')">' +
          K.tex(termTex(p, state.vars)) + '</span>');
        const sop = terms.length ? terms.join('<span class="tk-plus">+</span>') : K.tex('0');
        q('result').innerHTML =
          '<div class="tk-result-label">最小積和形' + (state.fromTable ? '(真理値表から)' : '') + '</div>' +
          '<div class="tk-result-expr">' + K.tex('F =') + ' ' + sop + '</div>';
        q('result').querySelectorAll('.tk-term').forEach((t) => {
          t.addEventListener('pointerenter', () => { state.hover = +t.dataset.g; highlight(); });
          t.addEventListener('pointerleave', () => { state.hover = -1; highlight(); });
        });

        // 真理値表
        const head = state.vars.map((v) => '<th>' + v + '</th>').join('') + '<th>F</th>';
        const rows = state.out.map((o, r) => {
          const bits = state.vars.map((_, k) => '<td>' + ((r >> (n - 1 - k)) & 1) + '</td>').join('');
          return '<tr data-r="' + r + '">' + bits + '<td><button type="button" class="tk-cell v' + o + '" data-r="' + r + '">' + sym(o) + '</button></td></tr>';
        }).join('');
        q('table').innerHTML = '<div class="tk-sub">真理値表</div><table class="tk-table"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table>';

        // カルノー図
        q('kmap').innerHTML = n >= 2 ? kmapHtml(n) : '<div class="tk-sub">カルノー図</div><p class="tk-note">変数が2〜4個のとき表示します。</p>';

        el.querySelectorAll('button.tk-cell').forEach((b) => b.addEventListener('click', () => toggle(+b.dataset.r)));
        highlight();
      }

      function kmapHtml(n) {
        const rowBits = n >> 1;          // 2→1, 3→1, 4→2
        const colBits = n - rowBits;     // 2→1, 3→2, 4→2
        const rowVars = state.vars.slice(0, rowBits).join('');
        const colVars = state.vars.slice(rowBits).join('');
        const rows = GRAY[rowBits];
        const cols = GRAY[colBits];
        const bin = (x, w) => x.toString(2).padStart(w, '0');

        let html = '<div class="tk-sub">カルノー図</div><table class="tk-kmap"><thead><tr><th class="tk-corner">' +
          '<span class="tk-corner-col">' + colVars + '</span><span class="tk-corner-row">' + rowVars + '</span></th>';
        cols.forEach((c) => { html += '<th>' + bin(c, colBits) + '</th>'; });
        html += '</tr></thead><tbody>';
        rows.forEach((rc) => {
          html += '<tr><th>' + bin(rc, rowBits) + '</th>';
          cols.forEach((cc) => {
            const r = (rc << colBits) | cc;
            const o = state.out[r];
            const dots = state.groups.map((p, i) => p.cells.includes(r)
              ? '<i style="--g:var(' + GROUP_COLORS[i % GROUP_COLORS.length] + ')" data-g="' + i + '"></i>' : '').join('');
            html += '<td data-r="' + r + '"><button type="button" class="tk-cell v' + o + '" data-r="' + r + '">' + sym(o) + '</button>' +
              '<span class="tk-dots">' + dots + '</span></td>';
          });
          html += '</tr>';
        });
        return html + '</tbody></table>';
      }

      // 項にカーソルを合わせると、その項が覆うマスを強調
      function highlight() {
        const g = state.groups[state.hover];
        el.querySelectorAll('[data-r]').forEach((node) => {
          if (node.tagName === 'BUTTON') return;
          node.classList.toggle('is-hl', !!g && g.cells.includes(+node.dataset.r));
          if (g) node.style.setProperty('--g', 'var(' + GROUP_COLORS[state.hover % GROUP_COLORS.length] + ')');
        });
      }

      let timer = 0;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(fromExpr, 250);
      });

      input.value = 'AB + BC + CA';
      fromExpr();
    },
  });

  // テスト用に公開
  window.LogicTool = { parse, evaluate, collectVars, minimize, termTex };
})();
