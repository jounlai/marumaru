/* ===========================================================================
 * game.js — 〇〇ことば 本体
 *  1) 盤面定数とラウンド構成
 *  2) 状態・セーブ
 *  3) 小道具（DOM/計算）
 *  4) 描画
 *  5) 演出（音・粒子・バースト）
 *  6) ゲーム進行
 *  7) モーダル / イベント
 * =========================================================================== */
"use strict";

/* --------------------------------------------- 1) 盤面定数とラウンド構成 */
const KANA_ROWS = [
  ["あ","い","う","え","お"],
  ["か","き","く","け","こ"],
  ["さ","し","す","せ","そ"],
  ["た","ち","つ","て","と"],
  ["な","に","ぬ","ね","の"],
  ["は","ひ","ふ","へ","ほ"],
  ["ま","み","む","め","も"],
  ["や",null,"ゆ",null,"よ"],
  ["ら","り","る","れ","ろ"],
  // わ・を・ん は3つしかないので1行にまとめ、空いたぶんを下の操作バーに回す
  ["わ",null,"を",null,"ん"]
];
const VOICED_ROWS = [
  ["が","ぎ","ぐ","げ","ご"],
  ["ざ","じ","ず","ぜ","ぞ"],
  ["だ","ぢ","づ","で","ど"],
  ["ば","び","ぶ","べ","ぼ"],
  ["ぱ","ぴ","ぷ","ぺ","ぽ"]
  // ゔ は置かない。3,660語のどこにも現れず、押せば必ず★が減るだけの
  // 罠になっていた。ゔ を使う語を足したら lint が「盤面から入力できない」
  // と言うので、そのとき行ごと戻すこと。
];
const PLAIN_KANA = KANA_ROWS.flat().filter(Boolean);
const ALL_KANA = [...PLAIN_KANA, ...VOICED_ROWS.flat()].filter(Boolean);
const DAKUTEN_MAP = {"か":"が","き":"ぎ","く":"ぐ","け":"げ","こ":"ご","さ":"ざ","し":"じ","す":"ず","せ":"ぜ","そ":"ぞ","た":"だ","ち":"ぢ","つ":"づ","て":"で","と":"ど","は":"ば","ひ":"び","ふ":"ぶ","へ":"べ","ほ":"ぼ"};
const DAKUTEN_BASE_KANA = new Set(Object.keys(DAKUTEN_MAP));

// 通常ラウンドは「正解数の多い順」に並べ替える（旧セーブ移行のため元の順も保持）
const MAIN_ROUND_COUNT = ROUND_DATA.length;
const ROUND_DATA_LEGACY_ORDER = ROUND_DATA.map(r => r.template);
ROUND_DATA.sort((a, b) => {
  const d = b.answers.length - a.answers.length;
  return d || ROUND_DATA_LEGACY_ORDER.indexOf(a.template) - ROUND_DATA_LEGACY_ORDER.indexOf(b.template);
});
// 並び：通常（擬音・擬態）→ SPECIAL（連濁）→ WORD（ふつうのことば）
ROUND_DATA.push(...SPECIAL_ROUNDS, ...WORD_ROUNDS);
// 種別は添字の範囲ではなくラウンド自身に持たせる。こども版では途中のラウンドが
// 抜けるので、範囲で判定すると崩れるため。
ROUND_DATA.forEach((r, i) => {
  r.group = i >= MAIN_ROUND_COUNT + SPECIAL_ROUNDS.length ? "word"
          : i >= MAIN_ROUND_COUNT ? "special" : "main";
});
function groupOf(i){ return ROUND_DATA[i].group; }

/* ------------------------------------------------- 1.5) こども版 / おとな版 */
const MODE_KEY = "maruanagame-mode";
let mode = null;
try { const m = localStorage.getItem(MODE_KEY); if (m === "kids" || m === "adult") mode = m; } catch (e) {}

/* 画面の言語。遊びそのものは日本語のかなを当てるものなので、お題と語釈は
   日本語のまま。訳すのは操作に必要な文字だけ（js/i18n.js を参照）。 */
const LANG_KEY = "maruanagame-lang";
let lang = "ja";
try {
  const l = localStorage.getItem(LANG_KEY);
  if (l && STRINGS[l]) lang = l;
} catch (e) {}
// 鍵を引く。日本語のこども版だけ言い換えを持ち、他の言語は1つの文言で足りる
function t(key, vars){
  let v;
  if (lang === "ja") v = (mode === "kids" && STRINGS.jaKids[key] !== undefined)
    ? STRINGS.jaKids[key] : STRINGS.ja[key];
  else v = STRINGS[lang][key];
  // 繁体字に無い鍵は簡体字へ落とす。日本語へ落とすより読めるため
  if (v === undefined && LANG_FALLBACK[lang]) v = STRINGS[LANG_FALLBACK[lang]][key];
  if (v === undefined) v = STRINGS.ja[key];
  if (v === undefined) return key;
  if (vars) for (const k in vars) v = v.split("{" + k + "}").join(vars[k]);
  return v;
}
function setLang(l){
  if (!STRINGS[l] || l === lang) return;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) {}
  location.reload();
}
// 画面に直接書いてある文字を、選んだ言語で置き換える
function applyStaticText(){
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const v = t(el.dataset.i18nTitle);
    el.title = v;
    if (el.hasAttribute("aria-label")) el.setAttribute("aria-label", v);
  });
  document.documentElement.lang = HTML_LANG[lang] || lang;
  const mn = $("#mgName");
  if (mn) { mn.textContent = t("game_name"); mn.hidden = !mn.textContent; }
  // タブに出る題。SNS のカードはクローラが静的な HTML を読むので、
  // そちらは日本語のまま（配信元が1つなので、貼る人ごとに変えられない）。
  document.title = t("page_title");
}

// こども版で外すのは、子供に見せたくない語だけにする。難しい語も正解のまま
// 残す。正解を減らすと「押しても当たらない」ことが増えて、★ばかり減るため。
function applyMode(){
  if (mode !== "kids") return;
  const kept = [];
  for (const r of ROUND_DATA) {
    const answers = r.answers.filter(a => !KIDS_NG.has(a.word));
    if (answers.length >= 3) kept.push({ ...r, answers });
  }
  ROUND_DATA.length = 0;
  ROUND_DATA.push(...kept);
}
applyMode();
function HINT_COST(){ return mode === "kids" ? 0 : HINT_COST_ADULT; }

// 種別ごとの通し番号（ROUND 01 / SPECIAL 01 / WORD 01）
const ROUND_NO = new Map();
{
  const n = { main: 0, special: 0, word: 0 };
  ROUND_DATA.forEach((r, i) => ROUND_NO.set(i, ++n[r.group]));
}

/* ------------------------------------------------------------- 1.6) ステージ */
const STAGE_SIZE = 8;
// 1ステージのなかで形式が偏らないよう、通常・WORD・SPECIAL を混ぜて並べる。
// 通常ラウンドは正解数の多い順に並んでいるので、この順のまま取り出せば
// ステージが進むほど難しくなる。
function buildStages(){
  const byGroup = { main: [], special: [], word: [] };
  ROUND_DATA.forEach((r, i) => byGroup[r.group].push(i));
  const order = [];
  const take = g => { if (byGroup[g].length) order.push(byGroup[g].shift()); };
  while (byGroup.main.length || byGroup.word.length || byGroup.special.length) {
    take("main"); take("word"); take("main"); take("word"); take("special"); take("word");
  }
  const stages = [];
  for (let i = 0; i < order.length; i += STAGE_SIZE) stages.push(order.slice(i, i + STAGE_SIZE));
  // 最後のステージが短すぎたら手前に足す（6問未満のステージを作らない）
  if (stages.length > 1 && stages[stages.length - 1].length < 6) {
    const tail = stages.pop();
    stages[stages.length - 1].push(...tail);
  }
  return stages;
}
/* ステージには名前を付ける。番号だけだと、どのステージも同じに見えるため。
 *
 * 名前は「ことばの氷山」の層にした。ラウンドは正解数の多い順に並んでいて、
 * 進むほど正解が減り、見慣れない語ばかりになる。この並びは
 * 「水の上は誰でも知っている・下ほど数が減って奇妙になる」という氷山
 * そのものなので、深さを名前にすると、難しくなる理由がそのまま絵になる。
 * 土地の名前では、札幌と那覇のあいだに難しくなる理由が無かった。
 *
 * [おとな版の名前, こども版の名前, 深さ（m。正の数は水の上）] */
const STAGE_LAYERS = [
  ["氷の頂",   "てっぺん",       40], ["日向",     "ひなた",         25],
  ["波際",     "なみぎわ",        8], ["水面",     "すいめん",        0],
  ["浅瀬",     "あさせ",        -15], ["光の層",   "ひかり",        -40],
  ["藻場",     "もば",          -80], ["青闇",     "あおやみ",     -130],
  ["氷の底",   "こおりのそこ", -200],
  // ここで氷山は終わる。実際の氷山は深くても200m台までしか沈んでいない。
  // その先は氷を離れた海。見えていたのは一角で、ことばはまだ続く。
  ["群青",     "ぐんじょう",   -320], ["薄明帯",   "うすあかり",   -500],
  ["夜の海",   "よるのうみ",   -800], ["無光層",   "まっくら",    -1200],
  ["深海",     "ふかいうみ", -1700], ["冷たい壁", "つめたいかべ",-2300],
  ["沈黙",     "しずか",      -3000], ["深海平原", "ひろいそこ",  -3800],
  ["泥の底",   "どろのそこ",  -4500], ["骨の層",   "ほね",        -5200],
  ["漆黒",     "まっくろ",    -5900], ["超深海帯", "もっとふかい",-6500],
  ["海溝の口", "かいこうのくち",-7200], ["亀裂",   "ひびわれ",    -7900],
  ["冷たい灯", "つめたいひ",  -8500], ["忘却層",   "わすれもの",  -9100],
  ["海淵",     "かいえん",    -9700], ["最深部",   "いちばんした",-10200],
  ["底の底",   "そこのそこ", -10600], ["未踏",     "みとう",     -10900],
  ["ことばの底","ことばのそこ",-11000]
];
// 氷山が終わる層。ここより下はもう氷ではない
const KEEL_INDEX = 8;
function stageName(si){
  const n = STAGE_LAYERS[si];
  if (!n) return t("stage_n", {n: si + 1});
  if (lang !== "ja") return (LAYER_I18N[lang] || [])[si]
    || (LAYER_I18N[LANG_FALLBACK[lang]] || [])[si] || n[0];
  return mode === "kids" ? n[1] : n[0];
}
// 層の深さ（m）。用意した層より先へ伸びたときは、同じ調子で下へ延ばす
function stageDepth(si){
  const n = STAGE_LAYERS[si];
  if (n) return n[2];
  const last = STAGE_LAYERS[STAGE_LAYERS.length - 1][2];
  return last - (si - STAGE_LAYERS.length + 1) * 100;
}
// −1,200m のように書く。水の上は + を付けて、水面（0m）を境目に見せる
function depthLabel(d){
  const n = Math.abs(d).toString().replace(/\B(?=(\d{3})+$)/g, ",");
  return d > 0 ? `+${n}m` : d === 0 ? "0m" : `−${n}m`;
}
function depthText(si){ return depthLabel(stageDepth(si)); }
// 氷山が終わる位置（%）。ここより下は氷ではないので、絵も暗く沈める
function keelRatio(){
  return Math.max(0, Math.min(100, (KEEL_INDEX + 1) / STAGES.length * 100));
}
// 水面がどのステージに来るか。氷山の絵で水の線を引く位置に使う
function seaLevelRatio(){
  let i = 0;
  while (i < STAGES.length && stageDepth(i) >= 0) i++;
  return Math.max(0, Math.min(100, (i - 0.5) / STAGES.length * 100));
}

const STAGES = buildStages();
const STAGE_OF = new Map();
STAGES.forEach((rounds, si) => rounds.forEach(i => STAGE_OF.set(i, si)));

const CLEAR_RATE_ADULT = 0.6;
const CLEAR_RATE_KIDS = 0.4;   // こども版はクリアまでの語数を減らす
function clearRate(){ return mode === "kids" ? CLEAR_RATE_KIDS : CLEAR_RATE_ADULT; }
const BASE_POINT = 100;      // 1正解の基礎点
const COMBO_STEP = 20;       // コンボ1つごとの加点
const FEVER_AT = 5;          // 何連続でFEVERか
const FEVER_MULT = 2;        // FEVER中の倍率
const GREAT_RATE = 0.8;        // クリアと PERFECT のあいだの段
const PERFECT_MIN = 10;        // これ未満の正解数のラウンドは、GREAT を上限にする
const CLEAR_BONUS = 500;
const GREAT_BONUS = 1000;
const PERFECT_BONUS = 2000;
const HINT_COST_ADULT = 300;

const RANKS = [
  [0,"見習い"],[1500,"ことば拾い"],[5000,"語彙の使い手"],[12000,"辞書見習い"],
  [25000,"言葉の目利き"],[45000,"語彙巧者"],[75000,"ことばの達人"],[120000,"語彙王"],[200000,"〇〇の神"]
];

/* ------------------------------------------------------- 2) 状態・セーブ */
// 進行はモードごとに分ける。おとな版は旧アドレスからの引き継ぎがあるので
// キーを変えず v5 のまま使う。
const ADULT_SAVE_KEY = "maruanagame-progress-v5";
const KIDS_SAVE_KEY = "maruanagame-progress-kids-v1";
const LEGACY_SAVE_KEY = "maruanagame-progress-v4";
function saveKeyFor(m){ return m === "kids" ? KIDS_SAVE_KEY : ADULT_SAVE_KEY; }

let roundIndex = 0;
let stars = 5;
let soundOn = true;
let musicOn = true;
let score = 0;
let combo = 0;
let maxCombo = 0;

const roundStates = ROUND_DATA.map(() => ({
  found: new Set(), discovered: new Set(), used: new Set(),
  cleared: false, rewarded: false, gaveUp: false, great: false, greatRewarded: false, perfect: false, perfectRewarded: false
}));

