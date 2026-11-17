// ゲームの入口。画面(レンダラー・シーン・カメラ)を用意し、毎フレームの処理を回す。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Track } from './track.js';
import { Kart, collideKarts } from './kart.js';
import { Input } from './input.js';
import { LapCounter, formatTime } from './race.js';
import { KartAI, assistSteer } from './ai.js';

// ---- 画面の準備 ----
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// 画素密度は最大2倍まで(3倍の端末で全部描くと重すぎる)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.render.skyColor);
scene.fog = new THREE.Fog(CONFIG.render.skyColor, CONFIG.render.fogNear, CONFIG.render.fogFar);

// ライトは「空と地面からの光」と「太陽」の2つだけ。影の計算はしない(軽くするため)
scene.add(new THREE.HemisphereLight(0xffffff, 0x4a7a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(60, 100, 40);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.3, 600);

// ---- コースとカート ----
const track = new Track(scene);

// レースに出る全員。プレイヤーは一番後ろ(スロット3)からスタート
const PLAYER_SLOT = 3;
const player = { name: 'あなた', isPlayer: true, slot: PLAYER_SLOT, kart: new Kart(scene, track), laps: new LapCounter(track), ai: null };
const cpus = CONFIG.cpu.karts.map((c, i) => {
  const kart = new Kart(scene, track, c.color);
  return { name: c.name, isPlayer: false, slot: i, kart, laps: new LapCounter(track), ai: new KartAI(kart, 'normal', c) };
});
const racers = [player, ...cpus];
const allKarts = racers.map((r) => r.kart);
const kart = player.kart; // カメラが追いかけるカート
const laps = player.laps;
for (const r of racers) r.kart.placeAtStart(r.slot);

// CPU の強さ(タイトルで選ぶ。前回の選択を覚えておく)
const LEVEL_KEY = 'kart-race-level';
let level = 'normal';
try { level = localStorage.getItem(LEVEL_KEY) || 'normal'; } catch { /* そのまま */ }
if (!CONFIG.cpu.levels[level]) level = 'normal';

// URL に ?debug を付けたときだけ、ブラウザのコンソールから状態を見られるようにする
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, {
    kart, laps, racers, KartAI,
    // 早送り: sec 秒分のレースを一気に計算する(each は1ステップごとに呼ばれる)
    simulate(sec, each) {
      for (let t = 0; t < sec; t += 1 / 60) {
        raceTime += 1 / 60;
        updateRacers(1 / 60);
        if (each) each();
      }
    },
  });
}

// ---- 入力 ----
const controlsEl = document.getElementById('controls');
const input = new Input(controlsEl);

// ---- 画面の要素 ----
const $ = (id) => document.getElementById(id);
const titleEl = $('title');
const hudEl = $('hud');
const speedEl = $('speed-val');
const lapEl = $('lap');
const rankEl = $('rank');
const timeEl = $('time');
const lapListEl = $('lap-list');
const wrongWayEl = $('wrong-way');
const messageEl = $('message');
const finishEl = $('finish');

// state: 'title'(タイトル画面) / 'race'(レース中) / 'finish'(ゴール後)
let state = 'title';
let raceTime = 0;    // レース開始からの時間(秒)
let wrongWay = 0;    // 逆向きに走り続けている時間
let lastMode = 'buttons';
let finishOrder = []; // ゴールした順
let ranking = racers; // 今の順位(1位から順に並べたもの)

// ---- ベストタイムの保存(localStorage)。使えない環境でも止まらないように try で囲む ----
const BEST_TOTAL_KEY = 'kart-race-best-total';
const BEST_LAP_KEY = 'kart-race-best-lap';
function loadBest(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}
function saveBest(key, sec) {
  try { localStorage.setItem(key, String(sec)); } catch { /* 保存できなくても続ける */ }
}

// ---- 画面サイズが変わったとき ----
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- カメラ: カートの後ろからなめらかに追いかける ----
const camGoal = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
let camHeading = kart.heading;

