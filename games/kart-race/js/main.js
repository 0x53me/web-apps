// ゲームの入口。画面(レンダラー・シーン・カメラ)を用意し、毎フレームの処理を回す。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Track } from './track.js';
import { Kart, collideKarts } from './kart.js';
import { Input } from './input.js';
import { LapCounter, formatTime } from './race.js';
import { KartAI, assistSteer } from './ai.js';
import { Net, cleanName } from './net.js';
import { Items, ITEM_ICONS } from './items.js';

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
const items = new Items(scene, track); // アイテムボックスとパイロン
let pylonSeq = 0; // 自分が置いたパイロンの通し番号(オンライン対戦で全員が同じ id で呼べるように)

// レースに出る4台。番号(entry)0 は赤、1〜3 は CPU の色(青・緑・黄)。
// 1人で遊ぶとき: 0 があなた(一番後ろのスロット3から)、1〜3 が CPU。
// オンライン対戦: 部屋の中の番号 = カートの番号。空いた番号は CPU。
// kind: 'me'(この端末で操作する) / 'cpu'(この端末で CPU が運転する) / 'remote'(ほかの端末から届いた動きで表示する)
const PLAYER_SLOT = 3;
const entryColor = (e) => (e === 0 ? CONFIG.kart.color : CONFIG.cpu.karts[e - 1].color);
const racers = [0, 1, 2, 3].map((e) => {
  const opts = e === 0 ? {} : CONFIG.cpu.karts[e - 1];
  const kart = new Kart(scene, track, entryColor(e));
  return {
    entry: e,
    cpuName: e === 0 ? 'レッド' : opts.name,
    name: '',
    kind: 'cpu',
    human: false,     // 人が運転しているか(CPU の速さ調整の基準にする)
    isPlayer: false,  // この端末の人のカートか
    slot: e,
    kart,
    laps: new LapCounter(track),
    cpuAI: new KartAI(kart, 'normal', opts), // CPU として走るときの運転手
    ai: null,         // 今の運転手(null ならプレイヤーの入力)
    net: null,        // remote: 最後に届いた状態
    raw: null,        // remote: 最後に届いた状態(送られてきたままの形。ホストが全員に転送する)
    active: true,     // false = 途中で抜けた人(表示しない)
    prevItem: false,  // 前のフレームでアイテムボタンを押していたか(押した瞬間だけ使うため)
  };
});
let active = racers;  // 今レースに出ているカート
let me = racers[0];   // この端末の人
let kart = me.kart;   // カメラが追いかけるカート
let laps = me.laps;

// 役割を決める
function setRole(r, kind, name, slot, human) {
  r.kind = kind;
  r.name = name;
  r.slot = slot;
  r.human = human;
  r.isPlayer = kind === 'me';
  r.ai = kind === 'cpu' ? r.cpuAI : null;
  r.kart.remote = kind === 'remote';
  r.kart.speedMul = 1;
  r.net = r.raw = null;
  r.active = true;
  r.kart.mesh.visible = true;
  r.kart.fx.points.visible = true;
  if (r.isPlayer) { me = r; kart = r.kart; laps = r.laps; }
}

// 1人で遊ぶときの並び
function setupOffline() {
  online = false;
  for (const r of racers) {
    if (r.entry === 0) setRole(r, 'me', 'あなた', PLAYER_SLOT, true);
    else setRole(r, 'cpu', r.cpuName, r.entry - 1, false);
  }
  active = racers;
}

// オンライン対戦の並び。人はグリッドの後ろから、CPU は前から並べる
function setupOnline(members) {
  online = true;
  const humans = new Set(members.map((m) => m.idx));
  let back = racers.length - 1;
  for (const m of [...members].sort((a, b) => a.idx - b.idx)) {
    setRole(racers[m.idx], m.idx === net.myIdx ? 'me' : 'remote', cleanName(m.name), back--, true);
  }
  let front = 0;
  for (const r of racers) {
    if (humans.has(r.entry)) continue;
    // CPU を運転するのはホストだけ。参加者の画面ではホストから届いた動きで表示する
    setRole(r, net.isHost ? 'cpu' : 'remote', r.cpuName, front++, false);
  }
  active = racers.slice();
}