function serializeProgress(){
  return {
    v: 5,
    roundTemplate: ROUND_DATA[roundIndex] && ROUND_DATA[roundIndex].template,
    stars, soundOn, musicOn, score, maxCombo,
    celebrated: [...celebrated],
    rounds: roundStates.map((s, i) => ({
      template: ROUND_DATA[i].template,
      found: [...s.found], discovered: [...s.discovered], used: [...s.used],
      cleared: s.cleared, rewarded: s.rewarded, gaveUp: s.gaveUp,
      great: s.great, greatRewarded: s.greatRewarded,
      perfect: s.perfect, perfectRewarded: s.perfectRewarded
    }))
  };
}
function saveProgress(){
  try { localStorage.setItem(saveKeyFor(mode), JSON.stringify(serializeProgress())); } catch (e) {}
}
function loadProgress(){
  let raw = null;
  try {
    raw = localStorage.getItem(saveKeyFor(mode));
    if (!raw && mode !== "kids") raw = localStorage.getItem(LEGACY_SAVE_KEY);
  } catch (e) {}
  if (!raw) return;
  let x;
  try { x = JSON.parse(raw); } catch (e) { return; }

  const hasTemplateKeys = Array.isArray(x.rounds) && x.rounds.some(r => r && typeof r.template === "string");
  if (Array.isArray(x.rounds)) {
    x.rounds.forEach((r, oldIndex) => {
      if (!r) return;
      const template = (typeof r.template === "string") ? r.template : ROUND_DATA_LEGACY_ORDER[oldIndex];
      const i = ROUND_DATA.findIndex(rr => rr.template === template);
      if (i < 0) return;
      const s = roundStates[i];
      s.found = new Set(Array.isArray(r.found) ? r.found : []);
      s.discovered = new Set(Array.isArray(r.discovered) ? r.discovered : []);
      s.used = new Set(Array.isArray(r.used) ? r.used : []);
      s.cleared = !!r.cleared; s.rewarded = !!r.rewarded; s.gaveUp = !!r.gaveUp;
      s.great = !!r.great; s.greatRewarded = !!r.greatRewarded;
      s.perfect = !!r.perfect; s.perfectRewarded = !!r.perfectRewarded;
      // 旧セーブに perfect が無い場合、全問発見済みなら補完（★は後追いで配らない）
      if (!s.perfect && s.discovered.size >= ROUND_DATA[i].answers.length) {
        s.perfect = true; s.perfectRewarded = true;
      }
    });
  }

  let selectedTemplate = (typeof x.roundTemplate === "string") ? x.roundTemplate : null;
  if (!selectedTemplate && Number.isInteger(x.roundIndex)) {
    selectedTemplate = hasTemplateKeys
      ? (x.rounds[x.roundIndex] || {}).template
      : ROUND_DATA_LEGACY_ORDER[x.roundIndex];
  }
  if (selectedTemplate) {
    const i = ROUND_DATA.findIndex(r => r.template === selectedTemplate);
    if (i >= 0) roundIndex = i;
  }
  if (Number.isFinite(x.stars) && x.stars >= 0) stars = x.stars;
  if (typeof x.soundOn === "boolean") soundOn = x.soundOn;
  // 以前から消音で遊んでいた人には、追加したBGMも鳴らさない。
  musicOn = typeof x.musicOn === "boolean" ? x.musicOn : soundOn;
  if (Number.isFinite(x.score)) score = x.score;
  if (Number.isFinite(x.maxCombo)) maxCombo = x.maxCombo;
  if (Array.isArray(x.celebrated)) celebrated = new Set(x.celebrated.filter(Number.isInteger));
}
/* 旧アドレス（GitHub Pages）から運ばれてきたセーブを、このドメインのセーブへ
 * 合流させる。localStorage はドメインごとに別なので、移転のあいだだけ URL で
 * 受け渡す。
 * 「移転先に保存が無ければ入れる」では引き継げない。移転先を一度でも開くと
 * 保存が作られるため、旧アドレスのクリア履歴が黙って捨てられていた。
 * どちらの進行も消えないよう、発見済みの語は和集合、★とスコアは大きいほう、
 * クリアの印は立っているほうを採って混ぜる。 */
