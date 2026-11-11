// 教材: 基数変換・2の補数・IEEE 754 単精度
(function () {
  'use strict';

  const DIGITS = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/i };
  const PREFIX = { 2: /^0b/i, 8: /^0o/i, 16: /^0x/i };
  const BASE_NAME = { 2: '2進数', 8: '8進数', 10: '10進数', 16: '16進数' };

  // 入力文字列 → width ビットのビットパターン(BigInt, 0 以上 2^width 未満)
  function parseInt2(text, base, width) {
    const W = BigInt(width);
    let s = text.trim().replace(/[\s_,]/g, '').replace(/^[−ー]/, '-');
    if (!s) throw new Error('値を入力してください');
    let neg = false;
    if (s[0] === '-') {
      if (base !== 10) throw new Error('負の数は10進数で入力してください(他の基数はビットパターンとして解釈します)');
      neg = true;
      s = s.slice(1);
    }
    if (PREFIX[base]) s = s.replace(PREFIX[base], '');
    if (!DIGITS[base].test(s)) throw new Error(BASE_NAME[base] + 'として読めない文字があります');
    let v = 0n;
    const B = BigInt(base);
    for (const ch of s.toLowerCase()) v = v * B + BigInt(parseInt(ch, 16));
    if (neg) v = -v;

    const max = (1n << W) - 1n;
    const min = base === 10 ? -(1n << (W - 1n)) : 0n;
    if (v < min || v > max) {
      throw new Error(width + 'ビットで表せる範囲(' + min + ' 〜 ' + max + ')を超えています');
    }
    return v < 0n ? (1n << W) + v : v;
  }

  const toSigned = (p, width) => (p >> BigInt(width - 1)) & 1n ? p - (1n << BigInt(width)) : p;
  const bin = (p, width) => p.toString(2).padStart(width, '0');
  const group4 = (s) => s.replace(/\B(?=(.{4})+$)/g, ' ');

  function formatIn(p, base, width) {
    if (base === 2) return group4(bin(p, width));
    if (base === 16) return p.toString(16).toUpperCase().padStart(width / 4, '0');
    if (base === 10) return toSigned(p, width).toString();
    return p.toString(base);
  }

  // ビットの並び(クリックで反転)
  function renderBits(container, width, isOn, cls, title, onToggle) {
    // 8ビットずつまとめて、折り返しがバイトの途中で起きないようにする
    let html = '<span class="tk-byte">';
    for (let pos = width - 1; pos >= 0; pos--) {
      html += '<button type="button" class="tk-bit ' + cls(pos) + (isOn(pos) ? ' is-on' : '') +
        '" data-pos="' + pos + '" title="' + title(pos) + '">' + (isOn(pos) ? 1 : 0) + '</button>';
      if (pos % 8 === 0) html += '</span>' + (pos !== 0 ? '<span class="tk-byte">' : '');
    }
    container.innerHTML = html;
    container.querySelectorAll('.tk-bit').forEach((b) => b.addEventListener('click', () => onToggle(+b.dataset.pos)));
  }

  window.registerTool('base', {
    title: '基数変換・2の補数・浮動小数点',
    desc: '2/8/10/16進数の変換、2の補数による負の数、IEEE 754 単精度のビット構成を確かめる',

    mount(el) {
      const K = window.ToolKit;
      const uid = Math.random().toString(36).slice(2, 8);
      el.innerHTML =
        '<div class="tk-sub">整数</div>' +
        '<div class="tk-row" data-k="opts"></div>' +
        '<div class="tk-field tk-field-wide"><label class="tk-label" for="int-' + uid + '">値</label>' +
        '<input class="tk-input tk-mono" id="int-' + uid + '" type="text" spellcheck="false" autocomplete="off"></div>' +
        '<div class="tk-error" data-k="intErr" hidden></div>' +
        '<div class="tk-bits" data-k="intBits"></div>' +
        '<div class="tk-readout" data-k="intOut"></div>' +
        '<div data-k="steps"></div>' +
        '<hr class="tk-sep">' +
        '<div class="tk-sub">IEEE 754 単精度(32ビット)</div>' +
        '<div class="tk-field tk-field-wide"><label class="tk-label" for="flt-' + uid + '">実数</label>' +
        '<input class="tk-input tk-mono" id="flt-' + uid + '" type="text" spellcheck="false" autocomplete="off"></div>' +
        '<div class="tk-error" data-k="fltErr" hidden></div>' +
        '<div class="tk-bits" data-k="fltBits"></div>' +
        '<div class="tk-legend"><span class="tk-bit-key f-sign"></span>符号 <span class="tk-bit-key f-exp"></span>指数部 <span class="tk-bit-key f-frac"></span>仮数部</div>' +
        '<div class="tk-readout" data-k="fltOut"></div>' +
        '<p class="tk-note">ビットをクリックすると 0/1 が切り替わります。</p>';
      const q = (k) => el.querySelector('[data-k="' + k + '"]');
      const intInput = el.querySelector('#int-' + uid);
      const fltInput = el.querySelector('#flt-' + uid);

      // ---------- 整数 ----------
      const st = { base: 10, width: 8, pattern: 0n };

      K.segmented(q('opts'), [2, 8, 10, 16].map((b) => ({ value: b, label: b + '進' })), 10, (b) => {
        st.base = b;
        intInput.value = formatIn(st.pattern, b, st.width);
        updateInt();
      });
      K.segmented(q('opts'), [8, 16, 32].map((w) => ({ value: w, label: w + 'ビット' })), 8, (w) => {
        // 符号付きの値を保ったまま幅を変える(収まらなければ下位ビットだけ残す)
        const signed = toSigned(st.pattern, st.width);
        st.width = w;
        const W = BigInt(w);
        st.pattern = ((signed % (1n << W)) + (1n << W)) % (1n << W);
        intInput.value = formatIn(st.pattern, st.base, w);
        updateInt();
      });

      function updateInt() {
        const err = q('intErr');
        try {
          st.pattern = parseInt2(intInput.value, st.base, st.width);
          err.hidden = true;
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
          return;
        }
        drawInt();
      }

      function drawInt() {
        const p = st.pattern;
        const w = st.width;
        renderBits(q('intBits'), w,
          (pos) => (p >> BigInt(pos)) & 1n,
          (pos) => (pos === w - 1 ? 'f-sign' : ''),
          (pos) => 'ビット' + pos + '(重み ' + (pos === w - 1 ? '−' : '') + '2^' + pos + ')',
          (pos) => {
            st.pattern = p ^ (1n << BigInt(pos));
            intInput.value = formatIn(st.pattern, st.base, w);
            q('intErr').hidden = true;
            drawInt();
          });

        const signed = toSigned(p, w);
        const mono = (s) => '<span class="tk-mono">' + s + '</span>';
        K.readout(q('intOut'), [
          { label: '2進数', value: mono(group4(bin(p, w))), wide: true },
          { label: '8進数', value: mono(p.toString(8)) },
          { label: '16進数', value: mono('0x' + p.toString(16).toUpperCase().padStart(w / 4, '0')) },
          { label: '10進数(符号なし)', value: mono(p.toString()) },
          { label: '10進数(符号付き・2の補数)', value: mono(signed.toString()) },
        ]);

        // 負の数なら「絶対値 → 反転 → +1」の手順を示す
        if (signed < 0n) {
          const abs = -signed;
          const mask = (1n << BigInt(w)) - 1n;
          const inv = (~abs) & mask;
          q('steps').innerHTML =
            '<table class="tk-steps tk-mono"><tbody>' +
            '<tr><th>|x| = ' + abs + '</th><td>' + group4(bin(abs & mask, w)) + '</td></tr>' +
            '<tr><th>ビット反転</th><td>' + group4(bin(inv, w)) + '</td></tr>' +
            '<tr><th>+1</th><td>' + group4(bin((inv + 1n) & mask, w)) + '</td><td class="muted">= ' + signed + '</td></tr>' +
            '</tbody></table>';
        } else {
          q('steps').innerHTML = '';
        }
      }

      let t1 = 0;
      intInput.addEventListener('input', () => { clearTimeout(t1); t1 = setTimeout(updateInt, 200); });

      // ---------- 浮動小数点 ----------
      const dv = new DataView(new ArrayBuffer(4));

      function parseReal(text) {
        const s = text.trim().replace(/^[−ー]/, '-').replace(/[\s_,]/g, '');
        if (!s) throw new Error('値を入力してください');
        if (/^[+-]?nan$/i.test(s)) return NaN;
        if (/^[+-]?(inf|infinity|∞)$/i.test(s)) return s[0] === '-' ? -Infinity : Infinity;
        const v = Number(s);
        if (Number.isNaN(v)) throw new Error('数値として読めません(例: 0.1, -6.25, 1e-3)');
        return v;
      }

      function updateFloat() {
        const err = q('fltErr');
        let x;
        try {
          x = parseReal(fltInput.value);
          err.hidden = true;
        } catch (e) {
          err.textContent = e.message;
          err.hidden = false;
          return;
        }
        dv.setFloat32(0, x);
        drawFloat(x);
      }

      function drawFloat(x) {
        const bits = dv.getUint32(0);
        const stored = dv.getFloat32(0);
        const s = bits >>> 31;
        const e = (bits >>> 23) & 0xff;
        const f = bits & 0x7fffff;

        renderBits(q('fltBits'), 32,
          (pos) => (bits >>> pos) & 1,
          (pos) => (pos === 31 ? 'f-sign' : pos >= 23 ? 'f-exp' : 'f-frac'),
          (pos) => (pos === 31 ? '符号' : pos >= 23 ? '指数部 ビット' + (pos - 23) : '仮数部 2^−' + (23 - pos)),
          (pos) => {
            dv.setUint32(0, (bits ^ (1 << pos)) >>> 0);
            const v = dv.getFloat32(0);
            fltInput.value = String(v);
            q('fltErr').hidden = true;
            drawFloat(v);
          });

        const fBin = f.toString(2).padStart(23, '0');
        let kind;
        let formula;
        if (e === 255) {
          kind = f ? 'NaN(非数)' : (s ? '−∞' : '+∞');
          formula = K.tex(f ? '\\text{NaN}' : (s ? '-' : '+') + '\\infty');
        } else if (e === 0) {
          kind = f ? '非正規化数' : (s ? '−0' : '+0');
          formula = K.tex('(-1)^{' + s + '} \\times 0.' + fBin.replace(/0+$/, '') + (f ? '' : '0') + '_{(2)} \\times 2^{-126}');
        } else {
          kind = '正規化数';
          const frac = fBin.replace(/0+$/, '') || '0';
          formula = K.tex('(-1)^{' + s + '} \\times 1.' + frac + '_{(2)} \\times 2^{' + e + '-127} = (-1)^{' + s + '} \\times 1.' + frac + '_{(2)} \\times 2^{' + (e - 127) + '}');
        }
        const mono = (t) => '<span class="tk-mono">' + t + '</span>';
        const items = [
          { label: '符号 s', value: mono(s) },
          { label: '指数部 e', value: mono(e.toString(2).padStart(8, '0')) + '(= ' + e + ')' },
          { label: '16進表記', value: mono('0x' + bits.toString(16).toUpperCase().padStart(8, '0')) },
          { label: '種類', value: kind },
          { label: '仮数部 f', value: mono(group4(fBin)), wide: true },
          { label: '値の式', value: formula, wide: true },
          { label: '実際に格納される値', value: mono(String(stored)), wide: true },
        ];
        if (Number.isFinite(x) && Number.isFinite(stored)) {
          items.push({ label: '丸め誤差(格納値 − 入力値)', value: mono(String(stored - x)), wide: true });
        } else if (Number.isFinite(x) && !Number.isFinite(stored)) {
          items.push({ label: '注意', value: '単精度の最大値(約 3.4×10³⁸)を超えたため ∞ になりました', wide: true });
        }
        K.readout(q('fltOut'), items);
      }

      let t2 = 0;
      fltInput.addEventListener('input', () => { clearTimeout(t2); t2 = setTimeout(updateFloat, 200); });

      intInput.value = '-5';
      updateInt();
      fltInput.value = '0.1';
      updateFloat();
    },
  });

  // テスト用に公開
  window.BaseTool = { parseInt2, toSigned, formatIn };
})();
