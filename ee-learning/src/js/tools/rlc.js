// 教材: 直列RLC回路のインピーダンス・フェーザ図・周波数特性
(function () {
  'use strict';

  const F_MIN = 10;
  const F_MAX = 1e6;

  window.registerTool('rlc', {
    title: '直列RLC回路のインピーダンス',
    desc: '周波数を変えてリアクタンス・位相・共振のようすを見る',

    mount(el) {
      const K = window.ToolKit;
      el.innerHTML =
        '<div class="tk-controls" data-k="controls"></div>' +
        '<div class="tk-row"><button type="button" class="tk-btn" data-k="toF0">f を共振周波数 f₀ に合わせる</button></div>' +
        '<div class="tk-readout" data-k="readout"></div>' +
        '<div class="tk-plots" data-k="plots"></div>' +
        '<p class="tk-note">左:インピーダンスの複素平面(R・jX<sub>L</sub>・−jX<sub>C</sub> の和が Ż)。' +
        '右:電圧一定のときの電流の大きさ(共振時の電流 I₀ との比)。点線は 1/√2(半値幅の目安)。</p>';
      const q = (k) => el.querySelector('[data-k="' + k + '"]');

      const R = K.slider(q('controls'), { label: 'R', min: 1, max: 1e4, log: true, value: 10, unit: 'Ω', onInput: update });
      const L = K.slider(q('controls'), { label: 'L', min: 1e-4, max: 1, log: true, value: 1e-2, unit: 'H', onInput: update });
      const C = K.slider(q('controls'), { label: 'C', min: 1e-9, max: 1e-4, log: true, value: 1e-6, unit: 'F', onInput: update });
      const F = K.slider(q('controls'), { label: 'f', min: F_MIN, max: F_MAX, log: true, value: 1000, unit: 'Hz', onInput: update });

      q('toF0').addEventListener('click', () => {
        F.set(calc().f0);
        update();
      });

      function calc(f) {
        const r = R.value;
        const l = L.value;
        const c = C.value;
        f = f == null ? F.value : f;
        const w = 2 * Math.PI * f;
        const XL = w * l;
        const XC = 1 / (w * c);
        const X = XL - XC;
        const Z = Math.hypot(r, X);
        const phi = Math.atan2(X, r) * 180 / Math.PI;
        const f0 = 1 / (2 * Math.PI * Math.sqrt(l * c));
        const Q = Math.sqrt(l / c) / r;
        return { r, XL, XC, X, Z, phi, f0, Q, B: f0 / Q };
      }

      // フェーザ図(インピーダンスの複素平面)
      const phasor = K.canvasPlot(q('plots'), 280, (ctx, w, h) => {
        const z = calc();
        const col = {
          axis: K.cssVar('--plot-axis'), text: K.cssVar('--muted'),
          r: K.cssVar('--plot-3'), xl: K.cssVar('--plot-2'), xc: K.cssVar('--plot-4'), z: K.cssVar('--plot-1'),
        };
        // 縦方向は 0〜XL と、X が負なら 0〜X まで入るように、横方向は R が入るように拡大率を決める
        const pad = 28;
        const yUp = z.XL;
        const yDown = Math.max(-z.X, 0);
        const span = Math.max(yUp + yDown, 1e-12);
        const s = Math.min((w - pad * 2 - 70) / Math.max(z.r, 1e-12), (h - pad * 2) / span);
        const ox = Math.max(pad + 8, (w - z.r * s) / 2 - 20); // 図を横方向の中央に寄せる
        const oy = pad + yUp * s;
        ctx.font = '11px ' + K.cssVar('--font');

        // 軸
        ctx.strokeStyle = col.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(4, oy); ctx.lineTo(w - 4, oy);
        ctx.moveTo(ox, 4); ctx.lineTo(ox, h - 4);
        ctx.stroke();
        ctx.fillStyle = col.text;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Re', w - 6, oy - 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('Im', ox + 4, 4);

        const px = ox + z.r * s;
        const pyL = oy - z.XL * s;
        const pyX = oy - z.X * s;
        K.arrow(ctx, ox, oy, px, oy, col.r, 2);
        K.arrow(ctx, px, oy, px, pyL, col.xl, 2);
        // −jXC は jXL と重なって見えないので少し右にずらして描く
        ctx.strokeStyle = col.xc;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(px, pyL); ctx.lineTo(px + 8, pyL); ctx.stroke();
        ctx.setLineDash([]);
        K.arrow(ctx, px + 8, pyL, px + 8, pyX, col.xc, 2);
        K.arrow(ctx, ox, oy, px, pyX, col.z, 3);

        // ベクトルの名前
        ctx.font = 'bold 12px ' + K.cssVar('--font');
        const label = (text, x, y, color, align, base) => {
          ctx.fillStyle = color;
          ctx.textAlign = align;
          ctx.textBaseline = base;
          ctx.fillText(text, x, y);
        };
        label('R', (ox + px) / 2, oy + 4, col.r, 'center', 'top');
        label('jX_L', px - 6, (oy + pyL) / 2, col.xl, 'right', 'middle');
        label('−jX_C', px + 14, (pyL + pyX) / 2, col.xc, 'left', 'middle');
        label('Ż', (ox + px) / 2 - 6, (oy + pyX) / 2 - 4, col.z, 'right', 'bottom');
      });

      // 周波数特性
      const freq = K.canvasPlot(q('plots'), 280, (ctx, w, h) => {
        const z = calc();
        const pts = K.sample((f) => z.r / calc(f).Z, F_MIN, F_MAX, 400, true);
        const plot = K.linePlot(ctx, w, h, {
          x: [F_MIN, F_MAX],
          xLog: true,
          y: [0, 1.08],
          yLabel: '|I| / I₀',
          pad: { l: 40 },
          xTicks: K.logTicks(F_MIN, F_MAX).map((v) => ({ v, label: K.formatSI(v, 'Hz', 1) })),
          yTicks: [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, label: String(v) })),
          guides: [
            { y: Math.SQRT1_2 },
            { x: z.f0 >= F_MIN && z.f0 <= F_MAX ? z.f0 : null, color: K.cssVar('--plot-3') },
          ],
          series: [{ points: pts, color: K.cssVar('--plot-1') }],
        });
        const f = F.value;
        const align = plot.X(f) > w * 0.6 ? 'left' : 'right';
        K.marker(ctx, plot.X(f), plot.Y(z.r / z.Z), K.cssVar('--plot-2'), 'f = ' + K.formatSI(f, 'Hz'), align);
      });

      function update() {
        const z = calc();
        const tol = 0.5; // 位相差 0.5° 以内なら共振とみなす
        const nature = Math.abs(z.phi) < tol ? 'ほぼ共振(抵抗のみと同じ)' : z.phi > 0 ? '誘導性(電流が遅れる)' : '容量性(電流が進む)';
        const sign = z.X >= 0 ? '+' : '−';
        K.readout(q('readout'), [
          { label: K.tex('X_L = \\omega L'), value: K.formatSI(z.XL, 'Ω') },
          { label: K.tex('X_C = 1/\\omega C'), value: K.formatSI(z.XC, 'Ω') },
          { label: K.tex('\\dot Z'), value: K.formatSI(z.r, 'Ω').replace(' Ω', '') + ' ' + sign + ' j' + K.formatSI(Math.abs(z.X), 'Ω') },
          { label: K.tex('|\\dot Z|'), value: K.formatSI(z.Z, 'Ω') },
          { label: '位相角 ' + K.tex('\\varphi'), value: K.formatNum(z.phi, 3) + '°' },
          { label: '性質', value: nature },
          { label: K.tex('f_0 = \\dfrac{1}{2\\pi\\sqrt{LC}}'), value: K.formatSI(z.f0, 'Hz') },
          { label: K.tex('Q = \\dfrac{1}{R}\\sqrt{\\dfrac{L}{C}}'), value: K.formatNum(z.Q, 3) },
          { label: '帯域幅 ' + K.tex('B = f_0/Q'), value: K.formatSI(z.B, 'Hz') },
        ]);
        phasor.redraw();
        freq.redraw();
      }

      update();
    },
  });
})();
