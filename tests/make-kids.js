/* こども版に出さない語を選び、js/kids.js を書き出す。
 *   node tests/make-kids.js
 *
 * 方針
 *   こども版でも、正解になる語は減らさない。減らすと「押しても当たらない」
 *   ことが増えて、★ばかり減ってしまうため。難しい語は、出会って覚える側に置く。
 *   外すのは、子供に見せたくない語だけにする。
 *
 *   1. 性的な語・障害を指す古い俗称は外す（下の BLOCK）
 *   2. うんこ・うんち・ちんちん のような下ネタは外さない。子供の笑いの範囲で、
 *      辞書にも載っている
 *
 * 語釈から機械的に候補を拾ったうえで、BLOCK は人が決める。語を足したら
 * 走らせ直して、新しい語が引っかからないか確かめること。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const DICT = path.join(__dirname, ".cache", "JMdict_e.gz");
const OUT = path.join(ROOT, "js", "kids.js");

/* 辞書の有無にかかわらず、こども版には出さない語。
 * 語釈から機械的に拾ったうえで、目で足し引きしている。 */
const BLOCK = new Set([
  // 性的な語
  "えろえろ", "えちえち", "えろい", "らんこう", "がんしゃ", "いんび", "いんむ",
  "いんぷ", "くがい", "たゆう", "ちんこ", "まんこ", "ちんぽ", "いんぽ",
  "ぱいぱい", "てんが",
  // 障害を指す古い俗称（おとな版では注記付きで残している）
  "めくめく", "つんぼ", "ちんば", "よいよい"
]);

const kata = w => [...w].map(c => {
  const n = c.charCodeAt(0);
  return (n >= 0x3041 && n <= 0x3096) ? String.fromCharCode(n + 0x60) : c;
}).join("");

if (!fs.existsSync(DICT)) {
  console.log(`辞書が無い。先に node tests/check-readings.js を走らせて ${path.relative(ROOT, DICT)} を用意する。`);
  process.exitCode = 1;
  return;
}

// JMdict から「読み → 常用度タグの有無」を作る
const xml = zlib.gunzipSync(fs.readFileSync(DICT)).toString("utf8");
const info = new Map();
{
  const entry = /<entry>([\s\S]*?)<\/entry>/g;
  const reb = /<reb>(.*?)<\/reb>/g;
  let m;
  while ((m = entry.exec(xml))) {
    const body = m[1];
    const hot = /<(?:ke|re)_pri>/.test(body);   // 新聞頻度などのタグが1つでも付くか
    let x;
    reb.lastIndex = 0;
    while ((x = reb.exec(body))) info.set(x[1], info.get(x[1]) === true ? true : hot);
  }
}
const look = w => info.has(w) ? info.get(w) : (info.has(kata(w)) ? info.get(kata(w)) : undefined);

const sandbox = {};
vm.runInNewContext(
  fs.readFileSync(path.join(ROOT, "js", "data.js"), "utf8") +
  ";this.OUT={ROUND_DATA,SPECIAL_ROUNDS,WORD_ROUNDS};",
  sandbox
);
const { ROUND_DATA, SPECIAL_ROUNDS, WORD_ROUNDS } = sandbox.OUT;

const ngWords = [];
let total = 0;
for (const rounds of [ROUND_DATA, SPECIAL_ROUNDS, WORD_ROUNDS]) {
  for (const r of rounds) {
    for (const a of r.answers) {
      total++;
      if (BLOCK.has(a.word)) ngWords.push(a.word);
    }
  }
}

const uniq = [...new Set(ngWords)].sort();
const rows = [];
for (let i = 0; i < uniq.length; i += 6) rows.push("  " + uniq.slice(i, i + 6).map(w => `"${w}"`).join(", "));

fs.writeFileSync(OUT,
`/* ===========================================================================
 * kids.js — こども版に出さない語（tests/make-kids.js が生成する。手で編集しない）
 * 性的な語と、障害を指す古い俗称 ${uniq.length} 語。難しい語は外していない。
 * 減らすと押しても当たらないことが増え、★ばかり減ってしまうため。
 * 語を足したら node tests/make-kids.js を走らせ直すこと。
 * =========================================================================== */
const KIDS_NG = new Set([
${rows.join(",\n")}
]);
`);

// 念のため、語釈から拾える性的・差別的な語が BLOCK から漏れていないか見る
const SUSPECT = /男性器|女性器|射精|勃起|性行為|性的|売春|遊女|娼|みだら|淫|差別語|盲人|聾|足の不自由/;
const missed = [];
for (const rounds of [ROUND_DATA, SPECIAL_ROUNDS, WORD_ROUNDS])
  for (const r of rounds)
    for (const a of r.answers)
      if (!BLOCK.has(a.word) && SUSPECT.test(a.meaning)) missed.push(`${a.word}（${a.display || ""}）`);

console.log(`全${total}語 → こども版で外す ${uniq.length}語 ／ 出す ${total - uniq.length}語`);
if (missed.length) {
  console.log("\n■ 語釈から見て、BLOCK に足すか検討したほうがよい語");
  console.log("  " + missed.join("  "));
} else {
  console.log("語釈から見て、取りこぼしは無い。");
}
console.log(`\n${path.relative(ROOT, OUT)} を書き出した。`);