function updateCamera(dt, snap = false) {
  const c = CONFIG.camera;
  // カメラの向きをカートの向きに少しずつ近づける(角度の差は -180°〜180° にそろえる)
  let diff = kart.heading - camHeading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  camHeading += snap ? diff : diff * (1 - Math.exp(-c.turnFollow * dt));

  const fx = Math.sin(camHeading);
  const fz = Math.cos(camHeading);
  camGoal.set(kart.pos.x - fx * c.distance, c.height, kart.pos.z - fz * c.distance);
  if (snap) camera.position.copy(camGoal);
  else camera.position.lerp(camGoal, 1 - Math.exp(-c.follow * dt)); // フレームレートに関係なく同じ速さで追従

  lookTarget.set(kart.pos.x + fx * c.lookAhead, 1.2, kart.pos.z + fz * c.lookAhead);
  camera.lookAt(lookTarget);

  // スピードが出るほど視野を広げてスピード感を出す
  // (ターボで最高速度を超えると、さらに少し広がる)
  const sr = Math.min(1.3, Math.max(0, kart.forwardSpeed) / CONFIG.kart.maxSpeed);
  const fov = c.fov + c.fovBoost * sr;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}
updateCamera(0, true);

// ---- 画面中央に短いメッセージを出す(「LAP 2」「FINAL LAP」など) ----
let messageTimer = 0;
function showMessage(text, seconds = 1.5) {
  messageEl.textContent = text;
  messageEl.hidden = false;
  messageEl.classList.remove('pop');
  void messageEl.offsetWidth; // アニメーションを最初から再生し直すため
  messageEl.classList.add('pop');
  messageTimer = seconds;
}

// ---- 逆走の判定: カートの向きとコースの向きが逆で、しばらく走り続けたら警告 ----
function updateWrongWay(dt) {
  const t = track.tangents[kart.trackIndex];
  const dot = Math.sin(kart.heading) * t.x + Math.cos(kart.heading) * t.z;
  const goingBack = dot < -0.3 && Math.abs(kart.forwardSpeed) > 3;
  wrongWay = goingBack ? wrongWay + dt : 0;
  wrongWayEl.hidden = wrongWay < CONFIG.race.wrongWayTime;
}

// ---- 順位: ゴールした人はゴール順、まだの人は「どれだけ進んだか」で並べる ----
function updateRanking() {
  const running = racers
    .filter((r) => !r.laps.finished)
    .sort((a, b) => b.laps.progress(b.kart) - a.laps.progress(a.kart));
  ranking = [...finishOrder, ...running];
}

const ordinal = (n) => n + (['st', 'nd', 'rd'][n - 1] || 'th'); // 1 → "1st"

// ---- 周回・順位などの表示 ----
let lastHud = '';
function updateHud() {
  const kmh = Math.round(Math.abs(kart.forwardSpeed) * 3.6);
  const lapText = `LAP ${laps.lap}/${CONFIG.race.laps}`;
  const timeText = formatTime(raceTime);
  const rank = ranking.indexOf(player) + 1;
  // 変わったときだけ書きかえる(毎フレーム DOM を触ると重くなるため)
  const key = kmh + lapText + timeText + rank;
  if (key === lastHud) return;
  lastHud = key;
  speedEl.textContent = kmh;
  lapEl.textContent = lapText;
  timeEl.textContent = timeText;
  rankEl.innerHTML = `${ordinal(rank)}<small>/${racers.length}</small>`;
}

function renderLapList() {
  lapListEl.innerHTML = laps.lapTimes
    .map((t, i) => `<li>LAP${i + 1} ${formatTime(t)}</li>`)
    .join('');
}