function importHandoffSave(){
  const m = /(?:^|[#&])save=([^&]*)/.exec(location.hash);
  if (!m) return;
  try {
    const incoming = JSON.parse(decodeURIComponent(m[1]));
    let mine = null;
    try {
      mine = JSON.parse(localStorage.getItem(ADULT_SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY) || "null");
    } catch (e) {}
    const merged = mine ? mergeProgress(mine, incoming) : { ...incoming, v: 5, rounds: normalizeRounds(incoming) };
    localStorage.setItem(ADULT_SAVE_KEY, JSON.stringify(merged));
  } catch (e) {}
  // 引き継ぎ用の文字列をアドレス欄に残さない
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
}
// セーブの rounds を template 付きの形にそろえる（v4 は並び順で持っていた）
function normalizeRounds(x){
  return (Array.isArray(x.rounds) ? x.rounds : []).map((r, i) => {
    if (!r) return null;
    const template = (typeof r.template === "string") ? r.template : ROUND_DATA_LEGACY_ORDER[i];
    if (!template) return null;
    const discovered = Array.isArray(r.discovered) ? r.discovered : [];
    return {
      template,
      // URL に載せるため found を落としたセーブが来ることがある（下の分岐を参照）
      found: Array.isArray(r.found) ? r.found : discovered,
      discovered,
      used: Array.isArray(r.used) ? r.used : [],
      cleared: !!r.cleared, rewarded: !!r.rewarded, gaveUp: !!r.gaveUp,
      great: !!r.great, greatRewarded: !!r.greatRewarded,
      perfect: !!r.perfect, perfectRewarded: !!r.perfectRewarded
    };
  }).filter(Boolean);
}
function mergeProgress(mine, other){
  const n = v => Number.isFinite(v) ? v : 0;
  const byTemplate = new Map();
  for (const r of [...normalizeRounds(mine), ...normalizeRounds(other)]) {
    const cur = byTemplate.get(r.template);
    if (!cur) { byTemplate.set(r.template, r); continue; }
    cur.found = [...new Set([...cur.found, ...r.found])];
    cur.discovered = [...new Set([...cur.discovered, ...r.discovered])];
    cur.used = [...new Set([...cur.used, ...r.used])];
    cur.cleared = cur.cleared || r.cleared;
    cur.rewarded = cur.rewarded || r.rewarded;
    cur.great = cur.great || r.great;
    cur.greatRewarded = cur.greatRewarded || r.greatRewarded;
    cur.perfect = cur.perfect || r.perfect;
    cur.perfectRewarded = cur.perfectRewarded || r.perfectRewarded;
    cur.gaveUp = cur.gaveUp && r.gaveUp;   // 片方で降参していなければ降参扱いにしない
  }
  return {
    v: 5,
    roundTemplate: mine.roundTemplate || other.roundTemplate,
    stars: Math.max(n(mine.stars), n(other.stars)),
    soundOn: typeof mine.soundOn === "boolean" ? mine.soundOn : other.soundOn,
    musicOn: typeof mine.musicOn === "boolean" ? mine.musicOn
      : typeof mine.soundOn === "boolean" ? mine.soundOn
      : typeof other.musicOn === "boolean" ? other.musicOn : other.soundOn,
    score: Math.max(n(mine.score), n(other.score)),
    maxCombo: Math.max(n(mine.maxCombo), n(other.maxCombo)),
    rounds: [...byTemplate.values()]
  };
}
function clearSavedProgress(){
  try {
    localStorage.removeItem(saveKeyFor(mode));
    if (mode !== "kids") localStorage.removeItem(LEGACY_SAVE_KEY);
  } catch (e) {}
}

/* --------------------------------------------------------- 3) 小道具 */
const $ = s => document.querySelector(s);
const appEl = $("#app"), gridEl = $("#kanaGrid"), pocketEl = $("#pocket"), flashEl = $("#flash");

function current(){ return ROUND_DATA[roundIndex]; }
function state(){ return roundStates[roundIndex]; }
function isSpecial(round = current()){ return round.mode === "dakutenSecond"; }
function voicedKana(kana){ return DAKUTEN_MAP[kana] || (kana + "゙"); }
function inputKanasForRound(round = current()){ return isSpecial(round) ? PLAIN_KANA : ALL_KANA; }
function fillWord(round, kana){
  if (round.mode === "dakutenSecond") return round.template.replace("○", kana).replace("〇", voicedKana(kana));
  return round.template.replaceAll("○", kana);
}
function clearTarget(round = current()){ return Math.max(1, Math.ceil(round.answers.length * clearRate())); }
// GREAT は「クリアより1語でも多い」ところから。少ないラウンドで
// クリアと同時に GREAT になってしまわないようにする。
function greatTarget(round = current()){
  const n = round.answers.length;
  return Math.min(n, Math.max(clearTarget(round) + 1, Math.ceil(n * GREAT_RATE)));
}
// 正解が少ないラウンドは、全部見つけても PERFECT にしない。60語のラウンドと
// 4語のラウンドが同じ扱いでは釣り合わないため、GREAT を上限にする。
function canPerfect(round = current()){ return round.answers.length >= PERFECT_MIN; }
/* そのラウンドに、まだ得るものが残っているか。GREAT が上限のラウンドで
   GREAT まで取ったら、続けても★も点も増えない。「続ける」を出しても
   押し損になるので、その札は引っ込める。 */
/* あと1語で次の段（クリア・GREAT・PERFECT）に届くか。届くならその段の名前。
   パチンコのリーチと同じで、ここがいちばん惜しくて、いちばん煽りどころ。 */
function reachGoal(){
  const st = state(), n = current().answers.length, got = st.discovered.size;
  if (!st.cleared && got === clearTarget() - 1) return "CLEAR";
  if (!st.great && got === greatTarget() - 1) return "GREAT";
  if (canPerfect() && !st.perfect && got === n - 1) return "PERFECT";
  return null;
}
// 全ラウンドをクリアしたか。エンディングの入り口
function allCleared(){ return STAGES.every((_, si) => stageCleared(si)); }
function moreToEarn(i = roundIndex){
  const st = roundStates[i], r = ROUND_DATA[i];
  if (st.discovered.size >= r.answers.length) return false;
  return !(st.great && !canPerfect(r));
}
function answerMap(){ return new Map(current().answers.map(a => [a.word, a])); }
function answerDisplay(a){ return a.display || a.word; }
function kanaForWord(word){
  return inputKanasForRound().find(k => fillWord(current(), k) === word) || null;
}
function totalCorrectCount(){ return roundStates.reduce((n, s) => n + s.discovered.size, 0); }
function clearedCount(){ return roundStates.filter(s => s.cleared).length; }
function groupCount(g){ return ROUND_DATA.filter(r => r.group === g).length; }
function groupClearedCount(g){ return roundStates.filter((s, i) => s.cleared && ROUND_DATA[i].group === g).length; }
function perfectCount(){ return roundStates.filter(s => s.perfect).length; }
function isFever(){ return combo >= FEVER_AT; }
function rankName(){
  let i = 0;
  RANKS.forEach(([need], n) => { if (score >= need) i = n; });
  if (lang === "ja") return RANKS[i][1];
  return (RANK_I18N[lang] || [])[i] || (RANK_I18N[LANG_FALLBACK[lang]] || [])[i] || RANKS[i][1];
}
function roundExhaustedAll(){ return state().discovered.size >= current().answers.length; }
function roundLocked(){ return state().gaveUp || roundExhaustedAll() || stars <= 0; }
// そのラウンドで実際に押せる仮名（SPECIAL は濁点にできる清音だけ）
function pressableKanas(round = current()){
  return inputKanasForRound(round).filter(k => !(isSpecial(round) && !DAKUTEN_BASE_KANA.has(k)));
}
// 押せる仮名を使い切ってしまい、もう手が無い状態か
function roundExhausted(){ return pressableKanas().every(k => state().used.has(k)); }
/* 語釈。訳が用意できている語だけ差し替え、無ければ日本語のまま出す。
   3,660語すべてを4言語に訳すのは一度には終わらないので、少しずつ増やせる
   作りにしてある（js/meanings-i18n.js）。 */
/* 鍵はかな。ただし同じかなが別のラウンドに別の語釈で入っていることがある
   （〇ん〇ん の「しんしん＝雪が静かに降る」と 〇んしん の「しんしん＝心身」）。
   その12語だけ「テンプレート＋タブ＋かな」の鍵を先に見る。 */
function meaningKeys(a, round){
  const r = round || current();
  return [r.template + "\t" + a.word, a.word];
}
// 繁体字の訳がまだ無い語は簡体字へ落とす。日本語のまま出すより読めるため
function meaningTables(){
  if (typeof MEANINGS_I18N === "undefined") return [];
  return [MEANINGS_I18N[lang], MEANINGS_I18N[LANG_FALLBACK[lang]]].filter(Boolean);
}
function meaningOf(a, round){
  if (lang === "ja") return a.meaning;
  for (const m of meaningTables())
    for (const k of meaningKeys(a, round)) if (m[k]) return m[k];
  return a.meaning;
}
function hasTranslatedMeaning(a, round){
  if (lang === "ja") return true;
  return meaningTables().some(m => meaningKeys(a, round).some(k => !!m[k]));
}
// まだ訳の無い語には、辞書を引く道をそえる。日本語のまま放り出さないため
function lookupUrl(a){
  const w = encodeURIComponent(a.display ? String(a.display).split("/")[0] : a.word);
  const tl = lang === "zhTW" ? "zh-TW" : lang;
  return lang === "en" ? `https://jisho.org/search/${w}`
    : `https://translate.google.com/?sl=ja&tl=${tl}&text=${w}&op=translate`;
}
function esc(v){
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function num(n){ return n.toLocaleString("ja-JP"); }

function difficultyLabel(idx){
  const g = groupOf(idx);
  if (g === "special") return t("diff_special");
  if (g === "word") return t("diff_word", {n: [...ROUND_DATA[idx].template].length});
  return t("diff_main");
}
function roundName(i = roundIndex){
  const g = groupOf(i);
  const no = String(ROUND_NO.get(i) || 1).padStart(2, "0");
  if (g === "special") return `SPECIAL ${no}`;
  if (g === "word") return `WORD ${no}`;
  return `ROUND ${no}`;
}
// テンプレートを表示用HTMLへ（SPECIAL の2つ目の穴には濁点を重ねる）
// 画面と同じ字面の文字列。データでは穴を ○（白丸）で持っているが、
// 表に出すときは題字と同じ 〇 にそろえる（SPECIAL の後半は濁点つき）。
function templateText(template){
  return [...template].map(ch => ch === "○" ? "〇" : ch === "〇" ? "〇゙" : ch).join("");
}
function templateHTML(template){
  return [...template].map(ch => {
    if (ch === "○") return '<span class="hole">〇</span>';
    if (ch === "〇") return '<span class="hole">〇゙</span>';
    return esc(ch);
  }).join("");
}

/* ------------------------------------------------------------- 4) 描画 */
function renderPattern(preview){
  const round = current();
  const html = [...round.template].map(ch => {
    if (ch === "○") return `<span class="hole${preview ? " filled" : ""}">${esc(preview || "〇")}</span>`;
    if (ch === "〇") {
      const t = preview ? voicedKana(preview) : "〇゙";
      return `<span class="hole${preview ? " filled" : ""}">${esc(t)}</span>`;
    }
    return esc(ch);
  }).join("");
  $("#pattern").innerHTML = html;
  mascotHead(preview);   // 棒人間の頭は、いま狙っているかなになる
}

let starsShown = -1;
function renderStars(){
  const el = $("#stars");
  const shown = Math.min(stars, 10);
  const gained = starsShown >= 0 && stars > starsShown;
  el.innerHTML = Array.from({length: shown}, (_, i) =>
    `<span class="st${gained && i >= starsShown ? " stGain" : ""}">★</span>`).join("")
    + (stars > 10 ? `<span class="more">×${stars}</span>` : "");
  el.setAttribute("aria-label", `星 ${stars} 個`);
  starsShown = stars;
}
function popLostStar(){
  const wrap = $(".hudStarsWrap");
  const ghost = document.createElement("span");
  ghost.className = "hudStars";
  ghost.style.cssText = "position:absolute;right:0;top:0";
  ghost.innerHTML = '<span class="st stLost" style="position:static">★</span>';
  wrap.appendChild(ghost);
  setTimeout(() => ghost.remove(), 650);
}

let scoreShown = 0, scoreRaf = 0;
function renderScore(){
  const el = $("#scoreValue");
  cancelAnimationFrame(scoreRaf);
  const from = scoreShown, to = score, start = performance.now();
  if (from !== to) $("#hudScore").classList.add("bump");
  const step = now => {
    const t = Math.min(1, (now - start) / 420);
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    el.textContent = num(v);
    if (t < 1) scoreRaf = requestAnimationFrame(step);
    else { scoreShown = to; setTimeout(() => $("#hudScore").classList.remove("bump"), 200); }
  };
  scoreRaf = requestAnimationFrame(step);
}

// col: グリッドの何列目に置くか（1=清音 / 2=濁音・半濁音）
function buildSection(label, rows, col){
  const sec = document.createElement("div");
  sec.className = "kanaSection";
  const lab = document.createElement("div");
  lab.className = "kanaSectionLabel";
  lab.style.gridColumn = col;
  lab.textContent = label;
  sec.appendChild(lab);

  const amap = answerMap();
  rows.forEach((row, rowIdx) => {
    const rowEl = document.createElement("div");
    rowEl.className = "kanaRow";
    rowEl.style.gridColumn = col;
    rowEl.style.gridRow = rowIdx + 2;   // 1行目はラベル
    row.forEach(k => {
      if (!k) {
        const sp = document.createElement("span");
        sp.className = "kanaSpacer";
        sp.setAttribute("aria-hidden", "true");
        rowEl.appendChild(sp);
        return;
      }
      const b = document.createElement("button");
      b.className = "kana";
      b.textContent = k;
      b.dataset.kana = k;
      const invalid = isSpecial() && !DAKUTEN_BASE_KANA.has(k);
      const word = fillWord(current(), k);
      if (invalid) b.classList.add("invalid");
      if (state().used.has(k)) b.classList.add("used");
      if (state().found.has(word)) b.classList.add("correct");
      if ((state().gaveUp || state().perfect) && amap.has(word) && !state().discovered.has(word)) b.classList.add("missedCorrect");
      b.disabled = invalid || roundLocked() || state().used.has(k);
      if (!b.disabled) {
        b.addEventListener("click", () => guess(k));
        b.addEventListener("pointerenter", () => renderPattern(k));
        b.addEventListener("pointerleave", () => renderPattern());
      }
      rowEl.appendChild(b);
    });
    sec.appendChild(rowEl);
  });
  return sec;
}

function renderGrid(){
  gridEl.querySelectorAll(".kanaSection").forEach(el => el.remove());
  gridEl.classList.toggle("single", isSpecial());
  const sections = isSpecial()
    ? [buildSection("清音（後半は自動で濁音）", KANA_ROWS, 1)]
    : [buildSection("清音", KANA_ROWS, 1), buildSection("濁音・半濁音", VOICED_ROWS, 2)];
  sections.forEach(s => gridEl.insertBefore(s, pocketEl));
}

let lastFoundWord = null;
let atReach = false;   // いま出した演出がリーチか（得点の数字と重ねないため）
function renderFound(){
  const amap = answerMap();
  const ordered = [...state().found].reverse().map(w => amap.get(w)).filter(Boolean);
  const list = $("#foundList"), chips = $("#foundChips");

  $("#foundTally").textContent = `${state().discovered.size} / ${current().answers.length}`;
  if (!ordered.length) {
    list.innerHTML = '<div class="empty">まだゼロ。<br>〇だけがこちらを見ている。</div>';
    chips.innerHTML = '<div class="empty" style="font-size:10px;padding:6px 0">まだゼロ</div>';
    return;
  }
  list.innerHTML = ordered.map(a => `
    <div class="foundRow${a.word === lastFoundWord ? " isNew" : ""}">
      <div class="word">${esc(answerDisplay(a))}${a.display && a.display !== a.word ? `<span class="reading">${esc(a.word)}</span>` : ""}</div>
      <div class="meaning">${esc(meaningOf(a))}</div>
    </div>`).join("");
  chips.innerHTML = ordered.map(a =>
    `<button class="chip${a.word === lastFoundWord ? " isNew" : ""}" data-word="${esc(a.word)}">${esc(answerDisplay(a))}</button>`).join("");
}

function renderProgress(){
  const total = current().answers.length;
  const got = state().discovered.size;
  const target = clearTarget();
  const bar = $("#bar");
  $("#barFill").style.width = Math.min(100, got / total * 100) + "%";
  $("#barTarget").style.left = (target / total * 100) + "%";
  bar.classList.toggle("done", state().cleared);
  bar.classList.toggle("reach", !state().cleared && got === target - 1);
  updateMascot();
  $("#foundCount").innerHTML = t("found_count", {got, total});
  const left = target - got;
  $("#toClear").innerHTML = state().perfect ? '<span class="reachText">PERFECT</span>'
    : state().cleared ? t("to_perfect", {n: total - got})
    : left === 1 ? `<span class="reachText">${t("to_clear_1")}</span>`
    : t("to_clear", {n: left});
}

function renderCombo(){
  const el = $("#comboTag");
  el.classList.toggle("show", combo >= 2);
  el.classList.toggle("fever", isFever());
  el.textContent = isFever() ? `FEVER ×${FEVER_MULT}　${combo}連続` : `COMBO ×${combo}`;
  document.body.classList.toggle("fever", isFever());
}

// かなが押せない状態のときは、必ず理由と復帰手段を画面に出す
function renderDoneBar(){
  const bar = $("#doneBar"), s = state();
  const total = current().answers.length;
  const dead = stars <= 0;
  const exhausted = !dead && !s.gaveUp && !s.perfect && roundExhausted();

  const show = dead || exhausted || s.cleared || s.gaveUp;
  bar.classList.toggle("show", show);
  if (!show) return;

  const msg = $("#doneMsg");
  const kids = mode === "kids";
  if (dead) {
    msg.innerHTML = kids ? "<b>★が なくなった</b>" : "<b>★が尽きました</b> — ★5で再開できます。見つけたことばは消えません。";
  } else if (exhausted) {
    msg.innerHTML = t("msg_exhausted", {got: s.discovered.size, total});
  } else if (s.perfect) {
    msg.innerHTML = kids ? `<b>PERFECT</b> ${total}語` : `<b>PERFECT</b> — 全${total}語を発見しました。`;
  } else if (roundExhaustedAll()) {
    msg.innerHTML = kids ? `<b>GREAT</b> ${total}語` : `<b>GREAT</b> — 全${total}語を発見しました。`;
  } else if (s.great) {
    msg.innerHTML = kids ? `<b>GREAT</b> のこり ${total - s.discovered.size} 語` : `<b>GREAT</b> — 残り ${total - s.discovered.size} 語。${canPerfect() ? "続ければ <b>PERFECT（★+2）</b>。" : ""}`;
  } else if (s.gaveUp) {
    msg.innerHTML = t("msg_gaveup");
  } else {
    const toGreat = Math.max(0, greatTarget() - s.discovered.size);
    msg.innerHTML = kids
      ? `<b>クリア！</b> あと ${toGreat} 語で GREAT`
      : `<b>クリア済み</b> — あと ${toGreat} 語で <b>GREAT（★+1）</b>、はずせば ★−1。`;
  }

  $("#reviveBarBtn").hidden = !dead;
  $("#retryBtn").hidden = dead || !(roundLocked() || exhausted);
  $("#revealBtn").hidden = !(dead || exhausted || s.gaveUp || s.perfect);
  $("#nextBtn").hidden = dead;
}

function render(){
  $("#stageChip").textContent = `${currentStage() + 1}　${stageName(currentStage())}`;
  $("#roundLabel").textContent = roundName();
  $("#roundLabel").classList.toggle("special", isSpecial());
  $("#difficulty").textContent = difficultyLabel(roundIndex);
  renderPattern(); renderStars(); renderScore(); renderGrid();
  renderFound(); renderProgress(); renderCombo(); renderDoneBar();
  $("#hintBtn").disabled = $("#hintBtnM").disabled = roundLocked();
  $("#giveupBtn").disabled = $("#giveupBtnM").disabled = state().cleared || state().gaveUp;
  document.body.classList.toggle("isGreat", state().great && !state().perfect);
}

const SITE_URL = "https://marumaru.heuron.com/";
const AUTHOR = "@jounlai";
// X の投稿画面を開く。収録漏れの報告と、PERFECT の共有に使う
function xIntent(text){
  return "https://x.com/intent/tweet?text=" + encodeURIComponent(text + "\n" + SITE_URL);
}
/* 投稿は「結果」より先に「問題」を見せる。読んだ人はこのゲームを知らないので、
   お題と例を先に置いて、その場で解ける形にしないと素通りされる。
   ゲーム名は行頭ではなくハッシュタグで最後に置く（行頭の「〇〇ことば」は
   伏せ字に見えて、名前だと伝わらないため）。 */
function puzzleLines(round = current(), exCount = 3){
  // 変数名は t を避ける。翻訳の t() を隠してしまうため
  const tpl = templateText(round.template);
  const rule = t(round.group === "word" ? "rule_word"
    : round.group === "special" ? "rule_special" : "rule_main", {t: tpl});
  const ex = blurbExamples(round, exCount).map(a => `${kanaForWord(a.word)}→${answerDisplay(a)}`);
  return ex.length ? `${rule}\n${ex.join("、")}…` : rule;
}
function blurbExamples(round, n){
  // 例に出す語は、知らない人が見ても分かるものを選ぶ。データの先頭から取ると
  // anan や 殷々 のような珍しい語が並んで、かえって分からなくなるため。
  const score = a => {
    const d = a.display;
    if (!d) return 3;                                   // かな書き（かんかん など）
    if (/[／/]/.test(d)) return 0;                      // 複数表記は例に向かない
    if (/[A-Za-zＡ-Ｚａ-ｚ0-9]/.test(d)) return 0;       // anan・TENGA のたぐい
    if (/[々〻]/.test(d)) return 1;                      // 殷々・延々 は読みにくい
    return [...d].length === 2 ? 3 : 2;                 // 暗記・元気 のような2字熟語
  };
  const seen = new Set();
  return [...round.answers]
    .map((a, i) => ({a, i, s: score(a)}))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .filter(({a}) => {
      const k = kanaForWord(a.word);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, n)
    .map(({a}) => a);
}
/* はずれたとき。収録漏れかもしれないので、その場から作者へ報告できるようにする。
   こども版では作った文字列自体を見せないため、報告の導線も出さない。 */
function flashMiss(word){
  if (mode === "kids") { flash("bad", pickFrom(BAD_MSGS_I18N, BAD_MSGS)); return; }
  flashEl.className = "flash bad";
  flashEl.innerHTML =
    `<span class="fw">${esc(word)}</span>` +
    `<span class="fm">${esc(pickFrom(BAD_MSGS_I18N, BAD_MSGS))}</span>` +
    `<a class="reportLink" target="_blank" rel="noopener" href="${esc(xIntent(
      t("report_text", {word, puzzle: puzzleLines(current(), 2), author: AUTHOR})))}">` +
    `${esc(t("report_link"))}</a>`;
}

function flash(kind, text){
  flashEl.className = "flash " + kind;
  flashEl.textContent = text;
}
// 正解したことばを、表記・読み・意味つきでしばらく残す
function flashAnswer(a, note){
  const reading = (a.display && a.display !== a.word) ? `<span class="rd">${esc(a.word)}</span>` : "";
  flashEl.className = "flash good";
  flashEl.innerHTML =
    `<span class="fw">${esc(answerDisplay(a))}</span>${reading}` +
    (note ? `<span class="fn">${esc(note)}</span>` : "") +
    `<span class="fm">${esc(meaningOf(a))}</span>`;
}

/* ------------------------------------------------------------- 5) 演出 */

/* iPhone で効果音が鳴らない件について。原因は3つあり、どれも対処が要る。
 *
 *  1) 着信スイッチが「消音」だと WebAudio は鳴らない。ページの音は既定で
 *     ambient 扱いになり、消音スイッチに従うため。playback 扱いに変えると鳴る。
 *     ・iOS 16.4 以降 … navigator.audioSession.type = "playback" で明示できる
 *     ・それ以前     … 無音の <audio> をループ再生すると playback に切り替わる
 *  2) AudioContext は最初 suspended で始まる。ユーザー操作の中で resume が要る。
 *  3) 一度バックグラウンドに回すと再び suspended になり、戻っても止まったまま。
 *
 * 無音WAVは外部ファイルにせず data URI で持つ（依存ゼロ・file:// でも動く）。
 */
const SILENT_WAV = "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

let actx = null, silentEl = null;
let musicPlayer = null, audioUnlocked = false, audioPageHidden = false;

/* BGM が鳴ってよい場面か。遊んでいるあいだだけにする。
   入り口・ホーム・層の一覧・メニュー・答え合わせ・ゲームオーバー・
   エンディングでは止める。祝いの演出（.burst）と層の移動は盤面の続きなので、
   そこは鳴らしたままにする。 */
function inGame(){
  if (!mode) return false;
  for (const sel of ["#modeGate", "#startGate", "#ending"]) {
    const el = $(sel);
    if (el && !el.hidden) return false;
  }
  return !document.querySelector(".modal.show");
}
function syncMusic(){
  if (!musicOn || !inGame() || !audioUnlocked || document.hidden || audioPageHidden) {
    if (musicPlayer) musicPlayer.stop();
    return;
  }
  if (!actx) return;
  if (!musicPlayer) musicPlayer = IcebergMusic.create(actx, () => ({mode, stage: currentStage()}));
  musicPlayer.start();
}
function syncAudioButtons(){
  $("#soundBtn").textContent = t(soundOn ? "sound_on" : "sound_off");
  $("#soundBtn").setAttribute("aria-pressed", String(soundOn));
  $("#musicBtn").textContent = t(musicOn ? "music_on" : "music_off");
  $("#musicBtn").setAttribute("aria-pressed", String(musicOn));
}

// 消音スイッチを無視して鳴らせる状態にする。最初のタップで一度だけ効かせる。
// audioSession が使えるならそれで済ませる。無音ループは再生中の表示が
// コントロールセンターに出てしまうので、古い iOS のときだけの手段にする
function enablePlaybackAudio(){
  try {
    if (navigator.audioSession) { navigator.audioSession.type = "playback"; return; }
  } catch (e) {}
  // play() は Promise を返さない実装もある（古い Safari、jsdom）。
  // 返り値をそのまま .catch すると、そこで例外になって解錠が止まる。
  const play = el => { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };
  if (silentEl) { if (silentEl.paused) play(silentEl); return; }
  silentEl = new Audio(SILENT_WAV);
  silentEl.loop = true;
  silentEl.volume = 1;          // muted や volume=0 では playback に切り替わらない
  play(silentEl);
}

function audio(){
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume().catch(() => armGestureResume());
  // 復帰の合図を取り逃していても、無音ループが止まっていれば掛け直す。
  // これが止まったままだと、iOS では鳴っているつもりで無音になる。
  if ((soundOn || musicOn) && silentEl && silentEl.paused) enablePlaybackAudio();
  return actx;
}

// 最初のタップ/キー操作で解錠する。iOS はユーザー操作の中でしか受け付けない
function unlockAudio(){
  if ((!soundOn && !musicOn) || !mode) return;
  try {
    enablePlaybackAudio();
    const c = audio();
    audioUnlocked = true;
    // 無音を一発鳴らして、実際に音の出せる状態かを確定させる
    try {
      const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) {}
    syncMusic();
  } catch (e) {}  // WebAudioが無い環境でも、ことばのゲームは遊べる。
}
["pointerdown", "touchstart", "keydown"].forEach(ev =>
  addEventListener(ev, unlockAudio, {once: true, passive: true}));

/* ホーム画面へ回してから戻ると、iOS では音が戻らないことがある。
 * 原因は2つ重なる。
 *   ・AudioContext がバックグラウンドで suspended になり、戻っても
 *     ユーザーの操作なしの resume() は拒否されることがある
 *   ・playback 扱いを保っていた無音ループが止まり、これも操作なしでは
 *     再生し直せない。止まったままだと WebAudio は鳴っているつもりで無音になる
 * どちらも「次に画面へ触れたとき」に必ずやり直せば直る。resume を試し、
 * 400ms 後にまだ止まっていれば、次の操作を待って掛け直す。 */
let waitingForGesture = false;
function armGestureResume(){
  if (waitingForGesture) return;
  waitingForGesture = true;
  const onGesture = () => {
    waitingForGesture = false;
    ["pointerdown", "touchstart", "keydown"].forEach(ev => removeEventListener(ev, onGesture));
    resumeAudio();
  };
  ["pointerdown", "touchstart", "keydown"].forEach(ev =>
    addEventListener(ev, onGesture, {passive: true}));
}
function resumeAudio(){
  if ((!soundOn && !musicOn) || !mode || document.hidden || audioPageHidden || !audioUnlocked) return;
  enablePlaybackAudio();
  if (!actx) return;
  if (actx.state === "suspended") actx.resume().catch(() => armGestureResume());
  syncMusic();
  setTimeout(() => {
    if (!actx) return;
    if (actx.state === "suspended" || (silentEl && silentEl.paused)) armGestureResume();
  }, 400);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resumeAudio();
  else {
    if (musicPlayer) musicPlayer.stop();
    if (silentEl) silentEl.pause();
  }
});
// ホーム画面から戻したときは visibilitychange が来ないことがある
addEventListener("pageshow", () => { audioPageHidden = false; resumeAudio(); });
addEventListener("focus", resumeAudio);
// 離れるときに無音ループを止めておく（バックグラウンドで鳴り続けないように）
addEventListener("pagehide", () => {
  audioPageHidden = true;
  if (musicPlayer) musicPlayer.stop();
  if (silentEl) silentEl.pause();
});
function tone(freq, {dur = .14, type = "triangle", vol = .06, at = 0, glide = 0} = {}){
  if (!soundOn) return;
  try {
    const c = audio(), t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + .03);
  } catch (e) {}
}
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
// ロゴの色。こども版の粒や光に使う
const KIDS_COLORS = ["#ffd42a", "#ff8a1f", "#38a9ea", "#8ac93a", "#f2789f", "#fff3cf"];

function sfxCorrect(n){
  const semi = SCALE[Math.min(n - 1, SCALE.length - 1)];
  const f = 440 * Math.pow(2, semi / 12);
  if (mode === "kids") {
    // 鉄琴のように、澄んだ音を重ねて長めに響かせる
    tone(f * 2, {type: "sine", vol: .075, dur: .5});
    tone(f * 3, {type: "sine", vol: .03, dur: .42, at: .05});
    tone(f * 4, {type: "sine", vol: .016, dur: .3, at: .1});
    return;
  }
  tone(f, {type: "triangle", vol: .07, dur: .13});
  tone(f * 2, {type: "sine", vol: .028, dur: .2, at: .02});
  if (isFever()) tone(f * 3, {type: "sine", vol: .02, dur: .26, at: .05});
}
function sfxWrong(){
  if (mode === "kids") {
    // 「ぽよん」と下がるだけにする。責められている音にしない
    tone(430, {type: "sine", vol: .07, dur: .26, glide: 170});
    tone(215, {type: "triangle", vol: .03, dur: .3, at: .05, glide: 120});
    return;
  }
  tone(190, {type: "sawtooth", vol: .07, dur: .3, glide: 70});
  tone(95, {type: "square", vol: .045, dur: .32});
}
function sfxClear(){ [0, 4, 7, 12].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), {type: "triangle", vol: .07, dur: .45, at: i * .075})); }
// ラウンドクリア用。ステージクリアより軽いが、駆け上がって和音で締める
function sfxClearFanfare(){
  const base = 523.25;
  [0, 4, 7, 12].forEach((semi, i) => {
    const f = base * Math.pow(2, semi / 12);
    tone(f, {type: "triangle", vol: .07, dur: .22, at: i * .085});
    tone(f * 2, {type: "sine", vol: .026, dur: .2, at: i * .085 + .01});
  });
  [0, 4, 7].forEach((semi, i) =>
    tone(base * 2 * Math.pow(2, semi / 12), {type: "sine", vol: .04, dur: .8, at: .36 + i * .02}));
}
// GREAT の音。クリアより高く駆け上がり、和音を伸ばして締める
function sfxGreat(){
  const base = 523.25;
  [0, 4, 7, 12, 16].forEach((semi, i) => {
    const f = base * Math.pow(2, semi / 12);
    tone(f, {type: "triangle", vol: .075, dur: .2, at: i * .07});
    tone(f * 2, {type: "sine", vol: .028, dur: .18, at: i * .07 + .01});
  });
  [0, 4, 7, 12].forEach((semi, i) =>
    tone(base * 2 * Math.pow(2, semi / 12), {type: "sine", vol: .04, dur: 1, at: .38 + i * .02}));
}
// PERFECT の音。駆け上がったあと、上でもう一度きらめかせる
function sfxPerfectFanfare(){
  const base = 523.25;
  [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => {
    const f = base * Math.pow(2, semi / 12);
    tone(f, {type: "triangle", vol: .075, dur: .22, at: i * .065});
    tone(f * 2, {type: "sine", vol: .026, dur: .2, at: i * .065 + .01});
  });
  [0, 4, 7, 12].forEach((semi, i) =>
    tone(base * 2 * Math.pow(2, semi / 12), {type: "sine", vol: .045, dur: 1.3, at: .5 + i * .02}));
  [24, 28, 31].forEach((semi, i) =>
    tone(base * Math.pow(2, semi / 12), {type: "sine", vol: .03, dur: .5, at: .78 + i * .09}));
}
function sfxPerfect(){ [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), {type: "triangle", vol: .07, dur: .6, at: i * .085})); }
function sfxHint(){ tone(880, {type: "sine", vol: .05, dur: .1}); tone(660, {type: "sine", vol: .05, dur: .14, at: .09}); }
function buzz(ms){ if (soundOn && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

function floatText(text, el, cls){
  const r = el ? el.getBoundingClientRect() : {left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0};
  const d = document.createElement("div");
  d.className = "floatText " + (cls || "");
  d.textContent = text;
  d.style.left = (r.left + r.width / 2) + "px";
  d.style.top = (r.top + r.height / 2) + "px";
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}
/* ステージクリア用の紙吹雪。画面の上から落として、通り過ぎたら片づける */
function confetti(count, colors, ms = 2600){
  const fx = $("#fx");
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.className = "confetti";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dur", (1.4 + Math.random() * 1.4).toFixed(2) + "s");
    p.style.setProperty("--delay", (Math.random() * .9).toFixed(2) + "s");
    p.style.setProperty("--sway", (Math.random() * 120 - 60).toFixed(0) + "px");
    p.style.setProperty("--spin", (Math.random() * 900 - 450).toFixed(0) + "deg");
    if (i % 3 === 0) p.style.borderRadius = "50%";
    fx.appendChild(p);
    setTimeout(() => p.remove(), ms);
  }
}

// 「タタタ・ターン」の短いファンファーレ。和音を重ねて厚くする
function sfxFanfare(){
  const base = 523.25;                       // ド
  const mel = [[0, 0], [0, .12], [0, .24], [7, .38], [12, .62]];
  mel.forEach(([semi, at], i) => {
    const f = base * Math.pow(2, semi / 12);
    tone(f, {type: "triangle", vol: .075, dur: i === mel.length - 1 ? .9 : .18, at});
    tone(f * 2, {type: "sine", vol: .03, dur: i === mel.length - 1 ? .9 : .16, at: at + .01});
  });
  [0, 4, 7, 12].forEach((semi, i) =>            // 最後に和音を伸ばす
    tone(base * Math.pow(2, semi / 12), {type: "sine", vol: .045, dur: 1.1, at: .62 + i * .02}));
}

function particles(el, count, colors){
  const fx = $("#fx");
  const r = el ? el.getBoundingClientRect() : {left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0};
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.className = "particle";
    const ang = (Math.PI * 2 * i) / count + Math.random() * .5;
    const dist = 40 + Math.random() * 110;
    p.style.left = cx + "px";
    p.style.top = cy + "px";
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    p.style.setProperty("--dy", (Math.sin(ang) * dist + 40) + "px");
    p.style.setProperty("--rot", Math.round(Math.random() * 540 - 270) + "deg");
    p.style.setProperty("--dur", (.7 + Math.random() * .5) + "s");
    fx.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}
function shake(){
  appEl.classList.remove("shake"); void appEl.offsetWidth; appEl.classList.add("shake");
  const d = $("#damage");
  d.classList.remove("hit"); void d.offsetWidth; d.classList.add("hit");
  setTimeout(() => appEl.classList.remove("shake"), 420);
}

let burstTimer = 0;
/* 祝いの画面に出す選択。まだ探せる語が残っているときだけ「続ける」を出す。
   全部見つけたあとに「続ける」を出しても、押しても何もできないため。 */
function roundActions(){
  const acts = [];
  const s = state();
  if (s.perfect) {
    const n = current().answers.length;
    const closing = pickFrom(CLOSING_I18N, CLOSING_I18N.ja);
    const brag = t("share_perfect", {puzzle: puzzleLines(), n, closing});
    acts.push({label: t("share_x"), keepOpen: true,
      run: () => window.open(xIntent(brag), "_blank", "noopener")});
  }
  const more = !roundLocked() && moreToEarn();
  if (more) {
    const goal = !s.great ? "GREAT" : (canPerfect() ? "PERFECT" : "");
    acts.push({label: goal ? t("continue_goal", {goal}) : t("continue_plain")});
  }
  // ここで一区切り。残りの数は戻った先の一覧に出るので、ボタンは短くする
  acts.push({label: t("finish"), primary: true, run: nextRound});
  return acts;
}
function showBurst({mark, word, sub, meaning, bonus, dim, gold, long, char, actions, tier, reach, ms = 900}){
  const box = $("#burst");
  clearTimeout(burstTimer);
  const bc = $("#burstChar");
  bc.hidden = !char;
  if (char) { bc.src = `img/maru-${char}.png`; bc.style.animation = "none"; void bc.offsetWidth; bc.style.animation = ""; }
  $("#burstMark").textContent = mark || "";
  $("#burstWord").textContent = word || "";
  $("#burstSub").textContent = sub || "";
  $("#burstMeaning").textContent = meaning || "";
  $("#burstBonus").textContent = bonus || "";
  const acts = $("#burstActions");
  acts.className = "burstActions";
  acts.innerHTML = "";
  const hasActions = actions && actions.length;
  box.className = "burst" + (dim ? " dim" : "") + (gold ? " gold" : "") + (long ? " long" : "") +
    (reach ? " reach" : "") + (tier ? " c" + tier : "") + (hasActions ? " hasActions" : "");
  $("#burstInner").className = "burstInner" + (long ? " long" : "") + (hasActions ? " hold" : "");
  void box.offsetWidth;
  box.classList.add("show");

  if (!hasActions) {
    burstTimer = setTimeout(() => box.classList.remove("show"), ms);
    return;
  }
  // 祝いが済んでからボタンを出す。演出はそのまま残す。
  for (const a of actions) {
    const b = document.createElement("button");
    b.className = "btn" + (a.primary ? " primary" : "");
    b.textContent = a.label;
    b.addEventListener("click", () => { if (!a.keepOpen) hideBurst(); if (a.run) a.run(); });
    acts.appendChild(b);
  }
  // 選ぶボタンがあるときは、外側を押しても閉じない。気づかないうちに
  // 消えてしまい、何を選んだのか分からなくなるため。必ずどれかを押させる。
  box.onclick = null;
  burstTimer = setTimeout(() => acts.classList.add("show"), ms);
}
function hideBurst(){
  clearTimeout(burstTimer);
  const box = $("#burst");
  box.onclick = null;
  box.classList.remove("show", "hasActions");
  $("#burstActions").className = "burstActions";
}

/* --- ひらがな棒人間：進捗バーの上を歩き、ゴール旗（クリア地点）を目指す --- */
const mascotEl = $("#mascot"), mRigEl = $("#mRig"), mHeadEl = $("#mHead"), mCharEl = $("#mChar"),
      goalGreatEl = $("#goalGreat"), goalPerfectEl = $("#goalPerfect"),
      mBubbleEl = $("#mBubble"), goalEl = $("#goal");
const trackPos = ratio => (4 + Math.max(0, Math.min(1, ratio)) * 92) + "%";
let mascotLeft = null, mascotWalkTimer = 0, mascotPoseTimer = 0, mBubbleTimer = 0;

function mascotSay(text, kind, ms = 1200){
  clearTimeout(mBubbleTimer);
  mBubbleEl.textContent = text;
  mBubbleEl.className = "mBubble show" + (kind ? " " + kind : "");
  mBubbleTimer = setTimeout(() => mBubbleEl.classList.remove("show"), ms);
}
// 姿勢は mRig に当てる（横位置の translate と競合させないため）
// 棒人間のポーズ名を、キャラクターの絵に読み替える
const CHAR_POSE = {cheer: "cheer", spin: "good", down: "idle"};
function setChar(pose, force){
  if (!mCharEl) return;
  const aim = mCharEl.classList.contains("aim") ? " aim" : "";
  const want = "mChar is-" + pose + aim;
  if (!force && mCharEl.className === want) return;
  mCharEl.className = "mChar";
  void mCharEl.offsetWidth;   // 同じポーズを続けて出しても動きが再生されるように
  mCharEl.className = want;
}
/* 動いていないときの顔。終わったラウンドで「？」のままだと、
   やり遂げた直後なのに困っているように見えるため、段に応じて変える。 */
function restPose(){
  const s = state();
  if (s.perfect || roundExhaustedAll()) return "good";
  if (s.great || s.cleared) return "cheer";
  return "idle";
}
function mascotPose(cls, ms){
  clearTimeout(mascotPoseTimer);
  mRigEl.classList.remove("cheer", "down", "spin");
  void mRigEl.offsetWidth;
  if (!cls) { setChar(restPose(), true); return; }
  mRigEl.classList.add(cls);
  setChar(CHAR_POSE[cls] || "idle", true);
  mascotPoseTimer = setTimeout(() => {
    mRigEl.classList.remove(cls);
    setChar(mascotEl.classList.contains("walking") ? "run" : restPose(), true);
  }, ms);
}
// 棒人間の頭は常にひらがな1文字。待機中は「の」、狙っているときはそのかな
function mascotHead(text){
  mHeadEl.textContent = text || "の";
  mHeadEl.classList.toggle("aim", !!text);
  if (mCharEl) mCharEl.classList.toggle("aim", !!text);
}

function updateMascot(){
  const total = current().answers.length;
  const ratio = state().discovered.size / total;
  const left = trackPos(ratio);
  const found = state().discovered.size;
  goalEl.style.left = trackPos(clearTarget() / total);
  goalEl.classList.toggle("reached", state().cleared);
  // GREAT と PERFECT の旗も立てる。どこまで行けばよいかが道の上で分かる。
  goalGreatEl.style.left = trackPos(greatTarget() / total);
  goalGreatEl.classList.toggle("reached", found >= greatTarget());
  goalPerfectEl.hidden = !canPerfect() || greatTarget() >= total;
  goalPerfectEl.style.left = trackPos(1);
  goalPerfectEl.classList.toggle("reached", found >= total);
  mascotEl.classList.toggle("fever", isFever());
  if (left !== mascotLeft) {
    const moving = mascotLeft !== null;
    mascotLeft = left;
    mascotEl.style.left = left;
    mBubbleEl.style.left = left;
    if (moving) {
      mascotEl.classList.add("walking");
      if (!mRigEl.classList.contains("cheer") && !mRigEl.classList.contains("spin")) setChar("run");
      clearTimeout(mascotWalkTimer);
      mascotWalkTimer = setTimeout(() => {
        mascotEl.classList.remove("walking");
        if (!mRigEl.className.includes("cheer") && !mRigEl.className.includes("spin")) setChar(restPose());
      }, 520);
    }
    return;
  }
  // 歩いていないときは、いまの段に合った顔にしておく（ラウンドを開き直した
  // ときや、読み込み直したときにも合うように）
  if (!mascotEl.classList.contains("walking") &&
      !mRigEl.className.includes("cheer") && !mRigEl.className.includes("spin")) {
    setChar(restPose());
  }
}

/* --- 押したかなが〇へ飛ぶ。正解なら合体、不正解なら弾き返される --- */
function holeKanaList(kana){
  return [...current().template].filter(ch => ch === "○" || ch === "〇")
    .map(ch => ch === "〇" ? voicedKana(kana) : kana);
}
let patternHoldToken = 0;
function throwKana(kana, btn, ok){
  const holes = [...document.querySelectorAll("#pattern .hole")];
  if (!btn || !holes.length) return;
  const chars = holeKanaList(kana);
  const b = btn.getBoundingClientRect();
  const token = ++patternHoldToken;

  holes.forEach((hole, i) => {
    const h = hole.getBoundingClientRect();
    const from = {x: b.left + b.width / 2, y: b.top + b.height / 2};
    const dx = h.left + h.width / 2 - from.x;
    const dy = h.top + h.height / 2 - from.y;

    const el = document.createElement("div");
    el.className = "thrown" + (ok ? "" : " ng");
    el.textContent = chars[i] || kana;
    el.style.left = from.x + "px";
    el.style.top = from.y + "px";
    document.body.appendChild(el);

    const flyMs = 240 + i * 70;
    const land = () => {
      if (token !== patternHoldToken) { el.remove(); return; }
      // 着弾リング
      const ring = document.createElement("div");
      ring.className = "ring" + (ok ? "" : " ng");
      ring.style.left = (h.left + h.width / 2) + "px";
      ring.style.top = (h.top + h.height / 2) + "px";
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 520);

      if (ok) {
        // 合体：穴が埋まってことばが完成する
        hole.textContent = chars[i] || kana;
        hole.classList.add("filled", "merge");
        el.remove();
        particles(hole, 8, ["#fff", "#ddd"]);
        if (i === holes.length - 1) {
          setTimeout(() => { if (token === patternHoldToken) renderPattern(); }, 950);
        }
      } else {
        // 弾かれる：跳ね返って回転しながら落ちる
        hole.classList.add("reject");
        setTimeout(() => hole.classList.remove("reject"), 460);
        const away = (i % 2 ? 1 : -1) * (70 + Math.random() * 60);
        if (el.animate) {
          el.animate([
            {transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.3) rotate(0deg)`, opacity: 1},
            {transform: `translate(calc(-50% + ${dx + away}px), calc(-50% + ${dy - 30}px)) scale(1) rotate(${away}deg)`, opacity: 1, offset: .45},
            {transform: `translate(calc(-50% + ${dx + away * 1.6}px), calc(-50% + ${dy + 180}px)) scale(.7) rotate(${away * 3}deg)`, opacity: 0}
          ], {duration: 640, easing: "cubic-bezier(.3,.2,.6,1)", fill: "forwards"}).onfinish = () => el.remove();
        } else {
          el.remove();
        }
      }
    };

    if (el.animate) {
      el.animate([
        {transform: "translate(-50%,-50%) scale(.7) rotate(0deg)", opacity: .2},
        {transform: `translate(calc(-50% + ${dx * .5}px), calc(-50% + ${dy * .5 - 46}px)) scale(1.9) rotate(-160deg)`, opacity: 1, offset: .55},
        {transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.3) rotate(-360deg)`, opacity: 1}
      ], {duration: flyMs, easing: "cubic-bezier(.25,.75,.35,1)", fill: "forwards"}).onfinish = land;
    } else {
      setTimeout(land, flyMs);
      setTimeout(() => el.remove(), flyMs + 700);
    }
  });
}

// はずしたあと、まだ残っている正解のかなを一瞬だけ光らせる（悔しさ演出）
function flashRemaining(){
  const amap = answerMap();
  const remaining = new Set();
  inputKanasForRound().forEach(k => {
    const w = fillWord(current(), k);
    if (amap.has(w) && !state().discovered.has(w) && !state().used.has(k)) remaining.add(k);
  });
  document.querySelectorAll(".kana").forEach(btn => {
    if (!remaining.has(btn.dataset.kana)) return;
    btn.classList.remove("flashLeft"); void btn.offsetWidth; btn.classList.add("flashLeft");
    setTimeout(() => btn.classList.remove("flashLeft"), 520);
  });
}

/* --------------------------------------------------------- 6) ゲーム進行 */
const GOOD_MSGS = ["いた。日本語にいた。", "正解。辞書がうなずいた。", "発見！〇が仕事をした。", "それ、あります。", "語彙力が静かに暴れている。", "辞書、ページをめくる音。", "〇が満たされました。", "よく出てきた、その語。"];
const BAD_MSGS = ["ない。★をいただきます。", "惜しい顔をしても、ないものはない。", "辞書：『存じません』", "その日本語、今回は未確認。", "〇に無茶をさせましたね。", "その並び、日本語の外にあります。", "〇が首をかしげています。", "字は合っている。語ではない。"];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
/* 言い回しの一覧は言語ごとに持つ。無い言語は落とし先へ、それも無ければ日本語。 */
function pickFrom(table, jaList){
  if (lang === "ja") return pick(jaList);
  const a = table[lang] || table[LANG_FALLBACK[lang]] || jaList;
  return pick(a);
}

function guess(kana){
  if (isSpecial() && !DAKUTEN_BASE_KANA.has(kana)) return;
  if (roundLocked() || state().used.has(kana)) return;

  state().used.add(kana);
  const word = fillWord(current(), kana);
  const amap = answerMap();
  const hit = amap.has(word);
  let pts = 0;
  atReach = false;

  if (hit) {
    const a = amap.get(word);
    const total = current().answers.length;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    pts = Math.round((BASE_POINT + COMBO_STEP * (combo - 1)) * (isFever() ? FEVER_MULT : 1));
    score += pts;

    state().found.add(word);
    state().discovered.add(word);
    lastFoundWord = word;

    $("#pattern").classList.remove("hit"); void $("#pattern").offsetWidth; $("#pattern").classList.add("hit");
    sfxCorrect(combo);
    buzz(18);
    flashAnswer(a, pick(GOOD_MSGS));

    const st0 = state();
    const willTop = canPerfect() ? st0.discovered.size >= total : st0.discovered.size >= greatTarget();
    if (!st0.cleared && st0.discovered.size >= clearTarget()) finishRound(willTop);
    else if (!willTop && !(!st0.great && st0.discovered.size >= greatTarget())) {
      const reach = reachGoal();
      atReach = !!reach;
      if (reach) { sfxReach(); buzz([25, 45, 25, 45, 30, 45, 110]); }
      showBurst({
        mark: reach ? t("reach_mark")
          : mode === "kids" || lang !== "ja"
            ? (combo >= 2 ? t("combo_n", {n: combo}) : t("correct"))
            : (combo >= 2 ? `COMBO ×${combo}` : "CORRECT"),
        word: answerDisplay(a),
        sub: (a.display && a.display !== a.word) ? a.word : "",
        bonus: reach ? t("reach_sub", {goal: reach}) : "",
        // コンボが伸びるほど字の色が上がる。5連続（FEVER）で金
        tier: isFever() ? 5 : combo >= 3 ? 3 : 0,
        reach: !!reach,
        long: true, ms: reach ? 1900 : 1400
      });
    }
    // クリアの上に GREAT、正解の多いラウンドだけ その上に PERFECT を置く
    if (!state().great && state().discovered.size >= greatTarget()) greatRound();
    if (canPerfect() && state().discovered.size >= total && !state().perfect) perfectRound();

  } else {
    combo = 0;
    stars--;
    popLostStar();
    sfxWrong(); buzz([25, 40, 25]); shake();
    // こども版では、外したときに作られた文字列をそのまま出さない。
    // 収録していない語（卑猥な並びを含む）が画面に出てしまうため。
    flashMiss(word);
  }

  saveProgress();
  render();

  // 演出は再描画のあとに付ける（render() でボタンが作り直されるため）
  const btn = document.querySelector(`.kana[data-kana="${kana}"]`);
  throwKana(kana, btn, hit);
  if (btn && hit && mode === "kids") particles(btn, 10, KIDS_COLORS);
  if (btn && hit) {
    btn.classList.add("pop");
    // リーチのときは点の数字を出さない。真ん中の煽りと重なって、どちらも読めなくなる
    if (!atReach) floatText(`+${pts}${combo >= 2 ? ` ×${combo}` : ""}`, btn, isFever() ? "gold" : "");
    particles(btn, isFever() ? 16 : 10, isFever() ? ["#7ef9d0", "#fff", "#ffd34d"] : ["#fff", "#bbb"]);
    if (!state().perfect) {
      mascotPose("cheer", 820);
      mascotSay(combo >= 3 ? t("combo_n", {n: combo}) : pickFrom(HIT_MSGS_I18N, HIT_MSGS_I18N.ja),
        isFever() ? "gold" : "", 1100);
    }
  } else if (btn) {
    btn.classList.add("shakeNo");
    floatText("★ −1", btn, "bad");
    mascotPose("down", 1520);
    mascotSay(t(stars <= 0 ? "m_dead" : "m_miss"), "bad", 1500);
  }
  if (!hit) {
    requestAnimationFrame(flashRemaining);
    if (stars <= 0) setTimeout(gameOver, 560);
  }
}

function finishRound(silent){
  const s = state();
  if (s.cleared) return;
  s.cleared = true;
  let bonus = "";
  if (!s.rewarded) {
    s.rewarded = true;
    stars++;
    score += CLEAR_BONUS;
    bonus = `★ +1　+${num(CLEAR_BONUS)}`;
  }
  saveProgress();
  if (!silent) {
    const colors = mode === "kids" ? KIDS_COLORS : ["#fff", "#ffd34d", "#bbb", "#7ef9d0"];
    sfxClearFanfare(); buzz([30, 50, 30]);
    mascotPose("cheer", 900);
    mascotSay(t("m_goal"), "gold", 2000);
    confetti(34, colors, 2200);
    setTimeout(() => {
      showBurst({mark: roundName(), word: "ROUND CLEAR",
      sub: t("words_found", {got: s.discovered.size, total: current().answers.length}),
        bonus, dim: true, long: true, char: "pose", actions: roundActions(), ms: 1600});
      particles(null, 36, colors);
    }, 320);
  }
}

function greatRound(){
  const s = state();
  s.great = true;
  let bonus = "";
  if (!s.greatRewarded) {
    s.greatRewarded = true;
    stars++;
    score += GREAT_BONUS;
    bonus = `★ +1　+${num(GREAT_BONUS)}`;
  }
  saveProgress();
  const colors = mode === "kids" ? KIDS_COLORS : ["#7ef9d0", "#fff", "#ffd34d", "#a8ffe6"];
  sfxGreat(); buzz([40, 60, 40, 60, 90]);
  mascotPose("cheer", 1100);
  mascotSay(t("m_great"), "gold", 2400);
  document.body.classList.add("celebrate");
  setTimeout(() => document.body.classList.remove("celebrate"), 1200);
  confetti(85, colors, 3000);
  setTimeout(() => {
    showBurst({mark: roundName(), word: "GREAT!!",
      sub: t("words_found", {got: s.discovered.size, total: current().answers.length}),
      bonus, dim: true, gold: true, long: true, char: "pose", actions: roundActions(), ms: 1900});
    particles(null, 54, colors);
    setTimeout(() => particles(null, 34, colors), 360);
    setTimeout(() => particles(null, 26, colors), 720);
  }, 340);
}

function perfectRound(){
  const s = state();
  s.perfect = true;
  let bonus = "";
  if (!s.perfectRewarded) {
    s.perfectRewarded = true;
    stars += 2;
    score += PERFECT_BONUS;
    bonus = `★ +2　+${num(PERFECT_BONUS)}`;
  }
  saveProgress();
  const colors = mode === "kids" ? KIDS_COLORS : ["#ffd34d", "#fff", "#7ef9d0", "#fff6c8", "#ffb347"];
  sfxPerfectFanfare(); buzz([50, 60, 50, 60, 50, 60, 140]);
  mascotPose("spin", 1320);
  mascotSay(t("m_perfect"), "gold", 2800);
  document.body.classList.add("celebrate", "strong");
  setTimeout(() => document.body.classList.remove("celebrate", "strong"), 1500);
  confetti(140, colors, 3800);
  const corner = (x, y) => ({getBoundingClientRect: () => ({left: x, top: y, width: 0, height: 0})});
  setTimeout(() => {
    showBurst({mark: roundName(), word: "PERFECT!!",
      sub: t("words_found_all", {total: current().answers.length}),
      bonus, dim: true, gold: true, long: true, char: "pose", actions: roundActions(), ms: 2200});
    particles(null, 70, colors);
    setTimeout(() => particles(corner(innerWidth * .2, innerHeight * .6), 40, colors), 260);
    setTimeout(() => particles(corner(innerWidth * .8, innerHeight * .6), 40, colors), 440);
    setTimeout(() => particles(null, 50, colors), 780);
    setTimeout(() => particles(null, 40, colors), 1150);
  }, 360);
}

function useHint(){
  if (roundLocked()) { flash("info", t("msg_round_over")); return; }
  const pool = current().answers.filter(a => {
    if (state().discovered.has(a.word)) return false;
    const k = kanaForWord(a.word);
    return k && !state().used.has(k);
  });
  if (!pool.length) { flash("info", t("msg_no_hint")); return; }
  if (score < HINT_COST()) { flash("bad", t("msg_need_score", {cost: HINT_COST(), score: num(score)})); return; }

  score -= HINT_COST();
  const a = pick(pool);
  const k = kanaForWord(a.word);
  const btn = document.querySelector(`.kana[data-kana="${k}"]`);
  if (btn) {
    btn.classList.add("hintGlow");
    if (HINT_COST()) floatText(`−${HINT_COST()}`, btn, "bad");
    setTimeout(() => btn.classList.remove("hintGlow"), mode === "kids" ? 6000 : 5000);
  }
  sfxHint();
  flash("info", t("msg_hint", {meaning: meaningOf(a)}));
  saveProgress();
  renderScore();
  closeModals();
}

// 降参・PERFECT で入力できなくなったラウンドを、もう一度遊べるように戻す。
// rewarded / perfectRewarded は残すので、★ボーナスの二重取りにはならない。
function retryRound(){
  const s = state();
  // 進行中のラウンドを消してしまわないよう確認する
  if (!roundLocked() && s.used.size > 0 &&
      !confirm("このラウンドの発見済みのことばを消して、最初からやり直しますか？")) return;
  s.found.clear(); s.discovered.clear(); s.used.clear();
  s.cleared = false; s.gaveUp = false; s.great = false; s.perfect = false;
  combo = 0;
  lastFoundWord = null;
  mascotEl.classList.add("noAnim");
  mascotLeft = null;
  saveProgress();
  closeModals();
  render();
  requestAnimationFrame(() => mascotEl.classList.remove("noAnim"));
  flash("info", s.rewarded ? t("msg_retry_done") : t("msg_retry"));
}

function giveUp(){
  if (state().cleared || state().gaveUp) return;
  state().gaveUp = true;
  combo = 0;
  current().answers.forEach(a => state().found.add(a.word));
  inputKanasForRound().forEach(k => state().used.add(k));
  flash("info", t("msg_revealed"));
  saveProgress();
  render();
  openAnswers();
}

/* ------------------------------------------------------------ ステージ進行 */
function currentStage(){ const si = STAGE_OF.get(roundIndex); return si === undefined ? 0 : si; }
function stageCleared(si){ return STAGES[si].every(i => roundStates[i].cleared); }
function stageDone(si){ return STAGES[si].filter(i => roundStates[i].cleared).length; }
function stageUnlocked(si){ return si === 0 || stageCleared(si - 1); }
// まだ開いていない先のステージに立たないよう、進める中でいちばん先を返す
function highestUnlocked(){
  let n = 0;
  while (n < STAGES.length - 1 && stageCleared(n)) n++;
  return n;
}

// ステージを越えたら★は満タンに戻す。1ステージが一区切りで、
// しくじってもそのステージだけやり直せばよい、という作りにする。
function finishStage(si){
  stars = 5;
  starsShown = -1;
  combo = 0;
  saveProgress();
  const colors = mode === "kids" ? KIDS_COLORS : ["#ffd34d", "#fff", "#7ef9d0", "#fff6c8", "#ff8a1f"];

  sfxFanfare();
  buzz([50, 60, 50, 60, 50, 60, 120]);
  document.body.classList.add("celebrate");
  setTimeout(() => document.body.classList.remove("celebrate"), 1200);

  // このステージにまだ探せる語が残っているときだけ「続ける」を出す
  const more = STAGES[si].some(moreToEarn);
  const perfectCountHere = STAGES[si].filter(i => roundStates[i].perfect).length;
  const acts = [];
  if (more) acts.push({label: t("continue_goal", {goal: "PERFECT"}), run: stayInStage});
  if (si < STAGES.length - 1) acts.push({
    label: t("dive_next", {name: stageName(si + 1), depth: depthText(si + 1)}),
    primary: true, run: goNextStage});
  const done = allCleared();
  if (done) acts.push({label: t("ending_open"), primary: true, run: showEnding});
  if (!acts.length) acts.push({label: t("see_list"), primary: true, run: stayInStage});

  showBurst({mark: `${stageName(si)}　${depthText(si)}`, word: done ? t("all_clear") : "STAGE CLEAR",
    sub: t("stage_clear_sub", {n: STAGES[si].length, p: perfectCountHere}),
    bonus: t("stars_restored"), dim: true, gold: true, long: true, char: "good",
    actions: acts, ms: 2000});

  confetti(110, colors, 3400);
  // 中央から一発、そのあと左右からも上げる
  particles(null, 60, colors);
  const corner = (x, y) => ({getBoundingClientRect: () => ({left: x, top: y, width: 0, height: 0})});
  setTimeout(() => particles(corner(innerWidth * .18, innerHeight * .62), 34, colors), 260);
  setTimeout(() => particles(corner(innerWidth * .82, innerHeight * .62), 34, colors), 460);
  setTimeout(() => particles(null, 40, colors), 760);
  setTimeout(() => { mascotPose("spin", 1320); mascotSay(t("m_stage"), "gold", 2200); }, 200);

  celebrated.add(si);
  saveProgress();
}

// ステージクリア画面の選択
function goNextStage(){
  const si = currentStage();
  const next = Math.min(si + 1, STAGES.length - 1);
  closeModals({force: true});
  hideBurst();
  if (next === si) { viewStage = si; openRoundList(); return; }
  travelTo(si, next);
}

/* ひとつ下の層へもぐる。ステージが変わったことを、数字ではなく
   「沈んでいく」動きで見せる。着いたらラウンド選択（層の一覧）に立つ。 */
// 潜るほど姿が変わる。こども版は装備が増え、最後まで元気なまま。
function diverImg(si){
  const t = si < 5 ? 1 : si < 10 ? 2 : si < 16 ? 3 : 4;
  return `img/maru-${mode === "kids" ? "kids" : "dive"}-${t}.png`;
}
function travelTo(from, to){
  const el = $("#travel");
  $(".tvChar").src = diverImg(to);
  $("#tvFrom").textContent = stageName(from);
  $("#tvFromName").textContent = stageName(from);
  $("#tvTo").textContent = stageName(to);
  $("#tvToName").textContent = stageName(to);
  $("#tvToNo").textContent = to + 1;
  $("#tvNote").textContent = t("travel_note");
  $("#tvDepth").textContent = depthText(from);

  // 先の層の1問目を選んでおく（一覧を閉じたらそこから遊べる）
  const first = STAGES[to].find(i => !roundStates[i].cleared);
  roundIndex = first === undefined ? STAGES[to][0] : first;
  viewStage = to;
  combo = 0;
  saveProgress();

  el.hidden = false;
  el.classList.remove("go");
  void el.offsetWidth;
  el.classList.add("go");
  sfxTravel();
  // 数え下ろしは幕を出してから。隠れているうちに始めると1回で止まる
  runDepthMeter(stageDepth(from), stageDepth(to));
  setTimeout(() => {
    el.hidden = true;
    el.classList.remove("go");
    render();
    openRoundList();
  }, 2300);
}
/* 深さの数字を、出発の層から着く層まで数え下ろす。落ちている感じは
   絵だけでは弱く、数字が動くほうが「深くなった」と伝わるため。 */
function runDepthMeter(d0, d1){
  const el = $("#tvDepth");
  if (!el) return;
  const dur = 1900;
  const t0 = Date.now();
  const step = () => {
    const t = Math.min(1, (Date.now() - t0) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = depthLabel(Math.round(d0 + (d1 - d0) * e));
    if (t < 1 && !$("#travel").hidden && typeof requestAnimationFrame === "function")
      requestAnimationFrame(step);
  };
  if (typeof requestAnimationFrame === "function") step();
  else el.textContent = depthLabel(d1);
}

/* リーチの音。半音ずつ上げて煽り、間をおいて開ける。
   当たりの音（sfxCorrect）と重なるので、音量は控えめにする。 */
function sfxReach(){
  for (let i = 0; i < 7; i++)
    tone(523.25 * Math.pow(2, i / 12), {type: "square", vol: .028, dur: .1, at: i * .07});
  [0, 4, 7, 12].forEach((semi, i) =>
    tone(1046.5 * Math.pow(2, semi / 12), {type: "sine", vol: .05, dur: .8, at: .62 + i * .04}));
}

// 沈んでいく音。音が下へ落ちて、着いたところで低く開ける
function sfxTravel(){
  [0, -2, -4, -5, -7].forEach((semi, i) =>
    tone(392 * Math.pow(2, semi / 12), {type: "sine", vol: .05, dur: .22, at: i * .3}));
  [0, 3, 7].forEach((semi, i) =>
    tone(196 * Math.pow(2, semi / 12), {type: "triangle", vol: .05, dur: 1.1, at: 1.55 + i * .03}));
}
function stayInStage(){
  closeModals({force: true});
  hideBurst();
  viewStage = currentStage();
  openRoundList();
}


function nextRound(){
  const si = currentStage();
  if (stageCleared(si)) {
    // 最後のステージも祝う。以前は「次の層が無い」を理由に飛ばしていて、
    // 3,661語を踏破しても何も起きなかった。
    if (celebrated.has(si)) { viewStage = si; openRoundList(); return; }
    finishStage(si);
    return;
  }
  // 勝手に次のラウンドを始めない。この層にあと何問残っているのかが
  // 見えないまま進んでしまい、どこまで来たのか分からなくなるため。
  // 一覧へ戻し、いま片づけた札が変わるのを見せて、次は自分で選ばせる。
  viewStage = si;
  openRoundList({ justCleared: roundIndex });
}

function selectRound(i){
  if (i < 0 || i >= ROUND_DATA.length) return;
  roundIndex = i;
  viewStage = currentStage();
  syncHash();
  combo = 0;
  lastFoundWord = null;
  flash("info", "");
  saveProgress();
  hideStart();
  closeModals({force: true});   // 一覧は data-persistent なので force で畳む
  // 棒人間は歩かずに新しいラウンドの位置へ立ち直す
  mascotEl.classList.add("noAnim");
  mascotLeft = null;
  mBubbleEl.classList.remove("show");
  render();
  requestAnimationFrame(() => mascotEl.classList.remove("noAnim"));
}

function gameOver(){
  // ★0 の直後に予約されるので、先にやり直してしまった場合は開かない
  if (stars > 0) return;
  const found = totalCorrectCount();
  // こども版のやさしい言い方は jaKids が持つ。外国語はどちらも同じ文言
  $("#gameoverTitle").textContent = mode === "kids" ? t("go_title") : "GAME OVER";
  $("#gameoverText").innerHTML = t("go_text", {n: currentStage() + 1, found});
  $("#goChar").src = "img/maru-think.png";
  $("#gScore").textContent = num(score);
  $("#gCombo").textContent = num(maxCombo);
  sfxGameOver();
  buzz([60, 80, 60]);
  openModal("#gameoverModal");
}
// 失敗の音。落ち込ませすぎないよう、下がって最後にひとつ持ち上げる
function sfxGameOver(){
  [0, -2, -5].forEach((semi, i) =>
    tone(392 * Math.pow(2, semi / 12), {type: "triangle", vol: .06, dur: .34, at: i * .17}));
  tone(261.63, {type: "sine", vol: .05, dur: .9, at: .5});
  tone(392, {type: "sine", vol: .035, dur: .8, at: .62});
}
// ★が尽きたときの再開。発見済みのことばもクリア済みの印もそのまま残す。
// せっかく見つけた語が消えると、やる気ごと折れてしまうため。
function revive(){
  stars = 5;
  combo = 0;
  starsShown = -1;
  closeModals({force: true});
  saveProgress();
  render();
  flash("info", t("msg_revived"));
}
function resetAll(skipConfirm){
  if (!skipConfirm && !confirm(t("confirm_reset"))) return;
  roundIndex = 0; stars = 5; score = 0; combo = 0; maxCombo = 0; scoreShown = 0; starsShown = -1;
  roundStates.forEach(s => {
    s.found.clear(); s.discovered.clear(); s.used.clear();
    s.cleared = s.rewarded = s.gaveUp = s.great = s.greatRewarded = s.perfect = s.perfectRewarded = false;
  });
  // 祝い済みの印も消す。残したままだと、やり直しても STAGE CLEAR が出ない
  celebrated.clear();
  viewStage = 0;
  clearSavedProgress();
  hideEnding({silent: true});
  closeModals({force: true});
  flash("info", "");
  render();
  openRoundList();
}

/* --------------------------------------------------- 7) モーダル/イベント */
function openModal(sel){
  closeModals({force: true});
  document.querySelector(sel).classList.add("show");
  syncMusic();
}
// data-persistent（ゲームオーバー画面）は背景タップや Esc では閉じない。
// 閉じられると★0のまま操作できない盤面だけが残ってしまうため。
function closeModals(opts){
  let hadList = false;
  document.querySelectorAll(".modal.show").forEach(m => {
    if (!(opts && opts.force) && m.hasAttribute("data-persistent")) return;
    if (m.id === "roundModal") hadList = true;
    m.classList.remove("show");
  });
  // 一覧を閉じたら盤面に戻る。URL もそこを指しておかないと、
  // 読み込み直したときに別の画面が開いてしまう。
  // スタート画面の上に重ねていたときは、戻る先はスタート画面。
  if (hadList) {
    if ($("#startGate").hidden) { viewStage = currentStage(); syncHash(); }
    else syncHashStart();
  }
  syncMusic();
}

let viewStage = 0;
let celebrated = new Set();   // 祝い終えたステージ

/* いま開いている層を、氷山の真ん中に置く。端に寄っていると、上下の層が
   見えず、どこまで潜ったのか分からないため。
   モーダルを出したあとに測る（display:none のあいだは高さが 0 で、
   scrollIntoView も位置の計算もできない）。 */
function centerStageStrip(){
  const strip = $("#stageStrip");
  if (!strip) return;
  const go = () => {
    const el = strip.querySelector(".stageStop.on");
    if (!el || !strip.clientHeight || !el.getBoundingClientRect) return;
    // 位置は実測の差で出す。offsetTop は基準になる親が氷山とは限らず、ずれるため
    const sr = strip.getBoundingClientRect(), er = el.getBoundingClientRect();
    const delta = (er.top + er.height / 2) - (sr.top + sr.height / 2);
    const max = strip.scrollHeight - strip.clientHeight;
    strip.scrollTop = Math.max(0, Math.min(strip.scrollTop + delta, max));
  };
  go();
  // 開いた直後は幅がまだ確定していないことがあるので、描画後にもう一度
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
}

/* いまどの画面にいるかを URL に持たせる。読み込み直しても同じ場所へ戻る。
 *   （無し）           スタート画面
 *   #s6                6層目の一覧
 *   #s6&r=〇んかい      そのラウンドの盤面
 * ラウンドはテンプレートで指す（添字はモードや語の増減でずれるが、
 * テンプレートは変わらないため）。 */
function setHash(h){
  try { history.replaceState(null, "", location.pathname + location.search + h); } catch (e) {}
}
function syncHash(){
  const r = ROUND_DATA[roundIndex];
  setHash(`#s${viewStage + 1}` + (r ? "&r=" + encodeURIComponent(r.template) : ""));
}
function syncHashList(){ setHash(`#s${viewStage + 1}`); }
function syncHashStart(){ setHash(""); }

/* URL の指す場所を返す。"play" | "list" | "start" */
function applyHash(){
  const m = /#s(\d+)(?:&r=([^&]*))?/.exec(location.hash);
  if (!m) return "start";
  viewStage = Math.min(Math.max(0, Number(m[1]) - 1), STAGES.length - 1);
  if (!stageUnlocked(viewStage)) { viewStage = currentStage(); return "start"; }
  if (!m[2]) return "list";
  const i = ROUND_DATA.findIndex(r => r.template === decodeURIComponent(m[2]));
  if (i < 0) return "list";
  const si = STAGE_OF.get(i);
  if (si === undefined || !stageUnlocked(si)) return "start";   // 施錠中には飛ばさない
  // 済んだラウンドの盤面へ戻しても、押せるかなが無くて手が止まる。
  // ひと区切りついているので、スタート画面から選び直させる。
  if (roundStates[i].cleared || roundStates[i].gaveUp) { viewStage = si; return "start"; }
  roundIndex = i;
  viewStage = si;
  return "play";
}
/* opts.justCleared に札の番号を渡すと、その札が「クリアに変わる」演出をし、
   次にやる札を光らせる。クリアのたびにここへ戻ってくるので、
   何が片づいて何が残っているかを、この画面だけで分かるようにする。 */
function openRoundList(opts){
  const just = opts && opts.justCleared != null ? opts.justCleared : null;
  if (viewStage < 0 || viewStage >= STAGES.length) viewStage = currentStage();
  syncHashList();
  // ステージ選びは、縦に積んだ氷山にする。番号の羅列だと、どこまで来たのかが
  // 数字でしか分からず味気ないため。深いほど水が濃くなり、正解の少ない
  // ラウンドが並ぶ。いまいる層にはキャラクターが浮かぶ。
  const here = currentStage();
  const strip = STAGES.map((rounds, si) => {
    const done = stageDone(si), all = rounds.length;
    const open = stageUnlocked(si);
    const cls = [
      si === viewStage ? "on" : "",
      !open ? "locked" : "",
      stageCleared(si) ? "done" : "",
      si === here ? "here" : ""
    ].join(" ");
    const cleared = stageCleared(si);
    const face = cleared ? "★" : open ? si + 1 : "";
    // 層の名前はクリアしても消さない。どこまで潜ってきたかが分かるように。
    // まだ開いていない層も、おとな版は名前を出す（この先の深さが見える）。
    // こども版だけ「？」にして、着くまでの楽しみを残す。
    const foot = open || mode !== "kids" ? stageName(si) : "？";
    return `<button class="stageStop ${cls}" data-stage="${si}" title="ステージ ${si + 1}　${depthText(si)}">
      ${si === here ? `<img class="stopChar" src="${diverImg(si)}" alt="">` : ""}
      <span class="stopDepth">${depthText(si)}</span>
      <span class="stopDot"><b>${face}</b></span>
      <span class="stopText"><small>${foot}</small><em class="stopClear">CLEAR</em></span>
    </button>`;
  }).join("") + `<div class="stageGoal"><small>${t("goal_bottom")}</small></div>`;

  const rounds = STAGES[viewStage];
  const locked = !stageUnlocked(viewStage);
  // 片づけた直後だけ、次にやる札を光らせる。常に光らせると、
  // 自分で選ぶ画面なのに一つだけ勧められているように見えるため。
  const nextPick = just != null ? rounds.find(i => !roundStates[i].cleared) : undefined;
  const restCount = rounds.filter(i => !roundStates[i].cleared).length;
  // こども版は、お題と進み具合だけを見せる。数字と説明を減らして、
  // 何をすればいいかが一目で分かるようにする。
  const list = rounds.map((i, n) => {
    const r = ROUND_DATA[i], st = roundStates[i];
    const total = r.answers.length, target = clearTarget(r);
    // いま片づけた札だけは、クリアの見た目をまだ着せない。黒いまま出して、
    // 一覧が開いたあとに白へ変える。変わる瞬間が見えないと、何が起きたのか
    // 分からないため。着せる予定の見た目は data-stamp に持たせておく。
    const stampCls = st.perfect ? "perfect" : st.great ? "great" : st.cleared ? "cleared" : "";
    const cls = `${i === just ? "" : stampCls + " "}` +
      `${i === roundIndex ? "current " : ""}${i === just ? "justCleared " : i === nextPick ? "nextPick" : ""}`;
    const stampAttr = i === just ? ` data-stamp="${stampCls}"` : "";
    const pct = Math.min(100, st.discovered.size / total * 100);

    if (mode === "kids") {
      const mark = st.perfect ? '<span class="rcMark done gold">★</span>'
        : st.great ? '<span class="rcMark done great">★</span>'
        : st.cleared ? '<span class="rcMark done">★</span>'
        : st.gaveUp ? '<span class="rcMark">…</span>'
        : `<span class="rcMark">${n + 1}</span>`;   // 数字は訳さない
      return `<button class="roundChoice kid ${cls}" data-round="${i}"${stampAttr} ${locked ? "disabled" : ""}>
        ${mark}
        <div class="rcPattern">${templateHTML(r.template)}</div>
        <div class="rcBar"><i style="width:${pct}%"></i></div>
      </button>`;
    }

    const badge = st.perfect ? '<span class="badge gold">PERFECT</span>'
      : st.great ? '<span class="badge greatBadge">GREAT</span>'
      : st.cleared ? `<span class="badge">${t("badge_clear")}</span>`
      : st.gaveUp ? `<span class="badge">${t("badge_gaveup")}</span>`
      : `<span class="badge">${st.discovered.size}/${target}</span>`;
    return `<button class="roundChoice ${cls}" data-round="${i}"${stampAttr} ${locked ? "disabled" : ""}>
      <div class="rcTop"><span>${roundName(i)}</span>${badge}</div>
      <div class="rcPattern">${templateHTML(r.template)}</div>
      <div class="rcMeta">${t("list_words", {n: total})}</div>
      <div class="rcBar"><i style="width:${pct}%"></i></div>
    </button>`;
  }).join("");

  const head = locked
    ? `<div class="lockNote">
         <span class="lockMark" aria-hidden="true"></span>
         <b>${t("lock_title")}</b>
         <small>${t("lock_note", {name: stageName(viewStage - 1), depth: depthText(viewStage - 1)})}</small>
       </div>`
    // 長い説明は、その層に初めて来たときだけ。クリアのたびに
    // ここへ戻ってくるので、毎回読ませると邪魔になる。
    : mode === "kids" || restCount < rounds.length
      ? ""
      : `<div class="stageNote">${t("stage_note", {n: rounds.length})}</div>`;

  $("#stageStrip").innerHTML =
    `<div class="stripInner" style="--water:${seaLevelRatio()}%;--keel:${keelRatio()}%">${strip}</div>`;
  // 数は下の「のこり N 問」に出るので、題は短く保つ（狭い画面で折り返すため）
  $("#stageTitle").textContent =
    `${t("stage_n", {n: viewStage + 1})}　${stageName(viewStage)}　${depthText(viewStage)}`;
  // この層にあと何問あるか。一覧へ戻ってくるたび、ここが目当てになる
  const progress = locked ? "" : `<div class="stageProgress">
      <b>${restCount ? t("list_remaining", {n: restCount}) : t("list_allclear")}</b>
      <span>${rounds.length - restCount} / ${rounds.length}</span>
    </div>`;
  $("#roundList").innerHTML = progress + head + list;
  $("#stageStrip").querySelectorAll(".stageStop").forEach(b =>
    b.addEventListener("click", () => { viewStage = Number(b.dataset.stage); openRoundList(); }));
  $("#roundList").querySelectorAll(".roundChoice").forEach(b =>
    b.addEventListener("click", () => selectRound(Number(b.dataset.round))));
  openModal("#roundModal");
  centerStageStrip();
  // 片づけた札を画面に入れ、ひと呼吸おいて白へ変える
  if (just != null) {
    const el = $(`#roundList .roundChoice[data-round="${just}"]`);
    try { if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); } catch (e) {}
    if (el) setTimeout(() => {
      if (el.dataset.stamp) el.classList.add(el.dataset.stamp);
      el.classList.add("stampIn");
      sfxStamp();
      buzz([25, 40, 70]);
    }, 420);
  }
}
// 札が白に変わるときの音。低く一発、そのうえに明るい点をひとつ
function sfxStamp(){
  tone(98, {type: "sine", vol: .08, dur: .28});
  tone(146.83, {type: "triangle", vol: .07, dur: .18});
  tone(1174.66, {type: "sine", vol: .05, dur: .32, at: .05});
}

function openAnswers(){
  const total = current().answers.length;
  $("#answerTitle").textContent = t("answers_title", {round: roundName()});
  $("#answerSub").textContent = t("answers_sub", {total, got: state().discovered.size});
  $("#answerList").innerHTML = current().answers.map(a => {
    const missed = !state().discovered.has(a.word);
    const reading = a.display && a.display !== a.word ? `<span class="reading">${esc(a.word)}</span>` : "";
    // 訳がまだ無い語は、日本語の語釈のまま辞書への道をそえる
    const look = hasTranslatedMeaning(a) ? ""
      : ` <a class="lookup" href="${lookupUrl(a)}" target="_blank" rel="noopener">↗</a>`;
    return `<div class="answerRow${missed ? " missed" : ""}">
      <div class="word">${esc(answerDisplay(a))}${reading}</div>
      <div class="meaning">${esc(meaningOf(a))}${look}</div>
    </div>`;
  }).join("");
  openModal("#answerModal");
}

function openMenu(){
  $("#mScore").textContent = num(score);
  $("#mCombo").textContent = num(maxCombo);
  $("#mFound").textContent = num(totalCorrectCount());
  $("#mCleared").textContent =
    `${groupClearedCount("main")}/${groupCount("main")}・${groupClearedCount("special")}/${groupCount("special")}・${groupClearedCount("word")}/${groupCount("word")}`;
  $("#menuRank").textContent = t("menu_rank", {rank: rankName(), n: perfectCount()});
  syncAudioButtons();
  openModal("#menuModal");
}

$("#roundListBtn").addEventListener("click", openRoundList);
$("#menuBtn").addEventListener("click", openMenu);
$("#nextBtn").addEventListener("click", nextRound);
$("#revealBtn").addEventListener("click", openAnswers);
$("#retryBtn").addEventListener("click", retryRound);
$("#reviveBarBtn").addEventListener("click", revive);
$("#mRetryBtn").addEventListener("click", retryRound);
$("#hintBtn").addEventListener("click", useHint);
$("#hintBtnM").addEventListener("click", useHint);
$("#giveupBtn").addEventListener("click", giveUp);
$("#giveupBtnM").addEventListener("click", giveUp);
$("#mHintBtn").addEventListener("click", useHint);
$("#mGiveupBtn").addEventListener("click", () => { closeModals(); giveUp(); });
$("#resetBtn").addEventListener("click", () => resetAll(false));
$("#gResetBtn").addEventListener("click", () => resetAll(false));
$("#reviveBtn").addEventListener("click", revive);
$("#gAnswerBtn").addEventListener("click", openAnswers);
$("#soundBtn").addEventListener("click", () => {
  soundOn = !soundOn;
  syncAudioButtons();
  if (soundOn) { unlockAudio(); resumeAudio(); sfxHint(); }
  else if (!musicOn && silentEl) silentEl.pause();
  saveProgress();
});
$("#musicBtn").addEventListener("click", () => {
  musicOn = !musicOn;
  syncAudioButtons();
  if (musicOn) unlockAudio();
  syncMusic();
  if (!musicOn && !soundOn && silentEl) silentEl.pause();
  saveProgress();
});

// 見つけたことばチップ → 意味を表示
$("#foundChips").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const a = answerMap().get(chip.dataset.word);
  // 当てたときと同じ見せ方にする（表記・読み・語釈）
  if (a) flashAnswer(a);
});

