// アイテム: コース上のアイテムボックスと、カートが置いたパイロン(障害物)。
// ここでは「物」の管理だけをする。だれが取った・使った、の判断は main.js。
import * as THREE from 'three';
import { CONFIG } from './config.js';

// アイテムの種類と、画面に出すマーク
export const ITEM_ICONS = { dash: '⚡', pylon: '▲' };

// 「?」の絵をキャンバスに描いてテクスチャにする
function questionTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 64);
  grad.addColorStop(0, '#ffd60a');
  grad.addColorStop(0.5, '#ff4fd8');
  grad.addColorStop(1, '#4cc9f0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 58, 58);
  g.fillStyle = '#fff';
  g.font = 'bold 44px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 32, 35);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Items {
  constructor(scene, track) {
    const c = CONFIG.items;
    this.scene = scene;
    this.track = track;
    this.time = 0;

    // ---- アイテムボックス ----
    const boxGeo = new THREE.BoxGeometry(c.boxSize, c.boxSize, c.boxSize);
    const boxMat = new THREE.MeshLambertMaterial({ map: questionTexture(), transparent: true, opacity: 0.9 });
    this.boxes = [];
    for (const f of c.boxRows) {
      const i = Math.floor(f * track.count) % track.count;
      const p = track.points[i];
      const r = track.rights[i];
      for (const off of c.boxOffsets) {
        const mesh = new THREE.Mesh(boxGeo, boxMat);
        mesh.position.set(p.x + r.x * off, 1.2, p.z + r.z * off);
        mesh.rotation.set(0.6, 0, 0.6);
        scene.add(mesh);
        this.boxes.push({ mesh, x: mesh.position.x, z: mesh.position.z, wait: 0 });
      }
    }

    // ---- パイロン(オリジナルのオレンジのコーン)。形は全部同じなので使い回す ----
    this.pylonGeo = {
      cone: new THREE.ConeGeometry(0.55, 1.4, 10),
      stripe: new THREE.CylinderGeometry(0.33, 0.4, 0.22, 10),
      base: new THREE.BoxGeometry(1.2, 0.16, 1.2),
    };
    this.pylonMat = {
      cone: new THREE.MeshLambertMaterial({ color: 0xff7b1a }),
      stripe: new THREE.MeshLambertMaterial({ color: 0xffffff }),
      base: new THREE.MeshLambertMaterial({ color: 0x333333 }),
    };
    this.pylons = new Map(); // id → { mesh, x, z }
    this.gone = new Set();   // もう消えたパイロンの id(通信で遅れて届いても置き直さないように)
  }

  // レース開始時: ボックスを全部出して、パイロンを全部片づける
  reset() {
    for (const b of this.boxes) { b.wait = 0; b.mesh.visible = true; b.mesh.scale.setScalar(1); }
    for (const id of [...this.pylons.keys()]) this.removePylon(id);
    this.gone.clear();
  }

  // 毎フレーム: ボックスを回し、取られたボックスを時間がたったら戻す
  update(dt) {
    this.time += dt;
    for (const b of this.boxes) {
      if (b.wait > 0) {
        b.wait -= dt;
        if (b.wait <= 0) { b.mesh.visible = true; b.mesh.scale.setScalar(0.01); }
      } else if (b.mesh.scale.x < 1) {
        b.mesh.scale.setScalar(Math.min(1, b.mesh.scale.x + dt * 3)); // ぽわっと出てくる
      }
      b.mesh.rotation.y += dt * 1.5;
      b.mesh.position.y = 1.2 + Math.sin(this.time * 2 + b.x) * 0.15;
    }
  }

  // カートが取れるボックスの番号(なければ -1)
  touchBox(kart) {
    const r2 = CONFIG.items.boxRadius ** 2;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (b.wait > 0) continue;
      if ((kart.pos.x - b.x) ** 2 + (kart.pos.z - b.z) ** 2 < r2) return i;
    }
    return -1;
  }

  // ボックスを取られた状態にする
  takeBox(i) {
    const b = this.boxes[i];
    if (!b || b.wait > 0) return;
    b.wait = CONFIG.items.respawnTime;
    b.mesh.visible = false;
  }

  // パイロンを置く
  addPylon(id, x, z) {
    if (this.pylons.has(id) || this.gone.has(id)) return;
    // 多すぎたら古いものから消す
    if (this.pylons.size >= CONFIG.items.maxPylons) this.removePylon(this.pylons.keys().next().value);
    const g = this.pylonGeo;
    const m = this.pylonMat;
    const mesh = new THREE.Group();
    const cone = new THREE.Mesh(g.cone, m.cone);
    cone.position.y = 0.78;
    const stripe = new THREE.Mesh(g.stripe, m.stripe);
    stripe.position.y = 0.85;
    const base = new THREE.Mesh(g.base, m.base);
    base.position.y = 0.08;
    mesh.add(cone, stripe, base);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    this.pylons.set(id, { mesh, x, z });
  }

  removePylon(id) {
    this.gone.add(id);
    const p = this.pylons.get(id);
    if (!p) return;
    this.scene.remove(p.mesh);
    this.pylons.delete(id);
  }

  // カートが当たったパイロンの id(なければ null)
  hitPylon(kart) {
    const r2 = CONFIG.items.pylonRadius ** 2;
    for (const [id, p] of this.pylons) {
      if ((kart.pos.x - p.x) ** 2 + (kart.pos.z - p.z) ** 2 < r2) return id;
    }
    return null;
  }
}
