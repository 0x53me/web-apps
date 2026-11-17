// ゲームの入口。画面(レンダラー・シーン・カメラ)を用意し、毎フレームの処理を回す。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Track } from './track.js';
import { Kart } from './kart.js';
import { Input } from './input.js';

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
const kart = new Kart(scene, track);
kart.placeAtStart(0);
// URL に ?debug を付けたときだけ、ブラウザのコンソールからカートの状態を見られるようにする
if (new URLSearchParams(location.search).has('debug')) window.kart = kart;

// ---- 入力 ----
const controlsEl = document.getElementById('controls');
const input = new Input(controlsEl);

// ---- 画面の要素 ----
const titleEl = document.getElementById('title');
const hudEl = document.getElementById('hud');
const speedEl = document.getElementById('speed-val');

let running = false; // レース中かどうか

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

// ---- メインループ ----
const clock = new THREE.Clock();
let lastSpeed = -1;

function loop() {
  // 前のフレームからの経過時間。大きすぎるときは上限で切る
  const dt = Math.min(clock.getDelta(), CONFIG.maxDelta);

  if (running) {
    kart.update(dt, input.getState());
    const kmh = Math.round(Math.abs(kart.forwardSpeed) * 3.6);
    if (kmh !== lastSpeed) { // 変わったときだけ書きかえる(軽くするため)
      speedEl.textContent = kmh;
      lastSpeed = kmh;
    }
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(loop);

// ---- タイトル画面: 操作方法を選んでスタート ----
async function start(mode) {
  // スマホなら全画面+横向き固定を試す(対応していない端末では何もしない)
  if (matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen) {
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

  input.mode = mode;
  controlsEl.classList.toggle('tilt', mode === 'tilt');
  titleEl.hidden = true;
  hudEl.hidden = false;
  controlsEl.hidden = false;
  kart.placeAtStart(0);
  updateCamera(0, true);
  running = true;
}

document.getElementById('btn-buttons').addEventListener('click', () => start('buttons'));
document.getElementById('btn-tilt').addEventListener('click', () => start('tilt'));

// ---- スマホでの誤操作を防ぐ ----
document.addEventListener('contextmenu', (e) => e.preventDefault());      // 長押しメニュー
document.addEventListener('gesturestart', (e) => e.preventDefault());     // iOS のピンチ拡大
document.addEventListener('dblclick', (e) => e.preventDefault());         // ダブルタップ拡大
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
