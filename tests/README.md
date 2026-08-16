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
| `lint-data.js` | **出題データの健全性検査**（依存なし）。盤面から作れるか・重複・字数・語釈の欠落を検査する。語を追加したらまずこれ | `node tests/lint-data.js` |
| `smoke.js` | プレイ通し試験（正解・誤答・コンボ・クリア・PERFECT・セーブ復元・SPECIAL・WORD・ヒント・降参・ゲームオーバー・語彙データの健全性）。`testbody.js` が中身 | `node tests/smoke.js` |
| `deadend.js` | 「かなが押せなくなる」行き止まりが無いか（★0・降参済み・盤面ロック時の復帰手段） | `node tests/deadend.js` |
| `repro.js` | 旧セーブデータからの起動（★0／降参済み／クリア済み）で入力できるか | `node tests/repro.js` |
| `shot.js` | 4 画面サイズでのスクロールあふれ計測とスクリーンショット | `node tests/shot.js` |
| `mascot.js` | 棒人間のアニメーションをコマ送りで撮影（`shots/` に出力） | `node tests/mascot.js` |

`lint-data.js` は依存なしで動く。`smoke.js` は jsdom、それ以外は Chromium（Playwright）を使う。

**注意**：`lint-data.js` を通っても「読みが正しいか」は分からない。
清濁や拍数の取り違え（探訪＝たんぼう、頒布＝はんぷ、惨敗＝ざんぱい など）は
機械では検出できないので、人が確かめること。
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
