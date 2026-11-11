// 教材: RC・RL回路の過渡応答
(function () {
  'use strict';

  window.registerTool('rc', {
    title: 'RC・RL回路の過渡応答',
    desc: 'スイッチを入れた/切ったあとの電圧・電流の変化と時定数 τ を確かめる',

    mount(el) {
      const K = window.ToolKit;
      el.innerHTML =
        '<div class="tk-row" data-k="switches"></div>' +
        '<div class="tk-controls" data-k="controls"></div>' +
        '<div class="tk-readout" data-k="readout"></div>' +
        '<div class="tk-plots tk-plots-stack" data-k="plots"></div>' +
        '<p class="tk-note">グラフ上をなぞると、その時刻の値を表示します。横軸は時定数 τ の倍数。</p>';
      const q = (k) => el.querySelector('[data-k="' + k + '"]');

      const state = { circuit: 'RC', mode: 'on', hoverT: null };

      K.segmented(q('switches'), [{ value: 'RC', label: 'RC 直列' }, { value: 'RL', label: 'RL 直列' }], 'RC', (v) => {
        state.circuit = v;
        C.show(v === 'RC');
        L.show(v === 'RL');
        update();
      });
      K.segmented(q('switches'), [{ value: 'on', label: 'スイッチ ON' }, { value: 'off', label: 'スイッチ OFF' }], 'on', (v) => {
        state.mode = v;
        update();
      });

      const E = K.slider(q('controls'), { label: 'E', min: 1, max: 24, step: 1, value: 10, unit: 'V', onInput: update });
      const R = K.slider(q('controls'), { label: 'R', min: 10, max: 1e6, log: true, value: 1e4, unit: 'Ω', onInput: update });
      const C = K.slider(q('controls'), { label: 'C', min: 1e-7, max: 1e-3, log: true, value: 1e-5, unit: 'F', onInput: update });
      const L = K.slider(q('controls'), { label: 'L', min: 1e-3, max: 10, log: true, value: 0.1, unit: 'H', onInput: update });
      L.show(false);

      // 回路と状態に応じた v(t), i(t)
      function model() {
        const e = E.value;
        const r = R.value;
        const on = state.mode === 'on';
        const I0 = e / r;
        if (state.circuit === 'RC') {
          const tau = r * C.value;
          const k = (t) => Math.exp(-t / tau);
          return {
            tau,
            tauTex: '\\tau = RC',
            vName: 'v_C',
            v: on ? (t) => e * (1 - k(t)) : (t) => e * k(t),
            i: on ? (t) => I0 * k(t) : (t) => -I0 * k(t),
            desc: on
              ? 'コンデンサは最初「短絡」のようにふるまい、電流 E/R が流れる。充電が進むと電流は 0 に近づく。'
              : '充電済みのコンデンサが抵抗を通して放電する(電源を外して短絡した場合)。電流の向きは充電時と逆。',
          };
        }
        const tau = L.value / r;
        const k = (t) => Math.exp(-t / tau);
        return {
          tau,
          tauTex: '\\tau = L/R',
          vName: 'v_L',
          v: on ? (t) => e * k(t) : (t) => -e * k(t),
          i: on ? (t) => I0 * (1 - k(t)) : (t) => I0 * k(t),
          desc: on
            ? 'コイルは電流の急変を妨げるので、電流は 0 から E/R に向かってゆっくり増える。最初は電源電圧がすべてコイルにかかる。'
            : '電源を外して短絡すると、コイルが電流を流し続けようとして逆向きの電圧が出る。電流は E/R から 0 へ減る。',
        };
      }

      function tLabel(n) {
        return n === 0 ? '0' : (n === 1 ? '' : n) + 'τ';
      }

      // 1つのグラフ(電圧 or 電流)を描く
      function drawSignal(ctx, w, h, fn, unit, label, color) {
        const m = model();
        const T = 5 * m.tau;
        const pts = K.sample(fn, 0, T, 200);
        const yr = K.yRange(pts.map((p) => p[1]));
        const plot = K.linePlot(ctx, w, h, {
          x: [0, T],
          y: yr,
          yLabel: label,
          xTicks: [0, 1, 2, 3, 4, 5].map((n) => ({ v: n * m.tau, label: tLabel(n) })),
          yTicks: K.niceTicks(yr[0], yr[1], 4).map((v) => ({ v, label: K.formatSI(v, unit) })),
          series: [{ points: pts, color }],
        });
        // t = τ の点
        const tv = fn(m.tau);
        K.marker(ctx, plot.X(m.tau), plot.Y(tv), color, null);
        // なぞっている時刻
        if (state.hoverT != null) {
          const t = Math.min(T, Math.max(0, state.hoverT));
          ctx.strokeStyle = K.cssVar('--plot-axis');
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(plot.X(t), plot.pad.t);
          ctx.lineTo(plot.X(t), plot.pad.t + plot.ph);
          ctx.stroke();
          ctx.setLineDash([]);
          const align = plot.X(t) > w * 0.65 ? 'left' : 'right';
          K.marker(ctx, plot.X(t), plot.Y(fn(t)), color,
            't = ' + K.formatSI(t, 's') + ' : ' + K.formatSI(fn(t), unit), align);
        }
        plot.T = T;
        return plot;
      }

      let lastPlot = null;
      const pv = K.canvasPlot(q('plots'), 190, (ctx, w, h) => {
        const m = model();
        lastPlot = drawSignal(ctx, w, h, m.v, 'V', (m.vName === 'v_C' ? 'コンデンサ電圧 v_C' : 'コイル電圧 v_L') + ' [V]', K.cssVar('--plot-1'));
      });
      const pi = K.canvasPlot(q('plots'), 190, (ctx, w, h) => {
        drawSignal(ctx, w, h, model().i, 'A', '電流 i [A]', K.cssVar('--plot-2'));
      });

      // なぞって値を読む
      [pv.canvas, pi.canvas].forEach((cv) => {
        cv.addEventListener('pointermove', (e) => {
          if (!lastPlot) return;
          const rect = cv.getBoundingClientRect();
          state.hoverT = lastPlot.Xinv(e.clientX - rect.left);
          if (state.hoverT < 0 || state.hoverT > lastPlot.T) state.hoverT = null;
          pv.redraw();
          pi.redraw();
        });
        cv.addEventListener('pointerleave', () => {
          state.hoverT = null;
          pv.redraw();
          pi.redraw();
        });
      });

      function update() {
        const m = model();
        // t = τ で変化全体の 1 − e⁻¹ ≈ 63.2 % が完了する
        K.readout(q('readout'), [
          { label: '時定数 ' + K.tex(m.tauTex), value: K.formatSI(m.tau, 's') },
          { label: K.tex(m.vName + '(\\tau)'), value: K.formatSI(m.v(m.tau), 'V') },
          { label: K.tex('i(\\tau)'), value: K.formatSI(m.i(m.tau), 'A') },
          { label: 't = τ での変化の完了度', value: K.formatNum((1 - Math.exp(-1)) * 100, 3) + ' %' },
          { label: '説明', value: m.desc, wide: true },
        ]);
        pv.redraw();
        pi.redraw();
      }

      update();
    },
  });
})();
