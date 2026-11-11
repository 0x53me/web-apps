# 公式集

<!--
書き方:
  ## 科目名(content/index.json の name と同じにする)
  ### 公式の名前
  本文(Markdown + LaTeX 数式)。関連単元へのリンクは [単元名](#/l/<科目id>/<単元id>)
下書き(Claude 作成)。授業の記法に合わせて修正すること。
-->

## 電気回路・電磁気学

### オームの法則と電力
$$V = RI,\qquad P = VI = RI^2 = \frac{V^2}{R}$$

### 合成抵抗
$$\text{直列: } R = R_1 + R_2 + \cdots,\qquad \text{並列: } \frac{1}{R} = \frac{1}{R_1} + \frac{1}{R_2} + \cdots$$
2つの並列は $R = \dfrac{R_1R_2}{R_1+R_2}$(和分の積)。

### 分圧・分流
$$V_1 = \frac{R_1}{R_1+R_2}V,\qquad I_1 = \frac{R_2}{R_1+R_2}I$$
分流では「相手側の抵抗」が分子に来る。

関連: [回路方程式](#/l/circuits/circuit-equations)

### テブナンの定理
端子 a-b の開放電圧を $V_0$、電源を除いて a-b から見た抵抗を $R_0$ とすると、a-b に $R$ をつないだときの電流は
$$I = \frac{V_0}{R_0 + R}$$
最大電力は $R = R_0$ のとき $P_{\max} = \dfrac{V_0^2}{4R_0}$。

関連: [回路の諸定理](#/l/circuits/theorems)

### 正弦波の実効値
$$V = \frac{V_m}{\sqrt{2}},\qquad \omega = 2\pi f = \frac{2\pi}{T}$$

関連: [正弦波交流とフェーザ](#/l/circuits/ac-phasor)

### 素子のインピーダンス
$$\dot Z_R = R,\qquad \dot Z_L = j\omega L,\qquad \dot Z_C = \frac{1}{j\omega C} = -j\frac{1}{\omega C}$$

関連: [正弦波交流とフェーザ](#/l/circuits/ac-phasor)

### 直列RLC回路のインピーダンス
$$\dot Z = R + j\left(\omega L - \frac{1}{\omega C}\right),\qquad |\dot Z| = \sqrt{R^2 + \left(\omega L - \frac{1}{\omega C}\right)^2}$$

関連: [正弦波交流とフェーザ](#/l/circuits/ac-phasor)

### 共振周波数・Q値・帯域幅(直列共振)
$$f_0 = \frac{1}{2\pi\sqrt{LC}},\qquad Q = \frac{\omega_0 L}{R} = \frac{1}{R}\sqrt{\frac{L}{C}},\qquad B = \frac{f_0}{Q}$$

関連: [共振回路とQ値](#/l/circuits/resonance)

### 交流電力
$$P = VI\cos\varphi\ [\mathrm{W}],\qquad Q = VI\sin\varphi\ [\mathrm{var}],\qquad S = VI = \sqrt{P^2+Q^2}\ [\mathrm{V\,A}]$$
複素電力 $\dot S = \overline{\dot V}\,\dot I = P + jQ$ または $\dot V\,\overline{\dot I}$(教科書により共役の取り方と $Q$ の符号が異なる)。

関連: [正弦波交流とフェーザ](#/l/circuits/ac-phasor)

### 時定数
$$\text{RC 回路: } \tau = RC,\qquad \text{RL 回路: } \tau = \frac{L}{R}$$
$t=\tau$ で変化全体の約 63.2 %、$5\tau$ で約 99.3 % が完了する。

関連: [過渡現象](#/l/circuits/transient)

### RC回路の充電
直流電圧 $E$ を $t=0$ で加えたとき($v_C(0)=0$)
$$v_C(t) = E\left(1 - e^{-t/\tau}\right),\qquad i(t) = \frac{E}{R}e^{-t/\tau}$$

関連: [過渡現象](#/l/circuits/transient)

### クーロンの法則
$$F = \frac{1}{4\pi\varepsilon_0}\frac{Q_1Q_2}{r^2},\qquad \frac{1}{4\pi\varepsilon_0} \approx 9.0\times10^{9}\ \mathrm{N\,m^2/C^2}$$

関連: [静電界](#/l/circuits/electrostatics)

### 点電荷の電界と電位
$$E = \frac{Q}{4\pi\varepsilon_0 r^2},\qquad V = \frac{Q}{4\pi\varepsilon_0 r},\qquad \boldsymbol{E} = -\nabla V$$

関連: [静電界](#/l/circuits/electrostatics)

### ガウスの法則
$$\oint_S \boldsymbol{D}\cdot d\boldsymbol{S} = Q,\qquad \nabla\cdot\boldsymbol{D} = \rho,\qquad \boldsymbol{D} = \varepsilon\boldsymbol{E}$$

関連: [静電界](#/l/circuits/electrostatics)

### 平行板コンデンサ
$$C = \frac{\varepsilon S}{d},\qquad W = \frac{1}{2}CV^2 = \frac{Q^2}{2C}$$

関連: [静電界](#/l/circuits/electrostatics)

### 無限長直線電流の磁界
$$H = \frac{I}{2\pi r},\qquad B = \mu H$$
アンペールの周回積分の法則 $\oint_C \boldsymbol{H}\cdot d\boldsymbol{l} = I$ から求まる。

関連: [電磁誘導とマクスウェル方程式](#/l/circuits/induction-maxwell)

### ファラデーの電磁誘導の法則
$$e = -N\frac{d\Phi}{dt},\qquad e = -L\frac{di}{dt},\qquad W = \frac{1}{2}LI^2$$
負号はレンツの法則(磁束の変化を妨げる向き)を表す。

関連: [電磁誘導とマクスウェル方程式](#/l/circuits/induction-maxwell)

### マクスウェル方程式(微分形)
$$
\nabla\cdot\boldsymbol{D} = \rho,\quad
\nabla\cdot\boldsymbol{B} = 0,\quad
\nabla\times\boldsymbol{E} = -\frac{\partial\boldsymbol{B}}{\partial t},\quad
\nabla\times\boldsymbol{H} = \boldsymbol{J} + \frac{\partial\boldsymbol{D}}{\partial t}
$$

関連: [電磁誘導とマクスウェル方程式](#/l/circuits/induction-maxwell)

## 電子回路

### ダイオードの電流(ショックレーの式)
$$I = I_S\left(e^{V/(nV_T)} - 1\right),\qquad V_T = \frac{kT}{q} \approx 26\ \mathrm{mV}\ (300\ \mathrm{K})$$

関連: [ダイオードと整流回路](#/l/electronics/diode)

### トランジスタの電流関係
$$I_C = \beta I_B\ (= h_{FE} I_B),\qquad I_E = I_B + I_C,\qquad \alpha = \frac{I_C}{I_E} = \frac{\beta}{1+\beta}$$

関連: [トランジスタのバイアスと小信号等価回路](#/l/electronics/transistor)

### 相互コンダクタンスと入力抵抗
$$g_m = \frac{I_C}{V_T},\qquad r_\pi = \frac{\beta}{g_m}$$
エミッタ接地増幅回路(エミッタ抵抗なし、出力抵抗を無視)の電圧利得は $A_v \approx -g_m R_C$。

関連: [トランジスタのバイアスと小信号等価回路](#/l/electronics/transistor)

### オペアンプ増幅回路
$$\text{反転増幅: } A_v = -\frac{R_f}{R_i},\qquad \text{非反転増幅: } A_v = 1 + \frac{R_f}{R_i}$$
理想オペアンプでは仮想短絡($v_+ = v_-$)と入力電流 0 を使って導く。

関連: [オペアンプ応用回路](#/l/electronics/opamp)

### 1次ローパスフィルタ(RC)
$$H(j\omega) = \frac{1}{1 + j\omega CR},\qquad f_c = \frac{1}{2\pi CR}$$
$f_c$ で利得は $-3\ \mathrm{dB}$、位相は $-45^\circ$。それより高い周波数では $-20\ \mathrm{dB/dec}$ で下がる。

関連: [周波数特性とボード線図](#/l/electronics/bode)

### デシベル
$$G_v = 20\log_{10}\left|\frac{V_o}{V_i}\right|\ [\mathrm{dB}],\qquad G_p = 10\log_{10}\frac{P_o}{P_i}\ [\mathrm{dB}]$$
電圧 2 倍 ≈ 6 dB、10 倍 = 20 dB、$1/\sqrt2$ 倍 ≈ −3 dB。

関連: [周波数特性とボード線図](#/l/electronics/bode)

## ディジタル回路

### n ビットで表せる範囲
$$\text{符号なし: } 0 \sim 2^n - 1,\qquad \text{2の補数: } -2^{n-1} \sim 2^{n-1} - 1$$
2の補数で $-x$ は「全ビット反転して 1 を足す」。

関連: [数の表現と基数変換](#/l/digital/number-system)

### IEEE 754 単精度
$$x = (-1)^s \times 1.f_{(2)} \times 2^{e-127}\qquad (1 \le e \le 254)$$
符号 1 ビット、指数部 8 ビット、仮数部 23 ビット。

関連: [数の表現と基数変換](#/l/digital/number-system)

### ド・モルガンの法則
$$\overline{A+B} = \overline{A}\,\overline{B},\qquad \overline{AB} = \overline{A} + \overline{B}$$

関連: [論理関数の簡単化](#/l/digital/logic-minimization)

### ブール代数の簡単化でよく使う式
$$A + AB = A,\qquad A + \overline{A}B = A + B,\qquad AB + A\overline{B} = A$$
$$AB + \overline{A}C + BC = AB + \overline{A}C\quad(\text{コンセンサス})$$

関連: [論理関数の簡単化](#/l/digital/logic-minimization)

### フリップフロップの特性方程式
$$\text{D: } Q^{+} = D,\qquad \text{JK: } Q^{+} = J\overline{Q} + \overline{K}Q,\qquad \text{T: } Q^{+} = T \oplus Q$$

関連: [順序回路](#/l/digital/sequential)

## 情報・プログラミング

### 情報量とエントロピー
$$I = -\log_2 p\ [\mathrm{bit}],\qquad H = -\sum_i p_i \log_2 p_i$$
$n$ 通りが等確率のとき $H = \log_2 n$ で最大。

関連: [情報理論](#/l/info/information-theory)

### シャノンの通信路容量
$$C = B\log_2\left(1 + \frac{S}{N}\right)\ [\mathrm{bit/s}]$$

関連: [情報理論](#/l/info/information-theory)

### 標本化定理
$$f_s > 2f_{\max}$$
$f_s/2$ をナイキスト周波数という。これを超える成分はエイリアシングを起こす。

関連: [標本化と量子化](#/l/info/sampling)

### 量子化
$n$ ビットで $2^n$ 段階。正弦波入力の理想的な量子化 SN 比は
$$\mathrm{SNR} \approx 6.02n + 1.76\ [\mathrm{dB}]$$

関連: [標本化と量子化](#/l/info/sampling)

### 代表的なアルゴリズムの計算量
| アルゴリズム | 計算量 |
|---|---|
| 線形探索 | $O(n)$ |
| 二分探索(整列済み) | $O(\log n)$ |
| バブルソート・挿入ソート | $O(n^2)$ |
| マージソート | $O(n\log n)$ |
| クイックソート | 平均 $O(n\log n)$、最悪 $O(n^2)$ |

関連: [計算量とアルゴリズム](#/l/info/complexity)
