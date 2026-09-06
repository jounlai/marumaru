# 〇〇ことば

かな穴埋めサバイバル。**https://marumaru.heuron.com/**

旧アドレスの https://jounlai.github.io/marumaru/ を開くと、こちらへ転送する
（下の「引っ越しについて」を参照）。

`〇ん〇ん` のように穴の空いたお題が出るので、**すべての穴に同じ仮名**を入れて
成り立つことばを探す。`か` を選べば「かんかん」、`ぷ` を選べば「ぷんぷん」。
思いついた仮名を押すだけで、キーボード入力はいらない。

外れると★が減る。日本語がどれだけ広いかを、★5個の残機で確かめるゲーム。

## ルール

- ★は **5個** から。はずすたびに **★−1**、0でゲームオーバー（★5で再開できる）
- 正解の **60%** を見つけたらクリア＆ **★+1**。そこで止めても、
  **全問正解（PERFECT）** を狙って続けてもいい（★+2 とボーナス2,000点）
- 連続正解で **コンボ**（1つごとに+20点）、5連続で **FEVER**（スコア2倍）
- 1正解の基礎点は100点。**ヒント** は −300点で語釈を1つ見られる
- **降参** すると答えを全部見られる（★ボーナスはなし）
- 進行状況はブラウザの localStorage に保存され、次に開いたとき続きから遊べる

## ラウンド

全178ラウンド・3,641語。通常ラウンドは正解数の多い順に並ぶので、
番号が進むほど正解が少なく、当てにくくなる（WARM-UP → HELL）。

| 種類 | 数 | 語数 | 内容 |
|---|---:|---:|---|
| 通常 | 46 | 899 | `〇ん〇ん` `〇ら〇ら` など、穴すべてに同じ仮名を入れる4文字ことば |
| SPECIAL | 18 | 61 | 前半の穴は清音、後半の穴は**同じ仮名の濁音**（`〇ん〇゙ん` → 「はんばん」） |
| WORD | 114 | 2,681 | 穴は1つだけ。擬音語・擬態語ではない、ふつうの3〜4文字ことば |

語釈は辞書語に加えて、擬音語・擬態語・口語・俗語・ネット表現・著名な固有名詞も
対象にしている。「これは載っていないのか」と思ったら報告してほしい（下記）。

## 構成

依存パッケージはゼロ。`index.html` をブラウザで開けばそのまま動く。

| ファイル | 中身 |
|---|---|
| [index.html](index.html) | 画面のDOM。CSS/JS は `?v=` 付きで読み込む |
| [css/styles.css](css/styles.css) | 全スタイル。棒人間「まるくん」もCSSだけで動く |
| [js/data.js](js/data.js) | 出題データ（全ラウンド・全語・語釈） |
| [js/game.js](js/game.js) | ゲーム進行・演出・効果音（WebAudioで合成、音声ファイルなし） |
| [tests/](tests/) | 確認用スクリプト。詳細は [tests/README.md](tests/README.md) |

### 語を追加するときは

1. [js/data.js](js/data.js) の該当テンプレートに `{ word, display, meaning }` を足す
2. `node tests/lint-data.js` を通す（盤面から作れるか・重複・字数・語釈の欠落を検査）
3. lint が出す `?v=` の値を [index.html](index.html) に反映する

`?v=` は css/js の内容から作るハッシュ。配信元がキャッシュを効かせるので、
ここを上げ忘れると**すでに遊んだ人のブラウザが古い data.js を使い続け、
追加したはずの語が不正解になる**。

lint を通っても読みが正しいかは分からない。清濁や拍数の取り違え
（探訪＝たんぼう、頒布＝はんぷ）は人が確かめること。

## 引っ越しについて

配信元を GitHub Pages から marumaru.heuron.com へ移した。旧アドレスは
[index.html](index.html) 先頭のスクリプトで転送する。判定は
`location.hostname === "jounlai.github.io"` に限っているので、localhost や
`file://` では転送されず、手元ではそのまま遊べる。

★・スコア・発見済みの語は localStorage にあり、ドメインをまたげない。
そのまま飛ばすと進行が消えるので、転送のときにセーブを URL のフラグメント
（`#save=`）へ載せ、移転先の `importHandoffSave()` が取り込む。移転先にも
セーブがあれば `mergeProgress()` で合流させる。

| 項目 | 混ぜかた |
|---|---|
| 発見済みの語・使った仮名 | 和集合 |
| クリア済み・PERFECT の印 | どちらかで立っていれば立てる |
| ★・スコア・最大コンボ | 大きいほう |
| 降参の印 | 両方で降参していたときだけ |

かなは `encodeURIComponent` で1文字9字に膨らむので、遊び込んだセーブほど URL が
長くなる。10万字を超えるときは `found` を落として `discovered` だけを運び、
移転先で `found` を補う。

**デプロイの順番**：先に marumaru.heuron.com を新しいビルドにしてから、GitHub Pages を
差し替える。合流のコードは移転先の `js/game.js` にあるので、逆にすると引き継ぎ用の
`#save=...` が取り込まれず、アドレス欄に残る。

### 手元で確かめる

セーブのキーは `maruanagame-progress-v5`（旧 `maruanagame-progress-v4`）。

```js
JSON.parse(localStorage.getItem("maruanagame-progress-v5") ?? "null")        // 覗く
localStorage.removeItem("maruanagame-progress-v5"); location.replace("/");   // まっさらに戻す
```

GUI なら ⚙メニューの「記録をすべてリセット」が同じことをする。旧アドレスは開いた
瞬間に転送されるので、そちらにセーブを仕込むときは同じオリジンの別パス
（例：`https://jounlai.github.io/marumaru/css/styles.css`）でコンソールを開いて書く。

## 貢献者

収録漏れの報告や語釈の指摘で、このゲームは増えている。

| | 貢献 |
|---|---|
| [@jounlai](https://x.com/jounlai)（Jounlai Cho） | 作者 |
| [@dora_todo](https://x.com/dora_todo) | 「連呼」の収録漏れを報告 |
| [@kurohetsuhotsu](https://x.com/kurohetsuhotsu) | ROUND 01〜05 の未収録語を辞書の裏付きでリストアップして報告 |
| [@zcATHh3SdI30403](https://x.com/zcATHh3SdI30403) | 「損気」「四階」「軍警」の収録漏れを報告 |

抜けている単語を見つけたら [X @jounlai](https://x.com/jounlai) まで。
