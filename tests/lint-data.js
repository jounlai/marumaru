/* 出題データの健全性検査。依存なしで動く（node tests/lint-data.js）。
 * 語を追加・編集したら、まずこれを通すこと。
 *   - その語が本当に盤面から作れるか（テンプレートに当てはまるか）
 *   - 同じラウンド内での重複
 *   - 字数がテンプレートと一致するか
 *   - 語釈の欠落・短すぎ、display の空文字
 *   - テンプレートの重複
 * ここを通っても「読みが正しいか」は分からない。清濁・長音の取り違え
 *   （探訪＝たんぼう、頒布＝はんぷ、惨敗＝ざんぱい 等）は人が確かめること。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const DATA = path.join(__dirname, "..", "js", "data.js");

const KANA_ROWS = [
  ["あ","い","う","え","お"],["か","き","く","け","こ"],["さ","し","す","せ","そ"],
  ["た","ち","つ","て","と"],["な","に","ぬ","ね","の"],["は","ひ","ふ","へ","ほ"],
  ["ま","み","む","め","も"],["や","ゆ","よ"],["ら","り","る","れ","ろ"],["わ","を"],["ん"]
];
const VOICED_ROWS = [
  ["が","ぎ","ぐ","げ","ご"],["ざ","じ","ず","ぜ","ぞ"],["だ","ぢ","づ","で","ど"],
  ["ば","び","ぶ","べ","ぼ"],["ぱ","ぴ","ぷ","ぺ","ぽ"],["ゔ"]
];
const DAKUTEN_MAP = {"か":"が","き":"ぎ","く":"ぐ","け":"げ","こ":"ご","さ":"ざ","し":"じ","す":"ず","せ":"ぜ","そ":"ぞ","た":"だ","ち":"ぢ","つ":"づ","て":"で","と":"ど","は":"ば","ひ":"び","ふ":"ぶ","へ":"べ","ほ":"ぼ"};
const PLAIN = KANA_ROWS.flat();
const ALL = [...PLAIN, ...VOICED_ROWS.flat()];

const voiced = k => DAKUTEN_MAP[k] || (k + "゙");
const fill = (r, k) => r.mode === "dakutenSecond"
  ? r.template.replace("○", k).replace("〇", voiced(k))
  : r.template.replaceAll("○", k);

const sandbox = {};
vm.runInNewContext(
  fs.readFileSync(DATA, "utf8") + ";this.OUT={ROUND_DATA,SPECIAL_ROUNDS,WORD_ROUNDS};",
  sandbox
);
const { ROUND_DATA, SPECIAL_ROUNDS, WORD_ROUNDS } = sandbox.OUT;

const errors = [];
const warnings = [];
const templates = new Set();
let words = 0;

for (const [label, rounds] of [["通常", ROUND_DATA], ["SPECIAL", SPECIAL_ROUNDS], ["WORD", WORD_ROUNDS]]) {
  for (const r of rounds) {
    if (templates.has(r.template)) errors.push(`テンプレート重複: ${r.template}`);
    templates.add(r.template);

    const pool = r.mode === "dakutenSecond" ? PLAIN.filter(k => DAKUTEN_MAP[k]) : ALL;
    const legal = new Set(pool.map(k => fill(r, k)));
    const tplLen = [...r.template].length;
    const seen = new Set();

    if (!r.answers.length) errors.push(`${r.template}: 正解が0語`);
    for (const a of r.answers) {
      words++;
      const at = `${label} ${r.template} / ${a.word}`;
      if (!legal.has(a.word)) errors.push(`${at}: この盤面では作れない語`);
      if (seen.has(a.word)) errors.push(`${at}: 同じラウンド内で重複`);
      seen.add(a.word);
      if ([...a.word].length !== tplLen) errors.push(`${at}: 字数がテンプレート(${tplLen})と違う`);
      if (!a.meaning || !a.meaning.trim()) errors.push(`${at}: 語釈が空`);
      else if (a.meaning.length < 6) errors.push(`${at}: 語釈が短すぎる`);
      if (a.display !== undefined && !String(a.display).trim()) errors.push(`${at}: display が空`);
      if (/[а-яА-Я가-힣]/.test(a.meaning)) errors.push(`${at}: 語釈に別言語が混入`);
    }
    // 正解が少ないラウンドは運任せになりやすい（SPECIALは入力できる仮名が20個なので除く）
    if (r.mode !== "dakutenSecond" && r.answers.length < 3) {
      warnings.push(`${r.template}: 正解が${r.answers.length}語しかなく、当てずっぽうになりやすい`);
    }
  }
}

// index.html の ?v= は css/js の内容から作るハッシュ。ここを上げ忘れると、
// 既に遊んだ人のブラウザが古い data.js / game.js をキャッシュから使い続け、
// 追加した語が不正解になったり、直したはずの不具合が残ったりする。
// （GitHub Pages は cache-control: max-age=600 で配信する）
// 語数ではなく内容から作るのは、語彙を変えない修正でもキャッシュを切るため。
const root = path.join(__dirname, "..");
const ASSETS = ["css/styles.css", "js/data.js", "js/game.js"];
const stamp = crypto.createHash("sha1")
  .update(ASSETS.map(f => fs.readFileSync(path.join(root, f))).join("\n"))
  .digest("hex").slice(0, 8);

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:href|src)="((?:css|js)\/[^"?]*?)(?:\?v=([^"]*))?"/g)];
for (const f of ASSETS) if (!refs.some(m => m[1] === f)) errors.push(`index.html が ${f} を読み込んでいない`);
for (const m of refs) {
  if (m[2] === undefined) errors.push(`index.html: ${m[1]} に ?v= が無い（キャッシュ対策）`);
  else if (m[2] !== stamp) errors.push(`index.html: ${m[1]} の ?v=${m[2]} が古い → ?v=${stamp} に直す`);
}

const n = rs => rs.reduce((s, r) => s + r.answers.length, 0);
console.log(`${templates.size}ラウンド / ${words}語`);
console.log(`  通常 ${ROUND_DATA.length} (${n(ROUND_DATA)}語) ・ SPECIAL ${SPECIAL_ROUNDS.length} (${n(SPECIAL_ROUNDS)}語) ・ WORD ${WORD_ROUNDS.length} (${n(WORD_ROUNDS)}語)`);

if (warnings.length) {
  console.log("\n■ 警告");
  warnings.forEach(w => console.log("  - " + w));
}
if (errors.length) {
  console.log("\n■ エラー");
  errors.forEach(e => console.log("  - " + e));
  console.log(`\n=== ${errors.length}件のエラー ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== 不整合なし ===");
}