// ---- ゴールしたとき ----
function finishRace() {
  state = 'finish';
  wrongWayEl.hidden = true;
  // ゴール後はプレイヤーのカートも CPU に運転させる
  player.ai = new KartAI(kart, 'normal');
  const rank = finishOrder.indexOf(player) + 1;
  $('finish-rank').textContent = `${rank}位 / ${racers.length}台`;
  const total = laps.finishTime;
  const bestLap = Math.min(...laps.lapTimes);

  // ベストタイムの更新
  const oldTotal = loadBest(BEST_TOTAL_KEY);
  const oldLap = loadBest(BEST_LAP_KEY);
  const newTotal = !oldTotal || total < oldTotal;
  const newLap = !oldLap || bestLap < oldLap;
  if (newTotal) saveBest(BEST_TOTAL_KEY, total);
  if (newLap) saveBest(BEST_LAP_KEY, bestLap);

  $('finish-total').textContent = formatTime(total);
  $('finish-laps').innerHTML = laps.lapTimes
    .map((t, i) => `<li><span>LAP ${i + 1}</span>${formatTime(t)}${t === bestLap ? ' ★' : ''}</li>`)
    .join('');
  $('finish-best').innerHTML =
    `ベスト合計 ${formatTime(newTotal ? total : oldTotal)}${newTotal ? ' <b>NEW!</b>' : ''}<br>` +
    `ベストラップ ${formatTime(newLap ? bestLap : oldLap)}${newLap ? ' <b>NEW!</b>' : ''}`;

  showMessage(rank === 1 ? '1st! WIN!' : 'FINISH!', 2);
  setTimeout(() => {
    if (state !== 'finish') return;
    controlsEl.hidden = true;
    finishEl.hidden = false;
  }, 1800);
}

// ---- メインループ ----
const clock = new THREE.Clock();

// プレイヤーの入力。スマホのときはハンドルアシストを足す
function playerInput() {
  const inp = input.getState();
  const a = CONFIG.assist;
  if (!input.autoAccel || !a.enabled) return inp; // PC(キーボード)はそのまま

  const auto = assistSteer(kart); // コースに沿って走るためのハンドル
  const off = track.query(kart.pos, kart.trackIndex).offset;
  const over = Math.abs(off) - (track.halfWidth - a.edgeMargin); // 端からはみ出しそうな量
  if (Math.abs(inp.steer) < 0.05) {
    // ハンドルを触っていないときは、コースに沿って自動で軽く切る(端に来たらしっかり切る)
    const s = over > 0 ? a.strength + (1 - a.strength) * Math.min(1, over / 2) : a.strength;
    inp.steer = auto * s;
  } else {
    // 道路の端を越えて外へ向かって切っているときは、少しだけ戻す
    if (over > 0 && Math.sign(inp.steer) === Math.sign(off)) {
      inp.steer += (auto - inp.steer) * a.edgeGuard * Math.min(1, over / 2);
    }
  }
  return inp;
}

// 全員を1フレーム分動かす
function updateRacers(dt) {
  const playerProg = laps.progress(kart);
  const lv = CONFIG.cpu.levels[level];
  for (const r of racers) {
    let inp;
    if (r.ai) {
      // 差が開きすぎないよう、プレイヤーより後ろなら少し速く、前なら少し遅く
      let catchUp = 0;
      if (!r.isPlayer && state === 'race') {
        const gap = playerProg - r.laps.progress(r.kart);
        catchUp = Math.max(-1, Math.min(1, gap / CONFIG.cpu.catchUpDistance)) * lv.catchUp;
      }
      inp = r.ai.getInput(dt, catchUp);
    } else {
      inp = playerInput();
    }
    r.kart.update(dt, inp);
  }
  collideKarts(allKarts);

  // 周回の判定
  for (const r of racers) {
    const ev = r.laps.update(r.kart, raceTime);
    if (ev === 'finish') finishOrder.push(r);
    if (!r.isPlayer) continue;
    if (ev === 'lap') {
      renderLapList();
      showMessage(laps.lap === CONFIG.race.laps ? 'FINAL LAP' : `LAP ${laps.lap}`);
    } else if (ev === 'finish') {
      renderLapList();
      finishRace();
    }
  }
  updateRanking();
}

