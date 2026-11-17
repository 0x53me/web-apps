// カートの演出: ドリフトの火花と、ターボ中の炎
import * as THREE from 'three';
import { CONFIG } from './config.js';

const MAX_SPARKS = 60;   // 1台が同時に出せる火花の数(多すぎると重くなる)
const GRAVITY = 15;      // 火花が落ちる速さ

export class KartEffects {
  constructor(scene, kartMesh) {
    this.kartMesh = kartMesh;

    // ---- 火花: たくさんの点を1つの Points でまとめて描く(軽い) ----
    this.sparks = Array.from({ length: MAX_SPARKS }, () => ({
      life: 0, maxLife: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1,
    }));
    this.positions = new Float32Array(MAX_SPARKS * 3);
    this.colors = new Float32Array(MAX_SPARKS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // 重なると明るく光る
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.nextSpark = 0;
    this.spawnAcc = 0;
    this.color = new THREE.Color();
    this.tmp = new THREE.Vector3();
    this.side = 1;

    // ---- ターボの炎: マフラーの後ろに円すいを2本 ----
    this.flames = [];
    const outer = new THREE.MeshBasicMaterial({ color: 0xff7b1a, transparent: true, opacity: 0.85 });
    const inner = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
    for (const x of [-0.35, 0.35]) {
      const flame = new THREE.Group();
      const o = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.3, 8), outer);
      const i = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.8, 8), inner);
      i.position.y = -0.2;
      flame.add(o, i);
      flame.rotation.x = -Math.PI / 2;  // 円すいの先を後ろ(-z)に向ける
      flame.position.set(x, 0.55, -1.85);
      flame.visible = false;
      kartMesh.add(flame);
      this.flames.push(flame);
    }
  }

  // 火花を1つ出す
  spawnSpark(kart) {
    const s = this.sparks[this.nextSpark];
    this.nextSpark = (this.nextSpark + 1) % MAX_SPARKS;
    // 左右の後輪から交互に出す(カートの向きに合わせてワールド座標に変換)
    this.side = -this.side;
    this.tmp.set(0.95 * this.side, 0.15, -1.1);
    this.kartMesh.localToWorld(this.tmp);
    s.x = this.tmp.x; s.y = this.tmp.y; s.z = this.tmp.z;
    // 後ろ+上に、少しばらつかせて飛ばす
    const back = -4 - Math.random() * 3;
    s.vx = Math.sin(kart.heading) * back + (Math.random() - 0.5) * 4;
    s.vz = Math.cos(kart.heading) * back + (Math.random() - 0.5) * 4;
    s.vy = 2 + Math.random() * 3;
    s.maxLife = s.life = 0.2 + Math.random() * 0.2;
    s.r = this.color.r; s.g = this.color.g; s.b = this.color.b;
  }

  update(dt, kart) {
    this.kartMesh.updateMatrixWorld();

    // ドリフト中は、ためた段階の色で火花を出す
    if (kart.drifting) {
      const level = kart.driftLevel;
      this.color.setHex(CONFIG.drift.colors[level]);
      this.spawnAcc += (level === 0 ? 25 : 70) * dt; // 段階が上がると火花が増える
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnSpark(kart);
      }
    } else {
      this.spawnAcc = 0;
    }

    // 火花を動かす。寿命が近づくほど暗く(=消えていくように)する
    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = this.sparks[i];
      if (s.life > 0) {
        s.life -= dt;
        s.vy -= GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        if (s.life <= 0) s.y = -100; // 見えない場所へ
      }
      const k = Math.max(0, s.life / s.maxLife);
      this.positions[i * 3] = s.x;
      this.positions[i * 3 + 1] = s.y;
      this.positions[i * 3 + 2] = s.z;
      this.colors[i * 3] = s.r * k;
      this.colors[i * 3 + 1] = s.g * k;
      this.colors[i * 3 + 2] = s.b * k;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    // ターボ中だけ炎を出し、長さをゆらゆらさせる
    const boosting = kart.boostTime > 0;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) {
        const s = 0.8 + Math.random() * 0.5;
        f.scale.set(1, s, 1);
      }
    }
  }
}