// レースから外す(オンライン対戦で途中で抜けた人)
function removeRacer(r) {
  r.active = false;
  r.kart.mesh.visible = false;
  r.kart.fx.points.visible = false;
  active = racers.filter((x) => x.active);
}

// CPU の強さ(タイトルで選ぶ。前回の選択を覚えておく)
const LEVEL_KEY = 'kart-race-level';
let level = 'normal';
try { level = localStorage.getItem(LEVEL_KEY) || 'normal'; } catch { /* そのまま */ }
if (!CONFIG.cpu.levels[level]) level = 'normal';

// ---- オンライン対戦の通信 ----
const net = new Net();
let online = false;   // オンライン対戦中か
let raceNo = 0;       // 何回目のレースか(前のレースの古いデータを混ぜないため)
let sendTimer = 0;

setupOffline();

// URL に ?debug を付けたときだけ、ブラウザのコンソールから状態を見られるようにする
if (new URLSearchParams(location.search).has('debug')) {
  // kart・laps はオンライン対戦で入れかわるので、見るたびに今の値を返す
  Object.defineProperty(window, 'kart', { get: () => kart, configurable: true });
  Object.defineProperty(window, 'laps', { get: () => laps, configurable: true });
  Object.assign(window, {
    racers, KartAI, net,
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
const lobbyEl = $('lobby');

// state: 'title'(タイトル・ロビー) / 'countdown'(スタート前) / 'race'(レース中) / 'finish'(ゴール後)
let state = 'title';
let raceTime = 0;    // レース開始からの時間(秒)
let countdown = 0;   // スタートまでの残り時間(秒)
let wrongWay = 0;    // 逆向きに走り続けている時間
let lastMode = 'buttons';
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

// ---- 順位 ----
// どれだけ進んだか / ゴールしたタイム(まだなら 0)。
// ほかの端末のカートは、その端末から届いた値を使う(周回はそれぞれの端末で数える)
const progressOf = (r) => (r.kind === 'remote' ? (r.net ? r.net.prog : 0) : r.laps.progress(r.kart));
const finishTimeOf = (r) => (r.kind === 'remote' ? (r.net ? r.net.fin : 0) : (r.laps.finished ? r.laps.finishTime : 0));

// ゴールした人はタイム順、まだの人は「どれだけ進んだか」で並べる
function updateRanking() {
  const done = active.filter((r) => finishTimeOf(r) > 0).sort((a, b) => finishTimeOf(a) - finishTimeOf(b));
  const running = active.filter((r) => !(finishTimeOf(r) > 0)).sort((a, b) => progressOf(b) - progressOf(a));
  ranking = [...done, ...running];
}

const ordinal = (n) => n + (['st', 'nd', 'rd'][n - 1] || 'th'); // 1 → "1st"

// ---- 周回・順位などの表示 ----
let lastHud = '';
function updateHud() {
  const kmh = Math.round(Math.abs(kart.forwardSpeed) * 3.6);
  const lapText = `LAP ${laps.lap}/${CONFIG.race.laps}`;
  const timeText = formatTime(raceTime);
  const rank = ranking.indexOf(me) + 1;
  // 変わったときだけ書きかえる(毎フレーム DOM を触ると重くなるため)
  const key = kmh + lapText + timeText + rank + '/' + active.length;
  if (key === lastHud) return;
  lastHud = key;
  speedEl.textContent = kmh;
  lapEl.textContent = lapText;
  timeEl.textContent = timeText;
  rankEl.innerHTML = `${ordinal(rank)}<small>/${active.length}</small>`;
}

function renderLapList() {
  lapListEl.innerHTML = laps.lapTimes
    .map((t, i) => `<li>LAP${i + 1} ${formatTime(t)}</li>`)
    .join('');
}

// 色の数字(0xe63946)を CSS の色("#e63946")にする
const cssColor = (hex) => '#' + hex.toString(16).padStart(6, '0');

// オンライン対戦のゴール画面: 全員の順位(名前はほかの人が入力したものなので textContent で入れる)
const finishListEl = $('finish-list');
function renderStandings() {
  finishListEl.textContent = '';
  ranking.forEach((r, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--c', cssColor(entryColor(r.entry)));
    if (r === me) li.className = 'me';
    const name = document.createElement('span');
    name.textContent = `${i + 1}. ${r.name}${r.human ? '' : '(CPU)'}`;
    const time = document.createElement('span');
    const t = finishTimeOf(r);
    time.textContent = t > 0 ? formatTime(t) : '走行中';
    li.append(name, time);
    finishListEl.append(li);
  });
}

// ---- ゴールしたとき ----
function finishRace() {
  state = 'finish';
  wrongWayEl.hidden = true;
  // ゴール後はプレイヤーのカートも CPU に運転させる
  me.ai = new KartAI(kart, 'normal');
  const rank = ranking.indexOf(me) + 1;
  $('finish-rank').textContent = `${rank}位 / ${active.length}台`;
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

  // ボタンの文字: オンライン対戦では、次のレースを始められるのはホストだけ
  finishListEl.hidden = !online;
  $('finish-wait').hidden = !(online && !net.isHost);
  $('btn-retry').hidden = online && !net.isHost;
  $('btn-title').textContent = !online ? 'タイトルへ' : net.isHost ? 'ロビーへ' : '退出';
  if (online) renderStandings();

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
  const lv = CONFIG.cpu.levels[level];
  // CPU の速さ調整の基準: 人が運転しているカートの進み具合の平均
  const humans = active.filter((r) => r.human);
  const humanProg = humans.reduce((s, r) => s + progressOf(r), 0) / Math.max(1, humans.length);
  for (const r of active) {
    if (r.kind === 'remote') {
      r.kart.updateRemote(dt, r.net); // ほかの端末から届いた動きに合わせる
      continue;
    }
    let inp;
    if (r.ai) {
      // 差が開きすぎないよう、人より後ろなら少し速く、前なら少し遅く
      let catchUp = 0;
      if (r.kind === 'cpu' && state === 'race') {
        const gap = humanProg - r.laps.progress(r.kart);
        catchUp = Math.max(-1, Math.min(1, gap / CONFIG.cpu.catchUpDistance)) * lv.catchUp;
      }
      inp = r.ai.getInput(dt, catchUp);
    } else {
      inp = playerInput();
    }
    r.kart.update(dt, inp);
    // アイテム: ルーレットを進め、ボタンを押した瞬間に使う
    if (r.kart.itemRoll > 0) r.kart.itemRoll = Math.max(0, r.kart.itemRoll - dt);
    if (inp.item && !r.prevItem) useItem(r);
    r.prevItem = inp.item;
  }
  collideKarts(active.map((r) => r.kart));

  // アイテムボックスとパイロン(この端末で動かしているカートだけ調べて、ほかの端末に知らせる)
  for (const r of active) {
    if (r.kind === 'remote') continue;
    const b = items.touchBox(r.kart);
    if (b >= 0) {
      items.takeBox(b);
      sendEvent({ e: 'box', i: b });
      if (!r.kart.item) giveItem(r);
    }
    const hit = items.hitPylon(r.kart);
    if (hit !== null) {
      items.removePylon(hit);
      sendEvent({ e: 'hit', id: hit });
      r.kart.spinOut();
    }
  }

  // 周回の判定(この端末で動かしているカートだけ)
  let myEvent = null;
  for (const r of active) {
    if (r.kind === 'remote') continue;
    const ev = r.laps.update(r.kart, raceTime);
    if (r === me) myEvent = ev;
  }
  updateRanking();
  if (myEvent === 'lap') {
    renderLapList();
    showMessage(laps.lap === CONFIG.race.laps ? 'FINAL LAP' : `LAP ${laps.lap}`);
  } else if (myEvent === 'finish') {
    renderLapList();
    finishRace();
  }
}

// ---- アイテム ----
// ボックスを取ったとき: 後ろの順位ほどダッシュが出やすい
function giveItem(r) {
  const c = CONFIG.items;
  const n = ranking.length;
  const place = n > 1 ? Math.max(0, ranking.indexOf(r)) / (n - 1) : 0; // 1位 = 0 〜 最下位 = 1
  const dashChance = c.dashChanceTop + (c.dashChanceLast - c.dashChanceTop) * place;
  r.kart.item = Math.random() < dashChance ? 'dash' : 'pylon';
  r.kart.itemRoll = c.rollTime;
}

// アイテムを使う
function useItem(r) {
  const k = r.kart;
  if (!k.item || k.itemRoll > 0 || k.spinTime > 0) return;
  if (k.item === 'dash') {
    k.addBoost(CONFIG.items.dashTime);
  } else if (k.item === 'pylon') {
    // カートの真後ろに置く
    const back = CONFIG.items.pylonBehind;
    const x = round(k.pos.x - Math.sin(k.heading) * back);
    const z = round(k.pos.z - Math.cos(k.heading) * back);
    const id = `${r.entry}-${raceNo}-${++pylonSeq}`;
    items.addPylon(id, x, z);
    sendEvent({ e: 'pylon', id, x, z });
  }
  k.item = null;
}

// 持っているアイテムの表示(ルーレット中はマークがくるくる変わる)
const itemSlotEl = $('item-slot');
const itemIconEl = $('item-icon');
const ICON_LIST = Object.values(ITEM_ICONS);
let lastItemIcon = '';
function updateItemSlot() {
  let icon = '';
  if (kart.item) {
    icon = kart.itemRoll > 0 ? ICON_LIST[Math.floor(kart.itemRoll * 12) % ICON_LIST.length] : ITEM_ICONS[kart.item];
  }
  const key = icon + (kart.itemRoll > 0 ? 'r' : '') + kart.item;
  if (key === lastItemIcon) return;
  lastItemIcon = key;
  itemIconEl.textContent = icon;
  itemSlotEl.className = 'item-slot' + (kart.item && kart.itemRoll <= 0 ? ' ready ' + kart.item : '');
}

let standingsTimer = 0;
function loop() {
  // 前のフレームからの経過時間。大きすぎるときは上限で切る
  const dt = Math.min(clock.getDelta(), CONFIG.maxDelta);

  if (state === 'countdown') {
    // スタート前のカウントダウン(オンライン対戦)。この間は誰も動けない
    const before = Math.ceil(countdown);
    countdown -= dt;
    if (countdown <= 0) {
      state = 'race';
      showMessage('GO!', 1);
    } else if (Math.ceil(countdown) !== before) {
      showMessage(String(Math.ceil(countdown)), 0.9);
    }
  } else if (state === 'race') {
    raceTime += dt;
    updateRacers(dt);
    if (state === 'race') {
      updateWrongWay(dt);
      updateHud();
      updateItemSlot();
    }
  } else if (state === 'finish') {
    raceTime += dt;
    updateRacers(dt); // ゴール後も CPU は走り続ける
    // オンライン対戦: あとからゴールした人を順位表に反映する
    standingsTimer -= dt;
    if (online && standingsTimer <= 0) {
      standingsTimer = 0.5;
      renderStandings();
    }
  }

  // オンライン対戦: 自分のカートの状態を送る
  if (online && state !== 'title') {
    sendTimer -= dt;
    if (sendTimer <= 0) {
      sendTimer = CONFIG.online.sendInterval;
      sendStates();
    }
  }

  items.update(dt);

  if (messageTimer > 0) {
    messageTimer -= dt;
    if (messageTimer <= 0) messageEl.hidden = true;
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// ---- レースを始める(最初から)。withCountdown = スタート前に 3・2・1 を出す ----
function beginRace(withCountdown = false) {
  for (const r of racers) {
    r.kart.placeAtStart(r.slot);
    r.laps.reset(0);
    r.laps.update(r.kart, 0); // 今いる位置を覚えさせる
    r.net = r.raw = null;
    r.ai = r.kind === 'cpu' ? r.cpuAI : null; // ゴール後の自動運転を解除
    if (r.kind === 'cpu') r.ai.setLevel(level);
    else r.kart.speedMul = 1;
    r.prevItem = false;
  }
  items.reset();
  lastItemIcon = '';
  updateItemSlot();
  updateCamera(0, true);
  raceTime = 0;
  wrongWay = 0;
  sendTimer = 0;
  updateRanking();
  renderLapList();
  lastHud = '';
  updateHud();
  finishEl.hidden = true;
  wrongWayEl.hidden = true;
  hudEl.hidden = false;
  controlsEl.hidden = !input.autoAccel; // 画面のボタンはスマホのときだけ
  if (withCountdown) {
    state = 'countdown';
    countdown = CONFIG.online.countdown;
    showMessage(String(Math.ceil(countdown)), 0.9);
  } else {
    state = 'race';
    showMessage('GO!', 1);
  }
}

// ---- 操作方法の準備(ボタンを押した直後に呼ぶこと。全画面と傾きの許可はボタン操作の中でしか使えない) ----
async function prepareControls(mode) {
  // スマホ(指で操作する端末)かどうか。PC ならキーボードで遊ぶので画面のボタンは出さない
  const isTouch = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

  // スマホなら全画面+横向き固定を試す(対応していない端末では何もしない)
  if (isTouch && document.documentElement.requestFullscreen && !document.fullscreenElement) {
    document.documentElement.requestFullscreen()
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
      .catch(() => {});
  }

  if (mode === 'tilt') {
    const ok = await Input.requestTiltPermission();
    if (!ok) {
      alert('傾きセンサーが使えなかったので、ボタン操作で遊びます。');
      mode = 'buttons';
    }
  }

  lastMode = mode;
  input.mode = mode;
  input.autoAccel = isTouch; // スマホはアクセル自動(右手の親指をドリフトに使えるように)
  controlsEl.classList.toggle('tilt', mode === 'tilt');
}

// ---- タイトル画面: 操作方法を選んでスタート(1人で遊ぶ) ----
async function start(mode) {
  setupOffline();
  await prepareControls(mode);
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
  wrongWayEl.hidden = true;
  lobbyEl.hidden = true;
  setupOffline();
  for (const r of racers) r.kart.placeAtStart(r.slot);
  updateCamera(0, true);
  titleEl.hidden = false;
}

// ---- CPU の強さの選択ボタン(タイトルとロビーの両方にある) ----
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
$('btn-retry').addEventListener('click', () => {
  if (online) { if (net.isHost) hostStartRace(); return; }
  input.mode = lastMode;
  beginRace();
});
$('btn-title').addEventListener('click', () => {
  if (!online) { backToTitle(); return; }
  if (net.isHost) {
    // ホスト: みんなでロビーに戻る
    net.broadcast({ t: 'lobby' });
    showRoom();
  } else {
    leaveOnline();
  }
});

// =====================================================================
// オンライン対戦
// =====================================================================

// ---- 送るデータの形 ----
// カート1台の状態を数字の配列にする(短いほど通信が軽い)
// [番号, x, z, 向き, 速度x, 速度z, 前向きの速さ, ハンドル, フラグ, ドリフトのため, ターボ残り, 進み具合, ゴールタイム]
const STATE_LEN = 13;
const round = (v, k = 100) => Math.round(v * k) / k;
function packState(r) {
  const k = r.kart;
  const flags = (k.drifting ? 1 : 0) | (k.driftDir > 0 ? 2 : 0) | (k.onGrass ? 4 : 0) | (k.spinTime > 0 ? 8 : 0);
  return [
    r.entry, round(k.pos.x), round(k.pos.z), round(k.heading, 1000), round(k.vx), round(k.vz),
    round(k.forwardSpeed), round(k.steer), flags, round(k.driftCharge), round(k.boostTime),
    round(progressOf(r)), round(finishTimeOf(r), 1000),
  ];
}
function validState(a) {
  return Array.isArray(a) && a.length === STATE_LEN && a.every((v) => typeof v === 'number' && Number.isFinite(v));
}
function unpackState(a) {
  return {
    x: a[1], z: a[2], h: a[3], vx: a[4], vz: a[5], fs: a[6], steer: a[7],
    drifting: !!(a[8] & 1), driftDir: a[8] & 2 ? 1 : -1, onGrass: !!(a[8] & 4), spin: !!(a[8] & 8),
    charge: a[9], boost: a[10], prog: a[11], fin: a[12],
    at: performance.now() / 1000, // 届いた時刻
  };
}

// 届いた状態をカートに覚えさせる。entry を決めて渡すときは、その番号のカートとして扱う(なりすまし防止)
function receiveState(a, entry) {
  if (!validState(a)) return;
  const e = entry ?? a[0];
  const r = racers[e];
  if (!r || r.kind !== 'remote' || !r.active) return;
  const copy = a.slice();
  copy[0] = e;
  r.raw = copy;
  r.net = unpackState(copy);
}

// 状態を送る。参加者 → ホストには自分のカートだけ。ホスト → 全員には全カート分(参加者の分は転送)
function sendStates() {
  if (net.isHost) {
    const k = active.map((r) => (r.kind === 'remote' ? r.raw : packState(r))).filter(Boolean);
    net.broadcast({ t: 'S', n: raceNo, k });
  } else {
    net.sendToHost({ t: 's', n: raceNo, d: packState(me) });
  }
}

// ---- アイテムの出来事(ボックスを取った・パイロンを置いた・パイロンに当たった) ----
// 送った人の端末ではもう反映済み。ホストは受け取ったら全員に転送する(同じ出来事が2回届いても大丈夫な作り)
function sendEvent(ev) {
  if (!online) return;
  const msg = { t: 'ev', n: raceNo, ...ev };
  if (net.isHost) net.broadcast(msg);
  else net.sendToHost(msg);
}
const validId = (id) => typeof id === 'string' && id.length <= 24;
function applyEvent(msg) {
  if (msg.e === 'box' && Number.isInteger(msg.i)) {
    items.takeBox(msg.i);
  } else if (msg.e === 'pylon' && validId(msg.id) && Number.isFinite(msg.x) && Number.isFinite(msg.z)) {
    items.addPylon(msg.id, msg.x, msg.z);
  } else if (msg.e === 'hit' && validId(msg.id)) {
    items.removePylon(msg.id);
  } else {
    return false;
  }
  return true;
}

// ---- 通信のできごと ----
net.on('members', renderMembers);
net.on('left', (idx) => {
  // レース中に抜けた人のカートは消す
  const r = racers[idx];
  if (online && r && r.human && r.kind === 'remote' && r.active) removeRacer(r);
});
net.on('closed', (reason) => {
  leaveOnline();
  setTimeout(() => alert(reason), 50);
});
net.on('message', (from, msg) => {
  switch (msg.t) {
    case 'start': // 参加者: ホストがレースを始めた
      if (!net.isHost) startOnlineRace(msg);
      break;
    case 'lobby': // 参加者: ホストがロビーに戻った
      if (!net.isHost) showRoom();
      break;
    case 's': // ホスト: 参加者から、その人のカートの状態
      if (net.isHost && msg.n === raceNo) receiveState(msg.d, from);
      break;
    case 'S': // 参加者: ホストから、全カートの状態
      if (!net.isHost && msg.n === raceNo && Array.isArray(msg.k)) {
        for (const a of msg.k) receiveState(a);
      }
      break;
    case 'ev': // アイテムの出来事
      if (msg.n !== raceNo || state === 'title') break;
      if (applyEvent(msg) && net.isHost) net.broadcast(msg);
      break;
  }
});
window.addEventListener('pagehide', () => net.close());

// ---- ロビーの画面 ----
const lobbyEntryEl = $('lobby-entry');
const lobbyRoomEl = $('lobby-room');
const lobbyStatusEl = $('lobby-status');
const nameInput = $('lobby-name');
const codeInput = $('lobby-code');
const NAME_KEY = 'kart-race-name';
const CTRL_KEY = 'kart-race-ctrl';
try { nameInput.value = localStorage.getItem(NAME_KEY) || ''; } catch { /* そのまま */ }

const setStatus = (text) => { lobbyStatusEl.textContent = text; };

// 操作方法(ボタン / 傾け)の選択
let ctrlMode = 'buttons';
try { ctrlMode = localStorage.getItem(CTRL_KEY) === 'tilt' ? 'tilt' : 'buttons'; } catch { /* そのまま */ }
const ctrlButtons = [...document.querySelectorAll('[data-ctrl]')];
function selectCtrl(m) {
  ctrlMode = m;
  for (const b of ctrlButtons) b.classList.toggle('on', b.dataset.ctrl === m);
  try { localStorage.setItem(CTRL_KEY, m); } catch { /* 保存できなくても続ける */ }
}
for (const b of ctrlButtons) b.addEventListener('click', () => selectCtrl(b.dataset.ctrl));
selectCtrl(ctrlMode);

function openLobby() {
  titleEl.hidden = true;
  lobbyEl.hidden = false;
  lobbyEntryEl.hidden = false;
  lobbyRoomEl.hidden = true;
  setStatus('');
}

// 部屋の中の画面にする(参加したとき・レースのあとホストがロビーに戻ったとき)
function showRoom() {
  state = 'title';
  finishEl.hidden = true;
  hudEl.hidden = true;
  controlsEl.hidden = true;
  messageEl.hidden = true;
  wrongWayEl.hidden = true;
  titleEl.hidden = true;
  lobbyEl.hidden = false;
  lobbyEntryEl.hidden = true;
  lobbyRoomEl.hidden = false;
  setStatus('');
  net.locked = false; // ロビーにいる間は参加できる
  $('room-code').textContent = net.code;
  $('btn-online-start').hidden = !net.isHost;
  $('lobby-level').hidden = !net.isHost;
  $('lobby-wait').hidden = net.isHost;
  $('btn-leave').textContent = net.isHost ? '部屋を閉じる' : '退出';
  renderMembers(net.members);
}

// 部屋の顔ぶれ(空いている番号は CPU)
function renderMembers(list) {
  const ol = $('lobby-members');
  ol.textContent = '';
  for (let e = 0; e < racers.length; e++) {
    const m = list.find((x) => x.idx === e);
    const li = document.createElement('li');
    li.style.setProperty('--c', cssColor(entryColor(e)));
    if (!m) li.className = 'cpu';
    else if (e === net.myIdx) li.className = 'me';
    const name = document.createElement('span');
    name.textContent = m ? cleanName(m.name) + (e === net.myIdx ? '(あなた)' : '') : `CPU(${racers[e].cpuName})`;
    const tag = document.createElement('span');
    tag.textContent = m && e === 0 ? 'ホスト' : '';
    li.append(name, tag);
    ol.append(li);
  }
}

let busy = false; // つないでいる途中に、ボタンが二重に押されないように
function saveName() {
  try { localStorage.setItem(NAME_KEY, cleanName(nameInput.value)); } catch { /* 保存できなくても続ける */ }
}

// 部屋を作る
$('btn-host').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  const ready = prepareControls(ctrlMode); // ボタンを押した直後に呼ぶ(全画面・傾きの許可)
  setStatus('部屋を作っています…');
  try {
    await ready;
    saveName();
    await net.host(nameInput.value);
    showRoom();
  } catch (e) {
    net.close();
    setStatus(e.message);
  }
  busy = false;
});

// 部屋に参加する
async function join() {
  if (busy) return;
  const code = codeInput.value.replace(/\D/g, '');
  if (code.length !== 4) {
    setStatus('部屋番号(4けたの数字)を入れてください。');
    return;
  }
  busy = true;
  const ready = prepareControls(ctrlMode);
  setStatus('つないでいます…');
  try {
    await ready;
    saveName();
    await net.join(code, nameInput.value);
    showRoom();
  } catch (e) {
    net.close();
    setStatus(e.message);
  }
  busy = false;
}
$('btn-join').addEventListener('click', join);
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

$('btn-online').addEventListener('click', openLobby);
$('btn-lobby-back').addEventListener('click', () => {
  lobbyEl.hidden = true;
  titleEl.hidden = false;
});
$('btn-leave').addEventListener('click', leaveOnline);

// ホスト: レースを始める(全員に合図を送ってから、自分も始める)
$('btn-online-start').addEventListener('click', hostStartRace);
function hostStartRace() {
  raceNo++;
  net.locked = true; // レース中は新しく入れない
  const msg = { t: 'start', n: raceNo, level, members: net.members };
  net.broadcast(msg);
  startOnlineRace(msg);
}

// 合図を受けてレースを始める(ホストも参加者もここを通る)
function startOnlineRace(msg) {
  const members = Array.isArray(msg.members)
    ? msg.members.filter((m) => m && Number.isInteger(m.idx) && m.idx >= 0 && m.idx < racers.length)
    : [];
  if (!Number.isInteger(msg.n) || !members.some((m) => m.idx === net.myIdx)) return;
  raceNo = msg.n;
  if (CONFIG.cpu.levels[msg.level]) level = msg.level; // CPU の強さはホストに合わせる
  setupOnline(members);
  lobbyEl.hidden = true;
  titleEl.hidden = true;
  input.mode = lastMode;
  beginRace(true);
}

// 部屋を出てタイトルへ
function leaveOnline() {
  net.close();
  backToTitle();
}

// ---- スマホでの誤操作を防ぐ ----
document.addEventListener('contextmenu', (e) => e.preventDefault());      // 長押しメニュー
document.addEventListener('gesturestart', (e) => e.preventDefault());     // iOS のピンチ拡大
document.addEventListener('dblclick', (e) => e.preventDefault());         // ダブルタップ拡大
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