document.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", closeModals));
document.querySelectorAll(".modal").forEach(m => {
  m.addEventListener("click", e => { if (e.target === m) closeModals(); });
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeModals(); return; }
  if (document.querySelector(".modal.show")) return;
  if (e.key === "Enter" && (state().cleared || state().gaveUp)) { nextRound(); return; }
  if (inputKanasForRound().includes(e.key)) guess(e.key);
});

/* ------------------------------------------------------------ 8) 入り口 */
/* --------------------------------------------------- 20b) エンディング
 * 潜った層をたどりながら、見つけたことばが全部流れる。ただの一覧ではなく、
 * 氷の頂から底までの道のりを、自分の集めた語で読み返す形にする。
 * 流れは requestAnimationFrame で自前に動かす。CSS の animation では
 * 途中で速さを変えるたびに頭から流れ直してしまうため。 */
const ENDING_THANKS = ["@dora_todo", "@kurohetsuhotsu", "@zcATHh3SdI30403"];
let endTimer = 0, endSpeed = 1, endY = 0;

function endingHTML(){
  let found = 0, total = 0;
  ROUND_DATA.forEach((r, i) => { total += r.answers.length; found += roundStates[i].discovered.size; });
  const layers = STAGES.map((rounds, si) => {
    const words = [];
    for (const i of rounds) {
      const r = ROUND_DATA[i], st = roundStates[i];
      for (const a of r.answers) if (st.discovered.has(a.word)) words.push(answerDisplay(a));
    }
    if (!words.length) return "";
    return `<section class="endLayer">
      <h3>${esc(stageName(si))}<small>${esc(depthText(si))}</small></h3>
      <p>${words.map(w => `<span>${esc(w)}</span>`).join("")}</p>
    </section>`;
  }).join("");
  return `<div class="endHead">
      <img src="img/logo-hero.png" alt="" class="endLogo">
      <h2>${esc(t("ending_title"))}</h2>
      <p>${esc(t("ending_lead"))}</p>
    </div>
    ${layers}
    <div class="endStats">${t("ending_stats", {found: num(found), total: num(total), p: perfectCount()})}
      <br>SCORE ${num(score)}　・　MAX COMBO ${num(maxCombo)}　・　${esc(rankName())}</div>
    <div class="endThanks"><small>${esc(t("ending_thanks"))}</small>
      ${ENDING_THANKS.map(h => `<span>${esc(h)}</span>`).join("")}</div>
    <div class="endMade">Made by Jounlai Cho</div>
    <div class="endFin">${esc(t("ending_end"))}</div>
    <div class="endActions">
      <button class="btn primary" id="endShare">${esc(t("share_x"))}</button>
      <button class="btn" id="endRestart">${esc(t("restart_all"))}</button>
    </div>`;
}

