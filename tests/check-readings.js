/* display に当てた漢字が、その語の読みを本当に持つかを辞書で検査する。
 *   node tests/check-readings.js
 *
 * lint-data.js は「盤面から作れるか」までしか見ないので、読みの取り違えは
 * 素通りする。実際、○っちり の枠を埋めるために「ちっちり＝てっちり」、
 * ○っぱり の枠に「づっぱり＝突っ張り」という、既存語の漢字と語釈を
 * 使い回した捏造が入り込んでいた。同じ形で 48語（削除24・修正24）が
 * 見つかっている。
 *
 * JMdict（和英辞典・約22万エントリ）から「表記 → 読み」の索引を作り、
 * data.js の display の漢字表記それぞれについて、その語の読みが索引に
 * 載っているかを当てる。載っていなければ読みの取り違えを疑う。
 *
 * 初回だけ JMdict を落として tests/.cache/ に置く（約11MB、gitignore済み）。
 * 2回目からはネットに出ない。依存パッケージは無し。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const CACHE = path.join(__dirname, ".cache");
const DICT = path.join(CACHE, "JMdict_e.gz");
const URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz";  // ftp.edrdg.org は証明書が別名なので www を使う

/* 辞書が別読みしか載せていないだけで、こちらが正しいもの。
 * ここに書いた組み合わせは検査を通す。語を消すときは、この行も消すこと。 */
const ALLOW = new Set([
  "ほんほん\t本本",       // 大辞泉に「ほんぼん【本本】、ほんほんとも」
  "をんをん\t温々",       // 旧かな
  "をんな\t女",           // 旧かな
  "まづい\t不味い",       // 旧かな
  "しりしり\t人参シリシリー",
  "りくりく\t陸々",       // 字通
  "いいいい\t言言",       // 精選版日本国語大辞典
  "さつさつ\t颯々",
  "こわこわ\t強々",
  "もっきり\t盛り切り",
  "ゆけゆけ\t行け行け",
  "まいまい\t蝸牛",       // カタツムリの別名
  "ふとぶと\t太々",
  "そらぞら\t空々",
  "はろばろ\t遥々",
  "にんどう\t忍冬",       // スイカズラの漢名読み
  "さらい\t再来",         // 「再来年」「再来週」の再来
  "たんぱん\t短パン",
  "てんぱん\t天板",
  "げんじゃ\t験者",       // 修験者
  "ほんじょ\t本所",       // 東京の地名
  "りんたく\t輪タク",
  "にんとく\t仁徳",       // 仁徳天皇
  "もんむ\t文武",         // 文武天皇
  "ぱんこ\tパン粉",
  "ぱんや\tパン屋",
  "せんば\t船場",         // 大阪の地名
  "なんば\t難波",         // 大阪の地名
  "ほんが\t本歌",
  "つたい\t伝い",
  "たとう\t畳紙"
]);

const kata = w => [...w].map(c => {
  const n = c.charCodeAt(0);
  return (n >= 0x3041 && n <= 0x3096) ? String.fromCharCode(n + 0x60) : c;
}).join("");

function download(url, dest){
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const out = fs.createWriteStream(dest + ".part");
      res.pipe(out);
      out.on("finish", () => { out.close(() => { fs.renameSync(dest + ".part", dest); resolve(); }); });
      out.on("error", reject);
    }).on("error", reject);
  });
}

// JMdict は要素が単純なので、依存を増やさず正規表現で拾う
function buildIndex(xml){
  const k2r = new Map();
  const entry = /<entry>([\s\S]*?)<\/entry>/g;
  const keb = /<keb>(.*?)<\/keb>/g;
  const reb = /<reb>(.*?)<\/reb>/g;
  let m;
  while ((m = entry.exec(xml))) {
    const body = m[1];
    const ks = [], rs = [];
    let x;
    keb.lastIndex = 0; while ((x = keb.exec(body))) ks.push(x[1]);
    reb.lastIndex = 0; while ((x = reb.exec(body))) rs.push(x[1]);
    for (const k of ks) {
      let set = k2r.get(k);
      if (!set) k2r.set(k, set = new Set());
      for (const r of rs) set.add(r);
    }
  }
  return k2r;
}

(async () => {
  if (!fs.existsSync(DICT)) {
    fs.mkdirSync(CACHE, { recursive: true });
    console.log(`辞書が無いので取得する: ${URL}`);
    try { await download(URL, DICT); }
    catch (e) {
      console.log(`\n辞書を取得できなかった（${e.message}）。`);
      console.log(`手で落として ${path.relative(ROOT, DICT)} に置いても動く。`);
      process.exitCode = 1;
      return;
    }
  }

  const xml = zlib.gunzipSync(fs.readFileSync(DICT)).toString("utf8");
  const k2r = buildIndex(xml);

  const sandbox = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "js", "data.js"), "utf8") +
    ";this.OUT={ROUND_DATA,SPECIAL_ROUNDS,WORD_ROUNDS};",
    sandbox
  );
  const { ROUND_DATA, SPECIAL_ROUNDS, WORD_ROUNDS } = sandbox.OUT;

  const bad = [], stale = new Set(ALLOW);
  let checked = 0, skipped = 0;

  for (const [label, rounds] of [["通常", ROUND_DATA], ["SPECIAL", SPECIAL_ROUNDS], ["WORD", WORD_ROUNDS]]) {
    for (const r of rounds) {
      for (const a of r.answers) {
        if (!a.display) continue;
        for (const piece of a.display.split(/[／/]/)) {
          const d = piece.trim();
          if (!/[一-鿿]/.test(d)) continue;   // 漢字を含む表記だけを見る
          const reads = k2r.get(d);
          if (!reads) { skipped++; continue; }        // 辞書に無い表記は判定できない
          checked++;
          if (reads.has(a.word) || reads.has(kata(a.word))) continue;
          const key = `${a.word}\t${d}`;
          if (ALLOW.has(key)) { stale.delete(key); continue; }
          bad.push(`  ${label} ${r.template} / ${a.word}：「${d}」の読みは ${[...reads].slice(0, 4).join("・")}`);
        }
      }
    }
  }

  console.log(`照合できた表記 ${checked}件 ／ 辞書に無く判定できない表記 ${skipped}件`);

  if (stale.size) {
    console.log("\n■ ALLOW に残ったまま使われていない行（消してよい）");
    for (const k of stale) console.log("  " + k.replace("\t", " ／ "));
  }
  if (bad.length) {
    console.log("\n■ 読みと表記が食い違う");
    bad.forEach(b => console.log(b));
    console.log(`\n=== ${bad.length}件 ===`);
    console.log("その読みの語が本当にあるなら display を正しい表記へ直す。");
    console.log("無いなら、枠を埋めるための捏造なので語ごと消す。");
    console.log("辞書が別読みしか載せていないだけなら ALLOW に足す。");
    process.exitCode = 1;
  } else {
    console.log("\n=== 不整合なし ===");
  }
})();
