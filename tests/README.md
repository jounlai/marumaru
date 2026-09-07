# tests — 動作確認スクリプト

ゲーム本体は依存ゼロ（`index.html` をブラウザで開くだけ）。
このフォルダの確認用スクリプトだけが Node と外部パッケージを使う。

```bash
npm init -y                 # 未作成なら
npm i -D jsdom playwright
npx playwright install chromium
```

| スクリプト | 何を見るか | 実行 |
|---|---|---|
| `lint-data.js` | **出題データの健全性検査**（依存なし）。盤面から作れるか・重複・字数・語釈の欠落、および `index.html` の `?v=` が語数と一致するかを検査する。語を追加したらまずこれ | `node tests/lint-data.js` |
| `make-kids.js` | **こども版に出す語を選び直す**（`js/kids.js` を生成）。卑猥・差別的な語と、辞書で低頻度の難語を外す。語を足したら回す | `node tests/make-kids.js` |
| `check-readings.js` | **display に当てた漢字が、その読みを本当に持つか**を JMdict で検査する。lint を通っても読みの取り違えは見つからないので、語を足したら続けて回す。初回だけ辞書を落として `tests/.cache/` に置く（約11MB・依存なし） | `node tests/check-readings.js` |
| `smoke.js` | プレイ通し試験（正解・誤答・コンボ・クリア・PERFECT・セーブ復元・SPECIAL・WORD・ヒント・降参・ゲームオーバー・語彙データの健全性）。`testbody.js` が中身 | `node tests/smoke.js` |
| `deadend.js` | 「かなが押せなくなる」行き止まりが無いか（★0・降参済み・盤面ロック時の復帰手段） | `node tests/deadend.js` |
| `repro.js` | 旧セーブデータからの起動（★0／降参済み／クリア済み）で入力できるか | `node tests/repro.js` |
| `shot.js` | 4 画面サイズでのスクロールあふれ計測とスクリーンショット | `node tests/shot.js` |
| `mascot.js` | 棒人間のアニメーションをコマ送りで撮影（`shots/` に出力） | `node tests/mascot.js` |

`lint-data.js` は依存なしで動く。`smoke.js` は jsdom、それ以外は Chromium（Playwright）を使う。

**キャッシュについて**：`index.html` は `css/styles.css?v=6fbe48ad` のように
`css/styles.css` `js/data.js` `js/game.js` の内容から作るハッシュを付けている。
GitHub Pages は `cache-control: max-age=600` で配信するため、これを上げ忘れると
既に遊んだ人のブラウザが古いファイルを使い続け、**追加したはずの語が不正解に
なる／直したはずの不具合が残る**。`lint-data.js` が一致を検査し、ずれていれば
正しい値を出すので、その値に書き換えること。

```
- index.html: js/data.js の ?v=6fbe48ad が古い → ?v=1a2b3c4d に直す
```

**注意**：`lint-data.js` を通っても「読みが正しいか」は分からない。
清濁や拍数の取り違え（探訪＝たんぼう、頒布＝はんぷ、惨敗＝ざんぱい など）は
`lint-data.js` では検出できない。`check-readings.js` が display の漢字を辞書に
当てて拾うが、display の無い語（かな書きの語）は依然として人が確かめること。

実際、盤面の空いた枠を埋めるために、既存語の漢字と語釈を使い回した捏造が
入り込んでいた（「ちっちり＝てっちり」「づっぱり＝突っ張り」など計48語）。
`check-readings.js` はこの形を検出する。
`shot.js` / `mascot.js` の出力は `tests/shots/` に入る。

## 期待結果

- `smoke.js` … `=== すべて成功 ===`
- `deadend.js` … `=== すべて成功 ===`
- `shot.js` … 全行 `縦あふれ:0px 横あふれ:0px`（モバイルでスクロールが出ないこと）

## 日本語フォントについて

Linux コンテナ等で日本語フォントが無いとスクリーンショットが豆腐（□）になる。
表示確認をするなら日本語フォントを入れてから実行する。

```bash
mkdir -p ~/.local/share/fonts && cp /path/to/NotoSansJP*.ttf ~/.local/share/fonts/ && fc-cache -f
```
