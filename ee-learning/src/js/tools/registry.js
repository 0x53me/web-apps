// 動かせる教材のレジストリと共通部品(ToolKit)
// 各教材ファイルで registerTool('rc', { title, desc, mount(el) { ... } }) を呼んで登録する。
// 本文中の <div data-tool="rc"></div> に mountTools() で埋め込まれる。
(function () {
  'use strict';

  const TOOLS = {};

  function registerTool(id, def) {
    TOOLS[id] = def;
  }

  function esc(s) {
    return window.Markdown.escapeHtml(s);
  }

  // CSS 変数の値を取得(canvas 描画でダークモードに追従するため)
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function mountTool(el, id) {
    const tool = TOOLS[id];
    el.classList.add('tool-embed');
    if (!tool) {
      el.innerHTML = '<div class="tool-pending">教材「' + esc(id) + '」は準備中です</div>';
      return;
    }
    el.innerHTML =
      '<div class="tool-head"><span class="tool-title">' + esc(tool.title) + '</span>' +
      '<a class="tool-link" href="#/tools/' + encodeURIComponent(id) + '">単体で開く</a></div>' +
      '<div class="tool-body"></div>';
    try {
      tool.mount(el.querySelector('.tool-body'));
    } catch (e) {
      console.error(e);
      el.querySelector('.tool-body').innerHTML = '<div class="tool-pending">教材の読み込みに失敗しました</div>';
    }
  }

  function mountTools(root) {
    root.querySelectorAll('[data-tool]').forEach((el) => mountTool(el, el.dataset.tool));
  }

  // ================= ToolKit =================

  // 数値を SI 接頭辞つきで表示(例: 4700 → "4.7 kΩ")
  const PREFIXES = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  function formatSI(v, unit, digits) {
    digits = digits || 3;
    unit = unit || '';
    if (Number.isNaN(v)) return '—';
    if (!Number.isFinite(v)) return (v < 0 ? '−' : '') + '∞ ' + unit;
    if (v === 0) return '0 ' + unit;
    const r = Number(v.toPrecision(digits));
    const a = Math.abs(r);
    const [p, s] = PREFIXES.find(([p]) => a >= p) || PREFIXES[PREFIXES.length - 1];
    const num = Number((r / p).toPrecision(digits));
    return String(num).replace('-', '−') + ' ' + s + unit;
  }

  // 有効数字で丸めた普通の数値表示
  function formatNum(v, digits) {
    if (!Number.isFinite(v)) return v > 0 ? '∞' : v < 0 ? '−∞' : '—';
    return String(Number(v.toPrecision(digits || 3))).replace('-', '−');
  }

  let uid = 0;

  // スライダー。log: true で対数スケール(R, C, L, f など桁が変わる量向け)
  function slider(container, o) {
    const id = 'tk-' + (++uid);
    const STEPS = 1000;
    const wrap = document.createElement('div');
    wrap.className = 'tk-field';
    wrap.innerHTML =
      '<label class="tk-label" for="' + id + '">' + o.label + '</label>' +
      '<input id="' + id + '" type="range">' +
      '<output class="tk-value" for="' + id + '"></output>';
    container.appendChild(wrap);
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');

    let value = o.value;
    if (o.log) {
      input.min = 0; input.max = STEPS; input.step = 1;
    } else {
      input.min = o.min; input.max = o.max; input.step = o.step || 'any';
    }

    const toPos = (v) => o.log ? Math.round(Math.log(v / o.min) / Math.log(o.max / o.min) * STEPS) : v;
    const fromPos = (p) => {
      if (!o.log) return Number(p);
      const v = o.min * Math.pow(o.max / o.min, p / STEPS);
      return Number(v.toPrecision(2)); // 対数スライダーは有効数字2桁に丸める
    };
    const show = () => {
      out.textContent = o.format ? o.format(value) : formatSI(value, o.unit || '');
    };

    input.addEventListener('input', () => {
      value = fromPos(input.value);
      show();
      if (o.onInput) o.onInput(value);
    });

    const api = {
      get value() { return value; },
      set(v) {
        value = Math.min(o.max, Math.max(o.min, v));
        input.value = toPos(value);
        show();
      },
      show(visible) { wrap.hidden = !visible; },
    };
    api.set(value);
    return api;
  }

  // ボタン型の切り替え(セグメント)
  function segmented(container, options, value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'tk-segment';
    wrap.setAttribute('role', 'group');
    let current = value;
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt.label;
      b.dataset.value = opt.value;
      b.addEventListener('click', () => {
        if (current === opt.value) return;
        api.set(opt.value);
        onChange(opt.value);
      });
      wrap.appendChild(b);
    });
    container.appendChild(wrap);
    const api = {
      get value() { return current; },
      set(v) {
        current = v;
        wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
      },
    };
    api.set(value);
    return api;
  }

  // 結果表示(ラベルと値のグリッド)。label/value は HTML 可
  function readout(container, items) {
    container.innerHTML = items.map((it) =>
      '<div class="tk-stat' + (it.wide ? ' tk-stat-wide' : '') + '"><span class="tk-stat-label">' + it.label +
      '</span><span class="tk-stat-value">' + it.value + '</span></div>').join('');
  }

  // 高 DPI 対応の canvas。サイズ変更・ダークモード切替で自動再描画
  function canvasPlot(container, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.className = 'tk-canvas';
    canvas.style.height = height + 'px';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    function redraw() {
      const w = canvas.clientWidth;
      if (!w) return;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.round(w * dpr);
      const ph = Math.round(height * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, height);
      draw(ctx, w, height);
    }

    const ro = new ResizeObserver(() => {
      if (!canvas.isConnected) { ro.disconnect(); return; }
      redraw();
    });
    ro.observe(canvas);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => {
      if (!canvas.isConnected) { mq.removeEventListener('change', onTheme); return; }
      redraw();
    };
    mq.addEventListener('change', onTheme);

    return { canvas, redraw };
  }

  // 見やすい目盛り値
  function niceTicks(min, max, count) {
    count = count || 5;
    const span = max - min;
    if (!(span > 0)) return [min];
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) {
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return ticks;
  }

  // 対数軸の目盛り(10 のべき乗)
  function logTicks(min, max) {
    const ticks = [];
    for (let e = Math.ceil(Math.log10(min) - 1e-9); e <= Math.floor(Math.log10(max) + 1e-9); e++) ticks.push(Math.pow(10, e));
    return ticks;
  }

  // データ範囲から y 軸範囲を決める(0 を含め、少し余白を足す)
  function yRange(values, includeZero) {
    let lo = Math.min.apply(null, values);
    let hi = Math.max.apply(null, values);
    if (includeZero !== false) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (lo === hi) { hi = lo + 1; }
    const m = (hi - lo) * 0.08;
    return [lo < 0 ? lo - m : lo, hi > 0 ? hi + m : hi];
  }

  function sample(fn, x0, x1, n, log) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const x = log ? x0 * Math.pow(x1 / x0, f) : x0 + (x1 - x0) * f;
      pts.push([x, fn(x)]);
    }
    return pts;
  }

  // 折れ線グラフ。座標変換 { X, Y, Xinv, pad } を返す
  function linePlot(ctx, w, h, o) {
    const pad = Object.assign({ l: 56, r: 14, t: o.yLabel ? 24 : 12, b: 28 }, o.pad || {});
    const [x0, x1] = o.x;
    const [y0, y1] = o.y;
    const lx = (v) => o.xLog ? Math.log10(v) : v;
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    const X = (v) => pad.l + (lx(v) - lx(x0)) / (lx(x1) - lx(x0)) * pw;
    const Y = (v) => pad.t + ph - (v - y0) / (y1 - y0) * ph;
    const Xinv = (px) => {
      const l = lx(x0) + (px - pad.l) / pw * (lx(x1) - lx(x0));
      return o.xLog ? Math.pow(10, l) : l;
    };

    const grid = cssVar('--plot-grid');
    const axis = cssVar('--plot-axis');
    const text = cssVar('--muted');
    ctx.font = '11px ' + cssVar('--font');
    ctx.lineWidth = 1;

    const hline = (y) => { ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); };
    const vline = (x) => { ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke(); };

    ctx.strokeStyle = grid;
    ctx.fillStyle = text;
    (o.xTicks || []).forEach((t) => {
      const px = Math.round(X(t.v)) + 0.5;
      vline(px);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(t.label, px, pad.t + ph + 6);
    });
    (o.yTicks || []).forEach((t) => {
      const py = Math.round(Y(t.v)) + 0.5;
      hline(py);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.label, pad.l - 6, py);
    });

    ctx.strokeStyle = axis;
    if (y0 <= 0 && y1 >= 0) hline(Math.round(Y(0)) + 0.5);
    vline(Math.round(pad.l) + 0.5);

    if (o.yLabel) {
      ctx.fillStyle = text;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(o.yLabel, pad.l + 2, 4);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, pw, ph);
    ctx.clip();
    (o.guides || []).forEach((g) => {
      ctx.strokeStyle = g.color || axis;
      ctx.setLineDash(g.dash || [4, 4]);
      if (g.x != null) vline(X(g.x));
      if (g.y != null) hline(Y(g.y));
    });
    ctx.setLineDash([]);
    (o.series || []).forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();

    return { X, Y, Xinv, pad, pw, ph };
  }

  // 点とラベル(グラフ上の注目点)
  function marker(ctx, x, y, color, label, align) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (!label) return;
    ctx.font = '12px ' + cssVar('--font');
    const tw = ctx.measureText(label).width;
    const right = align !== 'left';
    const bx = right ? x + 8 : x - 8 - tw - 8;
    const by = y - 22;
    ctx.fillStyle = cssVar('--surface');
    ctx.globalAlpha = 0.9;
    ctx.fillRect(bx, by, tw + 8, 18);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cssVar('--text');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 4, by + 9);
  }

  // 矢印(フェーザ図など)
  function arrow(ctx, x0, y0, x1, y1, color, width) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (len < 2) return;
    const a = Math.atan2(y1 - y0, x1 - x0);
    const hs = Math.min(10, len * 0.4);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hs * Math.cos(a - 0.4), y1 - hs * Math.sin(a - 0.4));
    ctx.lineTo(x1 - hs * Math.cos(a + 0.4), y1 - hs * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  // TeX を KaTeX で描画(読み込めていなければソースをそのまま)
  function tex(src) {
    if (!window.katex) return '<code>' + esc(src) + '</code>';
    return window.katex.renderToString(src, { throwOnError: false, output: 'html' });
  }

  window.TOOLS = TOOLS;
  window.registerTool = registerTool;
  window.mountTool = mountTool;
  window.mountTools = mountTools;
  window.cssVar = cssVar;
  window.ToolKit = {
    esc, cssVar, formatSI, formatNum, slider, segmented, readout, canvasPlot,
    niceTicks, logTicks, yRange, sample, linePlot, marker, arrow, tex,
  };
})();
