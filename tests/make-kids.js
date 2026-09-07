/* こども版に出す語を選び、js/kids.js を書き出す。
 *   node tests/make-kids.js
 *
 * 選び方（「中間」の線）
 *   1. 卑猥・性的・差別的な語は、辞書に載っていても外す（下の BLOCK）
 *   2. JMdict に常用度タグ（news/ichi/spec/gai/nf）が付く語は入れる
 *   3. タグが無くても、漢字表記を持たない語（きらきら・わくわく のような
 *      擬音語・擬態語・口語）は、辞書に見出しがあれば入れる
 *   4. SPECIAL ラウンドの畳語（ときどき・さまざま・ひとびと）は、漢字表記を
 *      持つがどれも日常語なので、辞書に見出しがあれば入れる
 *   5. それ以外（惻々・磊々・蓼蓼 のような表外漢字の漢語、辞書に無い古語）は外す
 *
 * 出力は「出してよい語」の側にする。語を足したときに既定で こども版へ
 * 出ないほうが安全なため。tests/lint-data.js が同期を検査する。
 *
 * 辞書は check-readings.js と同じ tests/.cache/JMdict_e.gz を使う。
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
  "いんぷ", "くがい", "たゆう", "ちんこ", "まんこ", "ちんぽ", "ちんちん",
  "いんぽ", "ぱいぱい", "てんが",
  // 障害を指す古い俗称（大人版では注記付きで残している）
  "めくめく", "つんぼ", "ちんば", "よいよい",
  // 排泄まわりで、笑いにならないもの
  "しいしい", "べんき"
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

const okWords = [];
let blocked = 0, tooHard = 0, total = 0;

for (const [isSpecial, rounds] of [[false, ROUND_DATA], [true, SPECIAL_ROUNDS], [false, WORD_ROUNDS]]) {
  for (const r of rounds) {
    for (const a of r.answers) {
      total++;
      if (BLOCK.has(a.word)) { blocked++; continue; }
      const hot = look(a.word);
      if (hot === undefined) { tooHard++; continue; }      // 辞書に見出しが無い
      const hasKanji = a.display && /[一-鿿]/.test(a.display);
      if (hot || !hasKanji || isSpecial) okWords.push(a.word);
      else tooHard++;
    }
  }
}

const uniq = [...new Set(okWords)].sort();
const rows = [];
for (let i = 0; i < uniq.length; i += 8) rows.push("  " + uniq.slice(i, i + 8).map(w => `"${w}"`).join(", "));

fs.writeFileSync(OUT,
`/* ===========================================================================
 * kids.js — こども版に出す語（tests/make-kids.js が生成する。手で編集しない）
 * 卑猥・差別的な語と、辞書で低頻度の難しい語を外した ${uniq.length} 語。
 * 語を足したら node tests/make-kids.js を走らせ直すこと。
 * =========================================================================== */
const KIDS_OK = new Set([
${rows.join(",\n")}
]);
`);

// ラウンドごとの成立状況
let alive = 0, dead = [];
const okSet = new Set(uniq);
for (const [lab, rounds] of [["通常", ROUND_DATA], ["SPECIAL", SPECIAL_ROUNDS], ["WORD", WORD_ROUNDS]]) {
  for (const r of rounds) {
    const n = r.answers.filter(a => okSet.has(a.word)).length;
    if (n < 3) dead.push(`${lab} ${r.template}(${r.answers.length}→${n})`); else alive++;
  }
}
console.log(`全${total}語 → こども版 ${uniq.length}語`);
console.log(`  卑猥・差別で除外 ${blocked}語 ／ 難しすぎるとして除外 ${tooHard}語`);
console.log(`ラウンド: 成立 ${alive} ／ 正解3語未満で こども版から外れる ${dead.length}`);
if (dead.length) console.log("  " + dead.join("  "));
console.log(`\n${path.relative(ROOT, OUT)} を書き出した。`);