function showEnding(){
  closeModals({force: true});
  hideBurst();
  hideStart();
  const roll = $("#endRoll");
  roll.innerHTML = endingHTML();
  $("#endSpeed").textContent = "×1";
  $("#endClose").textContent = t("ending_close");
  endSpeed = 1;
  $("#ending").hidden = false;
  syncMusic();
  const total = ROUND_DATA.reduce((n, r) => n + r.answers.length, 0);
  $("#endShare").addEventListener("click", () =>
    window.open(xIntent(t("share_ending", {total: num(total)})), "_blank", "noopener"));
  $("#endRestart").addEventListener("click", () => resetAll(false));
  // 画面の下から流し始める
  $("#endStage").classList.remove("flat");
  roll.style.transition = "";
  endY = $("#ending").clientHeight;
  roll.style.transform = `translateY(${endY}px)`;
  sfxFanfare();
  cancelAnimationFrame(endTimer);
  let last = 0;
  const step = now => {
    if (!last) last = now;
    const dt = Math.min(64, now - last); last = now;
    endY -= 120 * endSpeed * dt / 1000;         // 1秒に120px。全部で1分半ほど
    // 巻物の下端が画面の下端に来たら止める。endActions の下余白のぶん、
    // 「おわり」と共有ボタンが画面の中ほどに残る。
    const stop = Math.min(0, -(roll.scrollHeight - $("#ending").clientHeight));
    if (endY < stop) endY = stop;               // 最後は止めて、押せるようにする
    roll.style.transform = `translateY(${endY}px)`;
    // 終わりまで来たら板を起こす。寝かせたままだと、最後の札が遠くて押せない
    if (endY <= stop) $("#endStage").classList.add("flat");
    if (endY > stop && !$("#ending").hidden) endTimer = requestAnimationFrame(step);
  };
  if (typeof requestAnimationFrame === "function") endTimer = requestAnimationFrame(step);
}
function hideEnding(opts){
  cancelAnimationFrame(endTimer);
  $("#ending").hidden = true;
  syncMusic();
  // やり直しから呼ばれたときは、そのまま一覧へ進むのでホームは出さない
  if (!(opts && opts.silent)) showStart();
}
$("#endClose").addEventListener("click", hideEnding);
$("#endSpeed").addEventListener("click", () => {
  endSpeed = endSpeed >= 4 ? 1 : endSpeed * 2;
  $("#endSpeed").textContent = "×" + endSpeed;
});

