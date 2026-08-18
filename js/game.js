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
  ["わ",null,null,null,"を"],
  ["ん",null,null,null,null]
];
const VOICED_ROWS = [
  ["が","ぎ","ぐ","げ","ご"],
  ["ざ","じ","ず","ぜ","ぞ"],
  ["だ","ぢ","づ","で","ど"],
  ["ば","び","ぶ","べ","ぼ"],
  ["ぱ","ぴ","ぷ","ぺ","ぽ"],
  ["ゔ",null,null,null,null]
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
const SPECIAL_ROUND_COUNT = SPECIAL_ROUNDS.length;
const WORD_ROUND_COUNT = WORD_ROUNDS.length;
const SPECIAL_START = MAIN_ROUND_COUNT;
const WORD_START = MAIN_ROUND_COUNT + SPECIAL_ROUND_COUNT;
function groupOf(i){ return i >= WORD_START ? "word" : i >= SPECIAL_START ? "special" : "main"; }

const CLEAR_RATE = 0.6;
const BASE_POINT = 100;      // 1正解の基礎点
const COMBO_STEP = 20;       // コンボ1つごとの加点
const FEVER_AT = 5;          // 何連続でFEVERか
const FEVER_MULT = 2;        // FEVER中の倍率
const CLEAR_BONUS = 500;
const PERFECT_BONUS = 2000;
const HINT_COST = 300;

const RANKS = [
  [0,"見習い"],[1500,"ことば拾い"],[5000,"語彙の使い手"],[12000,"辞書見習い"],
  [25000,"言葉の目利き"],[45000,"語彙巧者"],[75000,"ことばの達人"],[120000,"語彙王"],[200000,"〇〇の神"]
];

/* ------------------------------------------------------- 2) 状態・セーブ */
const SAVE_KEY = "maruanagame-progress-v5";
const LEGACY_SAVE_KEY = "maruanagame-progress-v4";

let roundIndex = 0;
let stars = 5;
let soundOn = true;
let score = 0;
let combo = 0;
let maxCombo = 0;

const roundStates = ROUND_DATA.map(() => ({
  found: new Set(), discovered: new Set(), used: new Set(),
  cleared: false, rewarded: false, gaveUp: false, perfect: false, perfectRewarded: false
}));

function serializeProgress(){
  return {
    v: 5,
    roundTemplate: ROUND_DATA[roundIndex] && ROUND_DATA[roundIndex].template,
    stars, soundOn, score, maxCombo,
    rounds: roundStates.map((s, i) => ({
      template: ROUND_DATA[i].template,
      found: [...s.found], discovered: [...s.discovered], used: [...s.used],
      cleared: s.cleared, rewarded: s.rewarded, gaveUp: s.gaveUp,
      perfect: s.perfect, perfectRewarded: s.perfectRewarded
    }))
  };
}
function saveProgress(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(serializeProgress())); } catch (e) {}
}
function loadProgress(){
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem(LEGACY_SAVE_KEY); } catch (e) {}
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
  if (Number.isFinite(x.score)) score = x.score;
  if (Number.isFinite(x.maxCombo)) maxCombo = x.maxCombo;
}
function clearSavedProgress(){
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY); } catch (e) {}
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
function clearTarget(round = current()){ return Math.max(1, Math.ceil(round.answers.length * CLEAR_RATE)); }
function answerMap(){ return new Map(current().answers.map(a => [a.word, a])); }
function answerDisplay(a){ return a.display || a.word; }
function kanaForWord(word){
  return inputKanasForRound().find(k => fillWord(current(), k) === word) || null;
}
function totalCorrectCount(){ return roundStates.reduce((n, s) => n + s.discovered.size, 0); }
function clearedCount(){ return roundStates.filter(s => s.cleared).length; }
function mainClearedCount(){ return roundStates.slice(0, SPECIAL_START).filter(s => s.cleared).length; }
function specialClearedCount(){ return roundStates.slice(SPECIAL_START, WORD_START).filter(s => s.cleared).length; }
function wordClearedCount(){ return roundStates.slice(WORD_START).filter(s => s.cleared).length; }
function perfectCount(){ return roundStates.filter(s => s.perfect).length; }
function isFever(){ return combo >= FEVER_AT; }
function rankName(){
  let name = RANKS[0][1];
  for (const [need, label] of RANKS) if (score >= need) name = label;
  return name;
}
function roundLocked(){ return state().gaveUp || state().perfect || stars <= 0; }
// そのラウンドで実際に押せる仮名（SPECIAL は濁点にできる清音だけ）
function pressableKanas(round = current()){
  return inputKanasForRound(round).filter(k => !(isSpecial(round) && !DAKUTEN_BASE_KANA.has(k)));
}
// 押せる仮名を使い切ってしまい、もう手が無い状態か
function roundExhausted(){ return pressableKanas().every(k => state().used.has(k)); }
function esc(v){
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function num(n){ return n.toLocaleString("ja-JP"); }

function difficultyLabel(idx){
  const g = groupOf(idx);
  if (g === "special") return "SPECIAL — 連濁トラップ";
  if (g === "word") return `WORD — ふつうの${[...ROUND_DATA[idx].template].length}文字ことば`;
  if (idx < 5) return "WARM-UP";
  if (idx < 12) return "NORMAL";
  if (idx < 20) return "HARD";
  if (idx < 26) return "VERY HARD";
  return "HELL";
}
function roundName(i = roundIndex){
  const g = groupOf(i);
  if (g === "special") return `SPECIAL ${String(i - SPECIAL_START + 1).padStart(2, "0")}`;
  if (g === "word") return `WORD ${String(i - WORD_START + 1).padStart(2, "0")}`;
  return `ROUND ${String(i + 1).padStart(2, "0")}`;
}
// テンプレートを表示用HTMLへ（SPECIAL の2つ目の穴には濁点を重ねる）
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
  $("#rankLabel").textContent = rankName();
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
      <div class="meaning">${esc(a.meaning)}</div>
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
  $("#foundCount").innerHTML = `<b>${got}</b> / ${total} 発見`;
  const left = target - got;
  $("#toClear").innerHTML = state().perfect ? '<span class="reachText">PERFECT</span>'
    : state().cleared ? `残り ${total - got} 語で PERFECT`
    : left === 1 ? '<span class="reachText">あと1語でクリア！</span>'
    : `クリアまであと ${left} 語`;
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

  if (!dead && !exhausted && !s.cleared && !s.gaveUp) { bar.hidden = true; return; }
  bar.hidden = false;

  const msg = $("#doneMsg");
  if (dead) {
    msg.innerHTML = "<b>★が尽きました</b> — かなは押せません。★5で再開できます。";
  } else if (exhausted) {
    msg.innerHTML = `<b>押せるかなが尽きました</b> — ${s.discovered.size} / ${total} 語。やり直すか、次のラウンドへ。`;
  } else if (s.perfect) {
    msg.innerHTML = `<b>PERFECT</b> — 全${total}語を発見しました。`;
  } else if (s.gaveUp) {
    msg.innerHTML = "<b>降参したラウンド</b>です。かなは押せません — やり直すか、次のラウンドへ。";
  } else {
    msg.innerHTML = `<b>クリア済み</b> — 残り ${total - s.discovered.size} 語。続ければ<b> PERFECT（★+2）</b>、はずせば ★−1。`;
  }

  $("#reviveBarBtn").hidden = !dead;
  $("#retryBtn").hidden = dead || !(roundLocked() || exhausted);
  $("#revealBtn").hidden = !(dead || exhausted || s.gaveUp || s.perfect);
  $("#nextBtn").hidden = dead;
}

