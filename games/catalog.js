// ゲーム一覧のデータと描画（games/index.html と others/index.html で共用）
// ゲームを追加したら GAMES に1行足す。path は games/ からの相対パス。
// section: 'main' はトップに直接並ぶ、'others' は「その他ゲーム」の中に並ぶ
const GAMES = [
  { section: 'main', path: 'orbit-dash/', icon: '🪐', name: 'Orbit Dash', desc: 'タップで回転方向を切り替えて、隕石をよけながら★を集める', tags: ['ワンタップ', '反射神経', 'エンドレス'] },
  { section: 'main', path: 'color-gate/', icon: '🚦', name: 'Color Gate', desc: 'タップで自分の色を切り替えて、同じ色のゲートをくぐり抜ける', tags: ['ワンタップ', '反射神経', 'エンドレス'] },
  { section: 'main', path: 'tsumiage/', icon: '🏗️', name: 'ツミアゲ', desc: 'タップでブロックを落として積み上げる。ぴったり重ねて高さを目指そう', tags: ['ワンタップ', 'タイミング', 'エンドレス'] },
  { section: 'others', path: 'others/snake/', icon: '🐍', name: 'スネークゲーム', desc: 'エサを食べて長くなろう。壁と自分の体に注意。', tags: ['アクション', '定番'] },
  { section: 'others', path: 'others/tetris/', icon: '🧱', name: 'テトリス風', desc: '落ちてくるブロックを並べてラインを消そう。', tags: ['パズル', 'アクション', '定番'] },
  { section: 'others', path: 'others/breakout/', icon: '🏓', name: 'ブロック崩し', desc: 'パドルでボールを打ち返して全ブロックを壊そう。', tags: ['アクション', '定番'] },
  { section: 'others', path: 'others/game2048/', icon: '🔢', name: '2048', desc: '同じ数字を合体させて2048を目指そう。', tags: ['パズル', 'じっくり', '定番'] },
  { section: 'others', path: 'others/minesweeper/', icon: '💣', name: 'マインスイーパー', desc: '数字を手がかりに地雷を避けて全マスを開けよう。', tags: ['パズル', 'じっくり', '定番'] },
];

// タグの表示順（ここにないタグは後ろに並ぶ）
const TAG_ORDER = ['ワンタップ', '反射神経', 'タイミング', 'アクション', 'パズル', 'じっくり', 'エンドレス', '定番'];

// 一覧を描画する
//   root:   このページから games/ への相対パス（トップは ''、others は '../'）
//   section: 'main' ならトップ（絞り込み時は全ゲームが対象）、'others' ならその中だけ
//   folder: 絞り込みなしのときに並べるフォルダカード（トップの「その他ゲーム」）
function renderGameList({ root = '', section = 'main', folder = null }) {
  const listEl = document.getElementById('list');
  const tagsEl = document.getElementById('tags');
  const pool = section === 'main' ? GAMES : GAMES.filter(g => g.section === section);

  const rank = t => { const i = TAG_ORDER.indexOf(t); return i < 0 ? 999 : i; };
  const tags = [...new Set(pool.flatMap(g => g.tags))].sort((a, b) => rank(a) - rank(b));

  let cur = new URLSearchParams(location.search).get('tag');
  if (!tags.includes(cur)) cur = null;

  function setTag(t) {
    cur = cur === t ? null : t;
    const url = new URL(location.href);
    if (cur) url.searchParams.set('tag', cur); else url.searchParams.delete('tag');
    history.replaceState(null, '', url);
    draw();
  }

  function chip(label, active, onClick, count) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (active ? ' on' : '');
    b.textContent = label;
    if (count != null) {
      const n = document.createElement('span');
      n.className = 'n'; n.textContent = count;
      b.appendChild(n);
    }
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  function card(g, href, isFolder) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'card' + (isFolder ? ' folder' : '');
    a.href = href;
    a.innerHTML = '<div class="icon"></div><div class="body"><div class="name"></div><div class="desc"></div><div class="tags"></div></div>';
    a.querySelector('.icon').textContent = g.icon;
    a.querySelector('.name').textContent = g.name;
    a.querySelector('.desc').textContent = g.desc;
    const tg = a.querySelector('.tags');
    for (const t of g.tags || []) {
      const s = document.createElement('span');
      s.className = 'tag' + (t === cur ? ' on' : '');
      s.textContent = '#' + t;
      tg.appendChild(s);
    }
    li.appendChild(a);
    return li;
  }

  function draw() {
    tagsEl.innerHTML = '';
    tagsEl.appendChild(chip('すべて', !cur, () => { if (cur) setTag(cur); }));
    for (const t of tags) {
      tagsEl.appendChild(chip('#' + t, t === cur, () => setTag(t), pool.filter(g => g.tags.includes(t)).length));
    }

    listEl.innerHTML = '';
    if (cur) {
      for (const g of pool.filter(g => g.tags.includes(cur))) listEl.appendChild(card(g, root + g.path));
    } else {
      for (const g of pool.filter(g => section !== 'main' || g.section === 'main')) listEl.appendChild(card(g, root + g.path));
      if (folder) listEl.appendChild(card(folder, folder.path, true));
    }
  }

  draw();
}