/* ------------------------------------------------- 21) スタート画面 */
/* 開いてすぐ層の一覧が出ると、何の遊びなのか、自分がどこにいるのかが
   分からず戸惑う。まず立つ場所を作り、そこから前回の続きへ入る。
   共有された URL で来たときだけは、指されたラウンドへ直に入れる
   （何を見に来たかが決まっているので、間に画面を挟まない）。 */
function progressSummary(){
  let found = 0, total = 0, cleared = 0;
  ROUND_DATA.forEach((r, i) => { total += r.answers.length; found += roundStates[i].discovered.size; });
  STAGES.forEach((_, si) => { if (stageCleared(si)) cleared++; });
  return { found, total, cleared };
}
const comma = n => String(n).replace(/\B(?=(\d{3})+$)/g, ",");

function showStart(notice){
  const kids = mode === "kids";
  const si = currentStage();
  const sum = progressSummary();
  const fresh = sum.found === 0;

  $("#sgLead").innerHTML = t("home_lead");

  // 氷山そのものを小さく描き、そのどこにいるかを点で示す。
  // 「深いほど数が減る」という前提は、文字より絵のほうが早い。
  const berg = $("#sgBerg");
  if (berg && berg.style) {
    berg.style.setProperty("--water", seaLevelRatio() + "%");
    berg.style.setProperty("--keel", keelRatio() + "%");
    berg.style.setProperty("--you", (si + 0.5) / STAGES.length * 100 + "%");
  }
  $("#sgConcept").textContent = t("home_concept");

  // いまいる層を、深さとキャラクターの姿で見せる
  $("#sgChar").src = diverImg(si);
  $("#sgWhereLabel").textContent = t(fresh ? "home_here_fresh" : "home_here");
  $("#sgLayer").textContent = stageName(si);
  $("#sgDepth").textContent = depthText(si);

  const stats = $("#sgStats");
  stats.hidden = fresh;
  stats.innerHTML = fresh ? "" : t("home_stats", {
    found: comma(sum.found), total: comma(sum.total),
    cleared: sum.cleared, stages: STAGES.length});

  $("#sgStartLabel").textContent = t(fresh ? "home_start" : "home_continue");
  $("#sgStartSub").textContent = `${roundName()}　${templateText(current().template)}`;
  $("#sgListBtn").textContent = t("home_list");
  $("#sgMenuBtn").textContent = t("home_menu");

  // モードはここでも選べるようにする。⚙メニューの中だけだと見つからない
  $("#sgModes").querySelectorAll(".sgMode").forEach(b =>
    b.classList.toggle("on", b.dataset.mode === mode));
  $("#sgModeNote").textContent = t("home_modenote");
  $("#sgMode-kids").textContent = t("mode_kids");
  $("#sgMode-adult").textContent = t("mode_adult");
  // 語釈まで訳すと質を保てないので、日本語のままだと断っておく
  const ln = $("#sgLangNote");
  ln.textContent = t("home_langnote");
  ln.hidden = !ln.textContent;
  $("#sgLangSel").value = lang;

  // ゲーム名。ロゴは日本語なので、外国語では読める名前を添える
  const nm = $("#sgName");
  nm.textContent = t("game_name");
  nm.hidden = !nm.textContent;
  // 全部クリアした人だけ、エンディングの見直しと、はじめからのやり直しを出す
  $("#sgDone").hidden = !allCleared();
  $("#sgEndingBtn").textContent = t("ending_replay");
  $("#sgRestartBtn").textContent = t("restart_all");

  const note = $("#sgNote");
  note.hidden = !notice;
  note.textContent = notice || "";

  $("#startGate").hidden = false;
  syncHashStart();
  syncMusic();
}
function hideStart(){ $("#startGate").hidden = true; syncMusic(); }

