// コース(道路・芝生・壁・スタートゲート・木)を作り、
// 「ある位置がコースのどこにあるか」を調べる機能を持つ。
import * as THREE from 'three';
import { CONFIG } from './config.js';

// キャンバスに絵を描いてテクスチャにする(外部の画像ファイルは使わない)
function makeCanvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 毎回同じ並びになる乱数(木の配置が毎回変わらないように)
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Track {
  constructor(scene) {
    const t = CONFIG.track;
    this.halfWidth = t.roadWidth / 2;              // 中心から道路の端までの距離
    this.wallOffset = this.halfWidth + t.grassWidth; // 中心から壁までの距離

    // 制御点をなめらかな曲線(スプライン)でつなぐ。true = 輪っかにする
    const curve = new THREE.CatmullRomCurve3(
      t.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );

    // 曲線を等間隔に分割した点を作る
    const N = t.samples;
    const pts = curve.getSpacedPoints(N);
    pts.pop(); // 最後の点は最初の点と同じなので捨てる
    this.points = pts;
    this.count = N;

    // 各点での「進行方向(tangent)」「右方向(right)」「スタートからの距離」
    this.tangents = [];
    this.rights = [];
    this.dists = [];
    let d = 0;
    for (let i = 0; i < N; i++) {
      const prev = pts[(i - 1 + N) % N];
      const next = pts[(i + 1) % N];
      const tan = next.clone().sub(prev).normalize();
      this.tangents.push(tan);
      this.rights.push(new THREE.Vector3(-tan.z, 0, tan.x));
      this.dists.push(d);
      d += pts[i].distanceTo(pts[(i + 1) % N]);
    }
    this.length = d; // コース1周の長さ

    this.group = new THREE.Group();
    scene.add(this.group);
    this.buildGround();
    this.buildRoad();
    this.buildWalls();
    this.buildStartGate();
    this.buildTrees();
  }

  // 中心線の i 番目の点から、右へ offset、高さ y の位置
  edge(i, offset, y) {
    return this.points[i].clone().addScaledVector(this.rights[i], offset).setY(y);
  }

  // コースに沿った帯状のメッシュを作る(道路・縁石・壁で共通に使う)
  //   getA, getB: i 番目の点での帯の両端の位置を返す関数
  //   vScale: テクスチャを何mごとに繰り返すか
  ribbon(getA, getB, vScale, material) {
    const N = this.count;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const a = getA(k);
      const b = getB(k);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const v = (i === N ? this.length : this.dists[k]) / vScale;
      uv.push(0, v, 1, v);
      if (i < N) {
        const j = i * 2;
        idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    this.group.add(mesh);
    return mesh;
  }

  // 地面(芝生)
  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshLambertMaterial({ color: 0x5fae3f }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(100, -0.02, 60);
    this.group.add(ground);

    // 道路の外の「減速ゾーン」は少し濃い緑にして分かりやすくする
    const hw = this.halfWidth;
    const wo = this.wallOffset;
    const band = new THREE.MeshLambertMaterial({ color: 0x4c9433 });
    this.ribbon(i => this.edge(i, -wo, 0), i => this.edge(i, -hw, 0), 10, band);
    this.ribbon(i => this.edge(i, hw, 0), i => this.edge(i, wo, 0), 10, band);
  }

  // 道路と縁石
  buildRoad() {
    const hw = this.halfWidth;

    // アスファルト + 白い端線 + 中央の破線
    const roadTex = makeCanvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = '#5a5d63';
      g.fillRect(0, 0, w, h);
      for (let n = 0; n < 900; n++) { // ざらざら感
        const c = 70 + Math.random() * 40;
        g.fillStyle = `rgb(${c},${c},${c + 4})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#f2f2f2';
      g.fillRect(3, 0, 4, h);
      g.fillRect(w - 7, 0, 4, h);
      g.fillRect(w / 2 - 2, 0, 4, h / 2);
    });
    const roadMat = new THREE.MeshLambertMaterial({
      map: roadTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    this.ribbon(i => this.edge(i, -hw, 0.02), i => this.edge(i, hw, 0.02), 16, roadMat);

    // 赤白の縁石
    const curbTex = makeCanvasTexture(8, 64, (g, w, h) => {
      g.fillStyle = '#e8e8e8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d62828';
      g.fillRect(0, 0, w, h / 2);
    });
    const curbMat = new THREE.MeshLambertMaterial({
      map: curbTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const cw = 1.3;
    this.ribbon(i => this.edge(i, -hw - cw, 0.03), i => this.edge(i, -hw, 0.03), 4, curbMat);
    this.ribbon(i => this.edge(i, hw, 0.03), i => this.edge(i, hw + cw, 0.03), 4, curbMat);
  }

  // コースの外側の壁(ガードレール)
  buildWalls() {
    const wo = this.wallOffset;
    const wh = CONFIG.track.wallHeight;
    // テクスチャの縦方向(y)がコースに沿う向きになるので、上下で色を分けると青白が交互に並ぶ
    const wallTex = makeCanvasTexture(16, 64, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d6fd6';
      g.fillRect(0, 0, w, h / 2);
    });
    const wallMat = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
    this.ribbon(i => this.edge(i, -wo, 0), i => this.edge(i, -wo, wh), 6, wallMat);
    this.ribbon(i => this.edge(i, wo, 0), i => this.edge(i, wo, wh), 6, wallMat);
  }

  // スタートライン(チェッカー模様)とゲート
  buildStartGate() {
    const hw = this.halfWidth;
    const tan = this.tangents[0];
    const gate = new THREE.Group();
    gate.position.copy(this.points[0]);
    gate.rotation.y = Math.atan2(tan.x, tan.z); // コースの向きにそろえる
    this.group.add(gate);

    const checker = makeCanvasTexture(240, 40, (g) => {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 12; x++) {
          g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
          g.fillRect(x * 20, y * 20, 20, 20);
        }
      }
    });
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(this.halfWidth * 2, 2.4),
      new THREE.MeshLambertMaterial({
        map: checker, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.04;
    gate.add(line);

    const poleMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6.5, 8), poleMat);
      pole.position.set(s * (hw + 1.6), 3.25, 0);
      gate.add(pole);
    }
    const bannerTex = makeCanvasTexture(512, 64, (g, w, h) => {
      g.fillStyle = '#1b1b2f';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd60a';
      g.font = 'bold 44px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('TURBO CIRCUIT', w / 2, h / 2 + 2);
    });
    bannerTex.wrapS = bannerTex.wrapT = THREE.ClampToEdgeWrapping;
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2 + 4, 1.4, 0.3),
      new THREE.MeshLambertMaterial({ map: bannerTex }),
    );
    banner.position.y = 6.2;
    gate.add(banner);
  }

  // まわりの木(InstancedMesh で1回の描画にまとめて軽くする)
  buildTrees() {
    const rand = seededRandom(20261117);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of this.points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const margin = 80;
    const clear = this.wallOffset + 5; // コースからこれ以上離れた場所だけに置く
    const trees = [];
    for (let tries = 0; trees.length < CONFIG.track.treeCount && tries < 6000; tries++) {
      const x = minX - margin + rand() * (maxX - minX + margin * 2);
      const z = minZ - margin + rand() * (maxZ - minZ + margin * 2);
      let ok = true;
      for (const p of this.points) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < clear * clear) { ok = false; break; }
      }
      if (ok) trees.push([x, z, 0.7 + rand() * 0.7]);
    }

    const leaves = new THREE.InstancedMesh(
      new THREE.ConeGeometry(2.4, 6, 7),
      new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
      trees.length,
    );
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.35, 0.5, 2, 6),
      new THREE.MeshLambertMaterial({ color: 0x7a4e2d }),
      trees.length,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    trees.forEach(([x, z, k], i) => {
      s.set(k, k, k);
      p.set(x, 1 * k, z);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      p.set(x, 5 * k, z);
      m.compose(p, q, s);
      leaves.setMatrixAt(i, m);
    });
    this.group.add(leaves, trunks);
  }

  // 位置 pos がコースのどこにあるかを調べる
  //   hint: 前回の結果の番号(あればその近くだけ探すので速い)
  //   戻り値: index(一番近い中心線の点の番号), offset(中心から右へのずれ。左はマイナス)
  query(pos, hint = -1) {
    const N = this.count;
    let best = 0;
    let bestD = Infinity;
    const check = (i) => {
      const p = this.points[i];
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    };
    if (hint < 0) {
      for (let i = 0; i < N; i++) check(i);
    } else {
      for (let o = -40; o <= 40; o++) check((hint + o + N) % N);
    }
    const p = this.points[best];
    const r = this.rights[best];
    const offset = (pos.x - p.x) * r.x + (pos.z - p.z) * r.z;
    return { index: best, offset, right: r, tangent: this.tangents[best] };
  }
}