function render(){
  $("#roundLabel").textContent = roundName();
  $("#roundLabel").classList.toggle("special", isSpecial());
  $("#difficulty").textContent = difficultyLabel(roundIndex);
  renderPattern(); renderStars(); renderScore(); renderGrid();
  renderFound(); renderProgress(); renderCombo(); renderDoneBar();
  $("#hintBtn").disabled = $("#hintBtnM").disabled = roundLocked();
  $("#giveupBtn").disabled = $("#giveupBtnM").disabled = state().cleared || state().gaveUp;
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
    `<span class="fm">${esc(a.meaning)}</span>`;
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

// 消音スイッチを無視して鳴らせる状態にする。最初のタップで一度だけ効かせる。
// audioSession が使えるならそれで済ませる。無音ループは再生中の表示が
// コントロールセンターに出てしまうので、古い iOS のときだけの手段にする
function enablePlaybackAudio(){
  try {
    if (navigator.audioSession) { navigator.audioSession.type = "playback"; return; }
  } catch (e) {}
  if (silentEl) { if (silentEl.paused) silentEl.play().catch(() => {}); return; }
  silentEl = new Audio(SILENT_WAV);
  silentEl.loop = true;
  silentEl.volume = 1;          // muted や volume=0 では playback に切り替わらない
  silentEl.play().catch(() => {});
}

function audio(){
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  return actx;
}

// 最初のタップ／キー操作で解錠する。iOS はユーザー操作の中でしか受け付けない
function unlockAudio(){
  enablePlaybackAudio();
  const c = audio();
  // 無音を一発鳴らして、実際に音の出せる状態かを確定させる
  try {
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
    s.buffer = b; s.connect(c.destination); s.start(0);
  } catch (e) {}
}
["pointerdown", "touchstart", "keydown"].forEach(ev =>
  addEventListener(ev, unlockAudio, {once: true, passive: true}));

// バックグラウンドから戻ると suspended のままなので鳴らし直せるようにする
addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !actx) return;
  if (actx.state === "suspended") actx.resume().catch(() => {});
  if (silentEl && silentEl.paused) silentEl.play().catch(() => {});
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
function sfxCorrect(n){
  const semi = SCALE[Math.min(n - 1, SCALE.length - 1)];
  const f = 440 * Math.pow(2, semi / 12);
  tone(f, {type: "triangle", vol: .07, dur: .13});
  tone(f * 2, {type: "sine", vol: .028, dur: .2, at: .02});
  if (isFever()) tone(f * 3, {type: "sine", vol: .02, dur: .26, at: .05});
}
function sfxWrong(){
  tone(190, {type: "sawtooth", vol: .07, dur: .3, glide: 70});
  tone(95, {type: "square", vol: .045, dur: .32});
}
function sfxClear(){ [0, 4, 7, 12].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), {type: "triangle", vol: .07, dur: .45, at: i * .075})); }
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
function showBurst({mark, word, sub, meaning, bonus, dim, gold, long, ms = 900}){
  const box = $("#burst");
  clearTimeout(burstTimer);
  $("#burstMark").textContent = mark || "";
  $("#burstWord").textContent = word || "";
  $("#burstSub").textContent = sub || "";
  $("#burstMeaning").textContent = meaning || "";
  $("#burstBonus").textContent = bonus || "";
  box.className = "burst" + (dim ? " dim" : "") + (gold ? " gold" : "");
  $("#burstInner").className = "burstInner" + (long ? " long" : "");
  void box.offsetWidth;
  box.classList.add("show");
  burstTimer = setTimeout(() => box.classList.remove("show"), ms);
}