function loop() {
  // 前のフレームからの経過時間。大きすぎるときは上限で切る
  const dt = Math.min(clock.getDelta(), CONFIG.maxDelta);

  if (state === 'race') {
    raceTime += dt;
    updateRacers(dt);
    if (state === 'race') {
      updateWrongWay(dt);
      updateHud();
    }
  } else if (state === 'finish') {
    raceTime += dt;
    updateRacers(dt); // ゴール後も CPU は走り続ける
  }

  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) messageEl.hidden = true;
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// ---- レースを始める(最初から) ----
function beginRace() {
  for (const r of racers) {
    r.kart.placeAtStart(r.slot);
    r.laps.reset(0);
    r.laps.update(r.kart, 0); // 今いる位置を覚えさせる
    if (r.isPlayer) { r.ai = null; r.kart.speedMul = 1; } // ゴール後の自動運転を解除
    else r.ai.setLevel(level);
  }
  updateCamera(0, true);
  raceTime = 0;
  wrongWay = 0;
  finishOrder = [];
  updateRanking();
  renderLapList();
  lastHud = '';
  updateHud();
  finishEl.hidden = true;
  wrongWayEl.hidden = true;
  hudEl.hidden = false;
  controlsEl.hidden = !input.autoAccel; // 画面のボタンはスマホのときだけ
  state = 'race';
  showMessage('GO!', 1);
}

// ---- タイトル画面: 操作方法を選んでスタート ----
async function start(mode) {
  // スマホ(指で操作する端末)かどうか。PC ならキーボードで遊ぶので画面のボタンは出さない
  const isTouch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

  // スマホなら全画面+横向き固定を試す(対応していない端末では何もしない)
  if (isTouch && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen()
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  }

  if (mode === 'tilt') {
    const ok = await Input.requestTiltPermission();
    if (!ok) {
      alert('傾きセンサーが使えなかったので、ボタン操作で始めます。');
      mode = 'buttons';
    }
  }

  lastMode = mode;
  input.mode = mode;
  input.autoAccel = isTouch; // スマホはアクセル自動(右手の親指をドリフトに使えるように)
  controlsEl.classList.toggle('tilt', mode === 'tilt');
  titleEl.hidden = true;
  beginRace();
}

// ---- タイトルに戻る ----
function backToTitle() {
  state = 'title';
  finishEl.hidden = true;
  hudEl.hidden = true;
  controlsEl.hidden = true;
  messageEl.hidden = true;
  for (const r of racers) r.kart.placeAtStart(r.slot);
  updateCamera(0, true);
  titleEl.hidden = false;
}

// ---- CPU の強さの選択ボタン ----
const levelButtons = [...document.querySelectorAll('[data-level]')];
function selectLevel(lv) {
  level = lv;
  for (const b of levelButtons) b.classList.toggle('on', b.dataset.level === lv);
  try { localStorage.setItem(LEVEL_KEY, lv); } catch { /* 保存できなくても続ける */ }
}
for (const b of levelButtons) b.addEventListener('click', () => selectLevel(b.dataset.level));
selectLevel(level);

$('btn-buttons').addEventListener('click', () => start('buttons'));
$('btn-tilt').addEventListener('click', () => start('tilt'));
$('btn-retry').addEventListener('click', () => { input.mode = lastMode; beginRace(); });
$('btn-title').addEventListener('click', backToTitle);

// ---- スマホでの誤操作を防ぐ ----
document.addEventListener('contextmenu', (e) => e.preventDefault());      // 長押しメニュー
document.addEventListener('gesturestart', (e) => e.preventDefault());     // iOS のピンチ拡大
document.addEventListener('dblclick', (e) => e.preventDefault());         // ダブルタップ拡大
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
