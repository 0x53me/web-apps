# 正弦波交流とフェーザ

> 下書き(Claude 作成)。授業の記法・進め方に合わせて修正すること。

## 要点

- 正弦波交流は振幅・角周波数・位相で決まる:$v(t)=\sqrt{2}\,V\sin(\omega t+\theta)$($V$ は実効値)
- 同じ周波数の回路では、正弦波を**フェーザ** $\dot V = V e^{j\theta} = V\angle\theta$ で表すと微積分が代数計算になる
- 微分は $j\omega$ 倍、積分は $1/(j\omega)$ 倍
- 素子のインピーダンス:$\dot Z_R = R$、$\dot Z_L = j\omega L$、$\dot Z_C = \dfrac{1}{j\omega C}$

## 解説

### 実効値

周期 $T$ の電圧 $v(t)$ の実効値は、抵抗で同じ電力を消費する直流電圧の値として

$$
V = \sqrt{\frac{1}{T}\int_0^T v(t)^2\,dt}
$$

で定義される。正弦波では最大値 $V_m$ に対して $V = V_m/\sqrt{2}$ となる。

### フェーザ表示

$v(t)=\sqrt{2}\,V\sin(\omega t+\theta) = \mathrm{Im}\left[\sqrt{2}\,V e^{j\theta} e^{j\omega t}\right]$ と書けるので、
回路内で共通の $\sqrt{2}\,e^{j\omega t}$ を省き、複素数 $\dot V = V e^{j\theta}$ だけで計算する。

$$
\frac{d}{dt}\left(\dot V e^{j\omega t}\right) = j\omega \dot V e^{j\omega t}
$$

### 素子ごとの電圧と電流

| 素子 | 時間領域 | フェーザ | インピーダンス | 電流の位相 |
|---|---|---|---|---|
| 抵抗 | $v = Ri$ | $\dot V = R\dot I$ | $R$ | 電圧と同相 |
| コイル | $v = L\dfrac{di}{dt}$ | $\dot V = j\omega L\,\dot I$ | $j\omega L$ | $90^\circ$ 遅れ |
| コンデンサ | $i = C\dfrac{dv}{dt}$ | $\dot I = j\omega C\,\dot V$ | $\dfrac{1}{j\omega C}$ | $90^\circ$ 進み |

### 直列RLC回路

$$
\dot Z = R + j\left(\omega L - \frac{1}{\omega C}\right),\qquad
|\dot Z| = \sqrt{R^2 + \left(\omega L - \frac{1}{\omega C}\right)^2},\qquad
\varphi = \tan^{-1}\frac{\omega L - 1/(\omega C)}{R}
$$

<div data-tool="rlc"></div>

### 電力

電圧と電流の位相差を $\varphi$ とすると

- 有効電力 $P = VI\cos\varphi\ [\mathrm{W}]$
- 無効電力 $Q = VI\sin\varphi\ [\mathrm{var}]$
- 皮相電力 $S = VI = \sqrt{P^2+Q^2}\ [\mathrm{V\,A}]$

$\cos\varphi$ を**力率**という。

## 例題

**問** $R = 30\,\Omega$、$X_L = 60\,\Omega$、$X_C = 20\,\Omega$ の直列回路に実効値 $100\,\mathrm{V}$ の電圧を加えた。電流 $I$、力率、有効電力 $P$ を求めよ。

<details>
<summary>解答</summary>

$\dot Z = 30 + j(60-20) = 30 + j40\ \Omega$ より $|\dot Z| = 50\,\Omega$。

- $I = 100/50 = 2\,\mathrm{A}$
- 力率 $\cos\varphi = R/|\dot Z| = 30/50 = 0.6$(遅れ)
- $P = VI\cos\varphi = 100 \times 2 \times 0.6 = 120\,\mathrm{W}$($= I^2R$ とも一致)

</details>

## 授業メモ

(授業で出た補足・先生の記法などをここに追記)