/* --- ひらがな棒人間：進捗バーの上を歩き、ゴール旗（クリア地点）を目指す --- */
const mascotEl = $("#mascot"), mRigEl = $("#mRig"), mHeadEl = $("#mHead"),
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
function mascotPose(cls, ms){
  clearTimeout(mascotPoseTimer);
  mRigEl.classList.remove("cheer", "down", "spin");
  void mRigEl.offsetWidth;
  if (!cls) return;
  mRigEl.classList.add(cls);
  mascotPoseTimer = setTimeout(() => mRigEl.classList.remove(cls), ms);
}
// 棒人間の頭は常にひらがな1文字。待機中は「の」、狙っているときはそのかな
function mascotHead(text){
  mHeadEl.textContent = text || "の";
  mHeadEl.classList.toggle("aim", !!text);
}

function updateMascot(){
  const total = current().answers.length;
  const ratio = state().discovered.size / total;
  const left = trackPos(ratio);
  goalEl.style.left = trackPos(clearTarget() / total);
  goalEl.classList.toggle("reached", state().cleared);
  mascotEl.classList.toggle("fever", isFever());
  if (left !== mascotLeft) {
    const moving = mascotLeft !== null;
    mascotLeft = left;
    mascotEl.style.left = left;
    mBubbleEl.style.left = left;
    if (moving) {
      mascotEl.classList.add("walking");
      clearTimeout(mascotWalkTimer);
      mascotWalkTimer = setTimeout(() => mascotEl.classList.remove("walking"), 520);
    }
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
const GOOD_MSGS = ["いた。日本語にいた。", "正解。辞書がうなずいた。", "発見！〇が仕事をした。", "それ、あります。", "語彙力が静かに暴れている。"];
const BAD_MSGS = ["ない。★をいただきます。", "惜しい顔をしても、ないものはない。", "辞書：『存じません』", "その日本語、今回は未確認。", "〇に無茶をさせましたね。"];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function guess(kana){
  if (isSpecial() && !DAKUTEN_BASE_KANA.has(kana)) return;
  if (roundLocked() || state().used.has(kana)) return;

  state().used.add(kana);
  const word = fillWord(current(), kana);
  const amap = answerMap();
  const hit = amap.has(word);
  let pts = 0;

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

    const willPerfect = state().discovered.size >= total;
    if (!state().cleared && state().discovered.size >= clearTarget()) finishRound(willPerfect);
    else if (!willPerfect) showBurst({
      mark: combo >= 2 ? `COMBO ×${combo}` : "CORRECT",
      word: answerDisplay(a),
      sub: (a.display && a.display !== a.word) ? a.word : "",
      long: true, ms: 1400
    });
    if (willPerfect && !state().perfect) perfectRound();

  } else {
    combo = 0;
    stars--;
    popLostStar();
    sfxWrong(); buzz([25, 40, 25]); shake();
    flash("bad", `${word} — ${pick(BAD_MSGS)}`);
  }

  saveProgress();
  render();

  // 演出は再描画のあとに付ける（render() でボタンが作り直されるため）
  const btn = document.querySelector(`.kana[data-kana="${kana}"]`);
  throwKana(kana, btn, hit);
  if (btn && hit) {
    btn.classList.add("pop");
    floatText(`+${pts}${combo >= 2 ? ` ×${combo}` : ""}`, btn, isFever() ? "gold" : "");
    particles(btn, isFever() ? 16 : 10, isFever() ? ["#7ef9d0", "#fff", "#ffd34d"] : ["#fff", "#bbb"]);
    if (!state().perfect) {
      mascotPose("cheer", 820);
      mascotSay(combo >= 3 ? `${combo}れんぞく！` : pick(["やった！", "いた！", "みつけた！", "せいかい！"]),
        isFever() ? "gold" : "", 1100);
    }
  } else if (btn) {
    btn.classList.add("shakeNo");
    floatText("★ −1", btn, "bad");
    mascotPose("down", 1520);
    mascotSay(stars <= 0 ? "ちからつきた…" : "はねかえされた！", "bad", 1500);
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
    sfxClear(); buzz([30, 50, 30]);
    mascotPose("cheer", 820);
    mascotSay("ゴール！", "gold", 2000);
    setTimeout(() => {
      showBurst({mark: roundName(), word: "ROUND CLEAR", sub: `${s.discovered.size} / ${current().answers.length} 語発見`,
        bonus, dim: true, long: true, ms: 1250});
      particles(null, 34, ["#fff", "#ffd34d", "#bbb"]);
    }, 340);
  }
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
  sfxPerfect(); buzz([40, 60, 40, 60, 80]);
  mascotPose("spin", 1320);
  mascotSay("パーフェクト！", "gold", 2600);
  setTimeout(() => {
    showBurst({mark: roundName(), word: "PERFECT!!", sub: `全 ${current().answers.length} 語を発見`,
      bonus, dim: true, gold: true, long: true, ms: 1600});
    particles(null, 60, ["#ffd34d", "#fff", "#7ef9d0", "#fff6c8"]);
  }, 360);
}

function useHint(){
  if (roundLocked()) { flash("info", "このラウンドはもう終わっています。"); return; }
  const pool = current().answers.filter(a => {
    if (state().discovered.has(a.word)) return false;
    const k = kanaForWord(a.word);
    return k && !state().used.has(k);
  });
  if (!pool.length) { flash("info", "もうヒントの出しようがありません。"); return; }
  if (score < HINT_COST) { flash("bad", `ヒントには ${HINT_COST} スコア必要です（現在 ${num(score)}）。`); return; }

  score -= HINT_COST;
  const a = pick(pool);
  const k = kanaForWord(a.word);
  const btn = document.querySelector(`.kana[data-kana="${k}"]`);
  if (btn) {
    btn.classList.add("hintGlow");
    floatText(`−${HINT_COST}`, btn, "bad");
    setTimeout(() => btn.classList.remove("hintGlow"), 5000);
  }
  sfxHint();
  flash("info", `ヒント：${a.meaning}`);
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
  s.cleared = false; s.gaveUp = false; s.perfect = false;
  combo = 0;
  lastFoundWord = null;
  mascotEl.classList.add("noAnim");
  mascotLeft = null;
  saveProgress();
  closeModals();
  render();
  requestAnimationFrame(() => mascotEl.classList.remove("noAnim"));
  flash("info", s.rewarded ? "このラウンドをやり直します（★ボーナスは取得済み）。" : "このラウンドを最初からやり直します。");
}

function giveUp(){
  if (state().cleared || state().gaveUp) return;
  state().gaveUp = true;
  combo = 0;
  current().answers.forEach(a => state().found.add(a.word));
  inputKanasForRound().forEach(k => state().used.add(k));
  flash("info", "全回答を公開しました。★ボーナスはありません。");
  saveProgress();
  render();
  openAnswers();
}

function nextRound(){
  const allCleared = clearedCount() === ROUND_DATA.length;
  if (roundIndex >= ROUND_DATA.length - 1 || allCleared) { openRoundList(); return; }
  selectRound(roundIndex + 1);
}

function selectRound(i){
  if (i < 0 || i >= ROUND_DATA.length) return;
  roundIndex = i;
  combo = 0;
  lastFoundWord = null;
  flash("info", "");
  saveProgress();
  closeModals();
  // 棒人間は歩かずに新しいラウンドの位置へ立ち直す
  mascotEl.classList.add("noAnim");
  mascotLeft = null;
  mBubbleEl.classList.remove("show");
  render();
  requestAnimationFrame(() => mascotEl.classList.remove("noAnim"));
}

function gameOver(){
  $("#gameoverText").innerHTML =
    `${roundName()} で★が尽きました。<br>発見したことば <b>${totalCorrectCount()}</b> 語。日本語は広かった。`;
  $("#gScore").textContent = num(score);
  $("#gCombo").textContent = num(maxCombo);
  openModal("#gameoverModal");
}
function revive(){
  stars = 5;
  combo = 0;
  starsShown = -1;
  closeModals({force: true});
  saveProgress();
  render();
  flash("info", "★5で再開。記録はそのままです。");
}
function resetAll(skipConfirm){
  if (!skipConfirm && !confirm("★・スコア・発見語・クリア履歴をすべて消去しますか？")) return;
  roundIndex = 0; stars = 5; score = 0; combo = 0; maxCombo = 0; scoreShown = 0; starsShown = -1;
  roundStates.forEach(s => {
    s.found.clear(); s.discovered.clear(); s.used.clear();
    s.cleared = s.rewarded = s.gaveUp = s.perfect = s.perfectRewarded = false;
  });
  clearSavedProgress();
  closeModals({force: true});
  flash("info", "");
  render();
  openRoundList();
}

/* --------------------------------------------------- 7) モーダル/イベント */
function openModal(sel){ closeModals({force: true}); document.querySelector(sel).classList.add("show"); }
// data-persistent（ゲームオーバー画面）は背景タップや Esc では閉じない。
// 閉じられると★0のまま操作できない盤面だけが残ってしまうため。
function closeModals(opts){
  document.querySelectorAll(".modal.show").forEach(m => {
    if (!(opts && opts.force) && m.hasAttribute("data-persistent")) return;
    m.classList.remove("show");
  });
}

function openRoundList(){
  const list = $("#roundList");
  let html = "";
  ROUND_DATA.forEach((r, i) => {
    if (i === SPECIAL_START) {
      html += `<div class="specialHeader">SPECIAL — 連濁ラウンド
        <small>清音を1つ選ぶと、後半の「〇゙」が自動で濁音になります。</small></div>`;
    }
    if (i === WORD_START) {
      html += `<div class="specialHeader">WORD — ふつうのことば
        <small>穴は1つだけ。擬音語・擬態語ではない、3〜4文字の名詞・形容詞・固有名詞などを探します。</small></div>`;
    }
    const st = roundStates[i];
    const total = r.answers.length;
    const target = clearTarget(r);
    const badge = st.perfect ? '<span class="badge gold">PERFECT</span>'
      : st.cleared ? '<span class="badge">✓ クリア</span>'
      : st.gaveUp ? '<span class="badge">降参</span>'
      : `<span class="badge">${st.discovered.size}/${target}</span>`;
    html += `<button class="roundChoice ${st.perfect ? "perfect " : st.cleared ? "cleared " : ""}${i === roundIndex ? "current" : ""}" data-round="${i}">
      <div class="rcTop"><span>${roundName(i)}</span>${badge}</div>
      <div class="rcPattern">${templateHTML(r.template)}</div>
      <div class="rcMeta">全${total}語 ・ ${target}語でクリア</div>
      <div class="rcBar"><i style="width:${Math.min(100, st.discovered.size / total * 100)}%"></i></div>
    </button>`;
  });
  list.innerHTML = html;
  list.querySelectorAll(".roundChoice").forEach(b => b.addEventListener("click", () => selectRound(Number(b.dataset.round))));
  openModal("#roundModal");
}

function openAnswers(){
  const total = current().answers.length;
  $("#answerTitle").textContent = `${roundName()} の正解一覧`;
  $("#answerSub").textContent = `全${total}語中 ${state().discovered.size}語を発見。赤字は見逃したことば。`;
  $("#answerList").innerHTML = current().answers.map(a => {
    const missed = !state().discovered.has(a.word);
    const reading = a.display && a.display !== a.word ? `<span class="reading">${esc(a.word)}</span>` : "";
    return `<div class="answerRow${missed ? " missed" : ""}">
      <div class="word">${esc(answerDisplay(a))}${reading}</div>
      <div class="meaning">${esc(a.meaning)}</div>
    </div>`;
  }).join("");
  openModal("#answerModal");
}

function openMenu(){
  $("#mScore").textContent = num(score);
  $("#mCombo").textContent = num(maxCombo);
  $("#mFound").textContent = num(totalCorrectCount());
  $("#mCleared").textContent =
    `${mainClearedCount()}/${MAIN_ROUND_COUNT}・${specialClearedCount()}/${SPECIAL_ROUND_COUNT}・${wordClearedCount()}/${WORD_ROUND_COUNT}`;
  $("#menuRank").textContent = `${rankName()} ・ PERFECT ${perfectCount()} ラウンド`;
  $("#soundBtn").textContent = soundOn ? "♪ 効果音 ON" : "♪ 効果音 OFF";
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
  $("#soundBtn").textContent = soundOn ? "♪ 効果音 ON" : "♪ 効果音 OFF";
  if (soundOn) { unlockAudio(); sfxHint(); }
  else if (silentEl) silentEl.pause();   // OFF のあいだは無音ループも止める
  saveProgress();
});

// 見つけたことばチップ → 意味を表示
$("#foundChips").addEventListener("click", e => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const a = answerMap().get(chip.dataset.word);
  if (a) flash("info", `${answerDisplay(a)}：${a.meaning}`);
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

loadProgress();

// 起動時に詰んだ状態（★0 のまま／入力できないラウンド）で放置しないための復旧
let bootNotice = "";
if (stars <= 0) {
  stars = 5;
  bootNotice = "前回★が尽きていました。★5から再開します。";
  saveProgress();
} else if (roundLocked()) {
  bootNotice = state().gaveUp
    ? "このラウンドは降参済みです。「やり直す」か、一覧から別のラウンドを選んでください。"
    : "このラウンドは全問正解済みです。一覧から別のラウンドを選べます。";
}

render();
if (bootNotice) flash("info", bootNotice);
openRoundList();