$("#sgStartBtn").addEventListener("click", () => { hideStart(); render(); syncHash(); });
// 一覧とメニューは、スタート画面を伏せずにその上へ重ねる。伏せてしまうと、
// 閉じたときに戻る先が盤面になり、始めた覚えのないラウンドが出てくる。
$("#sgListBtn").addEventListener("click", () => { viewStage = currentStage(); openRoundList(); });
$("#sgMenuBtn").addEventListener("click", () => openModal("#menuModal"));
$("#sgEndingBtn").addEventListener("click", showEnding);
$("#sgRestartBtn").addEventListener("click", () => resetAll(false));
// ホーム（スタート画面）へ戻る道は3つ。ヘッダーのロゴ、一覧の戻り、⚙メニュー。
// 「START」とだけ書くとそれが何なのか分からないので、行き先の名前で書く。
// 遊んでいる最中に戻れないと、いまどこにいるのかを確かめる先が無くなる。
const goHome = () => { hideBurst(); showStart(); closeModals({force: true}); showStart(); };
$("#startPageBtn").addEventListener("click", goHome);
$("#homeBtn").addEventListener("click", goHome);
$("#listHomeBtn").addEventListener("click", goHome);

// モードを選ぶまでゲームは始めない。選び直すとページを読み込み直す。
// 盤面の語彙そのものが変わるので、途中から差し替えるより作り直すほうが確実。
function chooseMode(m){
  if (m === mode) return;          // いま遊んでいるほうを押しても、何も起きない
  try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  location.reload();
}
document.querySelectorAll("[data-mode]").forEach(b =>
  b.addEventListener("click", () => chooseMode(b.dataset.mode)));

