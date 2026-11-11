# 電気電子情報系 授業学習サイト (ee-learning)

自分の授業の復習用サイト。電気回路・電磁気学/電子回路/ディジタル回路/情報の解説・動かせる教材・公式集/用語集をまとめる。
レベルは高専4〜5年・大学学部程度。詳細設計(ページ構成・データ形式・単元案)は `docs/design.md`。

## 構成(予定)
- `src/index.html`: エントリ(ハッシュルーティングの SPA)
- `src/css/style.css`: スタイル(ライト/ダーク対応、色は `:root` のトークンで管理)
- `src/js/app.js`: ルーター・画面描画・検索
- `src/js/markdown.js`: Markdown + 数式のレンダリング(marked + KaTeX)
- `src/js/tools/registry.js`: 教材の登録・埋め込みと共通部品 `ToolKit`(スライダー、グラフ描画、SI 接頭辞表示など)
- `src/js/tools/*.js`: 動かせる教材(1教材1ファイル)。追加したら `index.html` に `<script>` を足す
- `src/content/index.json`: 科目・単元の目次
- `src/content/<科目>/<単元>.md`: 解説本文(Markdown + LaTeX)
- `src/content/formulas.md` / `glossary.md`: 公式集・用語集
- `docs/design.md`: 設計書

## 実行方法
`src/content/*.md` を fetch で読むため、ローカルでは簡易サーバー経由で開く。
- VS Code の Live Server で `src/index.html` を開く、または
- `src` で `python -m http.server 8000` → http://localhost:8000/

将来的に GitHub Pages で公開する前提。パスはすべて相対パスで書く。

## ルール
- 返答・コメントは日本語
- ビルド不要(HTML/CSS/JS のみ)。ES Modules・npm は使わない
- 外部ライブラリは CDN の marked と KaTeX のみ(バージョン固定)。追加したい場合は先に相談
- 解説本文は Claude が下書きし、ユーザーが手で直す。ユーザーが直した箇所は勝手に書き換えない
- 単元を追加するときは `.md` を置き、`content/index.json` に1件足す
- 数式はインライン `$...$`、ディスプレイ `$$...$$`。単位は `\mathrm{}` で立体にする
