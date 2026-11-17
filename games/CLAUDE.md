# ゲーム集

ブラウザで遊べるシンプルなゲームを置くフォルダ。各ゲームはサブフォルダごとに独立している。

## 構成
- `index.html`: 全ゲームの一覧トップページ。ゲームを追加したら `GAMES` 配列に1行足す
- 新しいゲームは `games/<ゲーム名>/` として追加し、本体はフォルダ直下の `index.html` に置く
- 各ゲームには一覧へ戻るリンク(`../`)を付け、スマホのタッチ操作でも遊べるようにする
- `share.js`: 結果シェアの共通スクリプト。ゲーム終了時に結果テキスト+ページURLを共有(Web Share API、使えなければクリップボードにコピー)
  - オーバーレイ型(orbit-dash など): GAME OVER 画面のボタンから `GameShare.share(text)` を呼ぶ
  - それ以外: 終了時に `GameShare.show(text)` で画面下にボタンを出し、リスタート時に `GameShare.hide()`
  - 新しいゲームにも付ける。読み込みは `<script src="../share.js">`(others 配下は `../../share.js`)

## 収録ゲーム
- `orbit-dash/`: Orbit Dash(タップで回転方向を反転)
- `color-gate/`: Color Gate(タップで色を切り替えてゲートを通過)
- `tsumiage/`: ツミアゲ(タップでブロックを落として積み上げる)
- `others/`: その他ゲーム(一覧ページ `others/index.html` から開く。定番ゲームはここに置き、`others/index.html` の `GAMES` 配列に足す)
  - `others/snake/`: スネークゲーム
  - `others/tetris/`: テトリス風ゲーム
  - `others/breakout/`: ブロック崩し
  - `others/game2048/`: 2048
  - `others/minesweeper/`: マインスイーパー

## 共通ルール
- 返答・コメントは日本語
- 外部ライブラリは追加しない(必要なら先に相談)
- HTML/CSS/JS のみ、ビルド不要でブラウザで開けば動く形にする
- ゲームごとの個別ルールは、そのフォルダ内の `CLAUDE.md` に書く