/* 外国語で遊ぶ人の入り口。入り口の3枚目を押すと、札の並びが言語えらびに
   入れ替わる。言語を選んだ時点でおとな版として始める（こども版の
   やさしい言い換えは日本語にしか無いため）。 */
$("#mgWorldBtn").addEventListener("click", () => {
  $("#mgBtns").hidden = true;
  $("#mgLangs").hidden = false;
});
$("#mgLangBack").addEventListener("click", () => {
  $("#mgLangs").hidden = true;
  $("#mgBtns").hidden = false;
});
document.querySelectorAll("[data-lang]").forEach(b =>
  b.addEventListener("click", () => {
    try {
      localStorage.setItem(LANG_KEY, b.dataset.lang);
      if (!mode) localStorage.setItem(MODE_KEY, "adult");
    } catch (e) {}
    location.reload();
  }));
document.querySelectorAll(".langSelect").forEach(sel => {
  sel.value = lang;
  sel.addEventListener("change", () => setLang(sel.value));
});
$("#switchModeBtn").addEventListener("click", () => {
  const to = t(mode === "kids" ? "mode_adult" : "mode_kids");
  if (!confirm(t("confirm_switch", {to}))) return;
  chooseMode(mode === "kids" ? "adult" : "kids");
});

importHandoffSave();

applyStaticText();
if (!mode) {
  $("#modeGate").hidden = false;
} else {
  document.documentElement.classList.remove("noMode");
  document.documentElement.classList.toggle("kidsMode", mode === "kids");
  applyStaticText();
  $("#modeName").textContent = t(mode === "kids" ? "mode_kids" : "mode_adult");
  $("#switchModeBtn").textContent = t(mode === "kids" ? "to_adult" : "to_kids");
  // こども版は同じ意味をやさしい言葉で言い直す。ヒントの点数も出さない
  if (mode === "kids" && lang === "ja") {
    ["#hintBtn", "#hintBtnM", "#mHintBtn"].forEach(sel => { const b = $(sel); if (b) b.textContent = t("hint_kids"); });
  }
  loadProgress();
  syncAudioButtons();

  // 起動時に詰んだ状態（★0 のまま/入力できないラウンド）で放置しないための復旧
  let bootNotice = "";
  if (stars <= 0) {
    stars = 5;
    bootNotice = t("msg_boot_stars");
    saveProgress();
  }
  // 済んだラウンドから始めても押せるかなが無い。手つかずの問題へ寄せて、
  // スタート画面の「つづきから」がいつでも遊べる先を指すようにする。
  if (roundLocked() || state().cleared) {
    const fresh = si => STAGES[si].find(i => !roundStates[i].cleared && !roundStates[i].gaveUp);
    const next = fresh(currentStage());
    if (next !== undefined) roundIndex = next;
    else { const n2 = fresh(highestUnlocked()); if (n2 !== undefined) roundIndex = n2; }
  }

  // 前のステージを終えていないのに、その先のラウンドから始まってしまうことがある
  // （別モードのセーブや、ステージの並びが変わったとき）。開いている所へ戻す。
  if (!stageUnlocked(currentStage())) {
    const si = highestUnlocked();
    const next = STAGES[si].find(i => !roundStates[i].cleared);
    roundIndex = next === undefined ? STAGES[si][0] : next;
  }
  viewStage = currentStage();
  // URL が場所を指していれば、そこへ戻す（読み込み直しても同じ画面になる）
  const where = applyHash();
  render();
  // 知らせはスタート画面に出す。盤面へ流しても、幕の裏で消えてしまうため
  if (where === "start") showStart(bootNotice);
  else {
    if (where === "play") syncHash(); else openRoundList();
    if (bootNotice) flash("info", bootNotice);
  }
}
