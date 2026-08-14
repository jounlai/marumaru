/* data.js + game.js と同じスコープで実行される検証コード */
(function () {
  const log = [];
  let failed = 0;
  const check = (name, cond, extra) => {
    if (!cond) failed++;
    log.push((cond ? "  ok  " : "FAIL  ") + name + (extra ? "  — " + extra : ""));
  };
  const q = s => document.querySelector(s);
  const click = el => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const kanaOf = (round, word) => {
    const pool = round.mode === "dakutenSecond" ? PLAIN_KANA.filter(k => DAKUTEN_MAP[k]) : ALL_KANA;
    return pool.find(k => fillWord(round, k) === word);
  };

  // ---- 起動時
  check("起動時にラウンド一覧が開く", q("#roundModal").classList.contains("show"));
  check("ラウンドカード数 = ラウンド数",
    q("#roundList").querySelectorAll(".roundChoice").length === ROUND_DATA.length,
    q("#roundList").querySelectorAll(".roundChoice").length + "/" + ROUND_DATA.length);
  check("かなボタン72個（清音46＋濁音半濁音26）", q("#kanaGrid").querySelectorAll(".kana").length === 72,
    String(q("#kanaGrid").querySelectorAll(".kana").length));
  check("ポケットがグリッド内に残る", !!q("#kanaGrid #pocket"));
  check("3グループの合計 = 全ラウンド",
    MAIN_ROUND_COUNT + SPECIAL_ROUND_COUNT + WORD_ROUND_COUNT === ROUND_DATA.length,
    `${MAIN_ROUND_COUNT} + ${SPECIAL_ROUND_COUNT} + ${WORD_ROUND_COUNT} = ${ROUND_DATA.length}`);
  check("グループ判定", groupOf(0) === "main" && groupOf(SPECIAL_START) === "special" && groupOf(WORD_START) === "word");
  check("ラウンド名", roundName(0).startsWith("ROUND") && roundName(SPECIAL_START).startsWith("SPECIAL") && roundName(WORD_START).startsWith("WORD"),
    roundName(WORD_START));
  check("棒人間がいる", !!q("#mascot") && !!q("#mHead"));

  // ---- ラウンド0を選択
  click(q('#roundList .roundChoice[data-round="0"]'));
  check("選択でモーダルが閉じる", !q("#roundModal").classList.contains("show"));
  const r0 = ROUND_DATA[0];
  check("お題が描画される", q("#pattern").textContent.length > 0, q("#pattern").textContent);

  // ---- 1問正解
  const first = r0.answers[0];
  click(q(`.kana[data-kana="${kanaOf(r0, first.word)}"]`));
  check("正解で+100", score === 100, "score=" + score);
  check("コンボ1", combo === 1);
  check("★は減らない", stars === 5);
  check("発見リストに載る", q("#foundList").textContent.includes(first.display || first.word));
  check("チップにも載る", q("#foundChips").querySelectorAll(".chip").length === 1);
  check("押したかなが correct", q(`.kana[data-kana="${kanaOf(r0, first.word)}"]`).classList.contains("correct"));
  check("正解かなは再押下不可", q(`.kana[data-kana="${kanaOf(r0, first.word)}"]`).disabled);

  // ---- 5連続でFEVER
  r0.answers.slice(1, 5).forEach(a => click(q(`.kana[data-kana="${kanaOf(r0, a.word)}"]`)));
  check("コンボ5", combo === 5, "combo=" + combo);
  check("FEVER表示", q("#comboTag").classList.contains("fever"));
  check("body.fever", document.body.classList.contains("fever"));
  const scoreAtFever = score;

  // ---- はずす
  const words0 = new Set(r0.answers.map(a => a.word));
  const wrongK = ALL_KANA.find(k => !words0.has(fillWord(r0, k)) && !roundStates[0].used.has(k));
  click(q(`.kana[data-kana="${wrongK}"]`));
  check("不正解で★−1", stars === 4, "stars=" + stars);
  check("不正解でコンボ0", combo === 0);
  check("不正解でスコア据え置き", score === scoreAtFever);
  check("FEVER解除", !document.body.classList.contains("fever"));

  // ---- クリアまで
  const target = Math.max(1, Math.ceil(r0.answers.length * 0.6));
  for (const a of r0.answers) {
    if (roundStates[0].discovered.size >= target) break;
    const b = q(`.kana[data-kana="${kanaOf(r0, a.word)}"]`);
    if (b && !b.disabled) click(b);
  }
  check("クリア判定", roundStates[0].cleared);
  check("クリアで★+1", stars === 5, "stars=" + stars);
  check("クリアボーナス+500", score >= scoreAtFever + 500);
  check("doneBar表示", !q("#doneBar").hidden);
  const notYet = r0.answers.find(a => !roundStates[0].discovered.has(a.word));
  check("クリア後も入力可（PERFECT続行）", !q(`.kana[data-kana="${kanaOf(r0, notYet.word)}"]`).disabled);

  // ---- PERFECT
  const starsBeforePerfect = stars;
  for (const a of r0.answers) {
    const b = q(`.kana[data-kana="${kanaOf(r0, a.word)}"]`);
    if (b && !b.disabled) click(b);
  }
  check("PERFECT判定", roundStates[0].perfect);
  check("PERFECTで★+2", stars === starsBeforePerfect + 2, "stars=" + stars);
  check("PERFECT後は盤面ロック", q(`.kana[data-kana="${kanaOf(r0, first.word)}"]`).disabled);
  check("全語発見", roundStates[0].discovered.size === r0.answers.length);

  // ---- セーブ
  const saved = JSON.parse(localStorage.getItem("maruanagame-progress-v5"));
  check("セーブされる", !!saved && saved.stars === stars && saved.score === score);
  check("セーブにテンプレートが入る", saved.rounds[0].template === ROUND_DATA[0].template);

  // ---- 答え一覧
  click(q("#revealBtn"));
  check("答え一覧が開く", q("#answerModal").classList.contains("show"));
  check("答えの行数が一致", q("#answerList").querySelectorAll(".answerRow").length === r0.answers.length);
  check("見逃しゼロ", q("#answerList").querySelectorAll(".answerRow.missed").length === 0);
  closeModals();

  // ---- SPECIAL
  selectRound(MAIN_ROUND_COUNT);
  const sp = ROUND_DATA[MAIN_ROUND_COUNT];
  check("SPECIALは単一グリッド", q("#kanaGrid").classList.contains("single"));
  check("SPECIALのかなは46個", q("#kanaGrid").querySelectorAll(".kana").length === 46,
    String(q("#kanaGrid").querySelectorAll(".kana").length));
  check("濁点にできないかなは無効", q('.kana[data-kana="あ"]').classList.contains("invalid"));
  check("濁点にできるかなは有効", !q('.kana[data-kana="か"]').disabled);
  check("お題に濁点の穴がある", q("#pattern").textContent.includes("゙"));
  const spw = sp.answers[0].word;
  click(q(`.kana[data-kana="${kanaOf(sp, spw)}"]`));
  check("SPECIALの連濁語が正解になる", roundStates[MAIN_ROUND_COUNT].discovered.has(spw), spw);

  // ---- ヒント
  selectRound(1);
  const beforeHint = score;
  useHint();
  check("ヒントで−300", score === beforeHint - 300, "score=" + score);
  check("ヒント対象が光る", !!q(".kana.hintGlow"));
  check("ヒント文が出る", q("#flash").textContent.startsWith("ヒント："));

  // ---- 降参
  giveUp();
  check("降参で全公開", roundStates[1].found.size === ROUND_DATA[1].answers.length);
  check("降参はクリア扱いにしない", !roundStates[1].cleared);
  check("降参後は入力不可", q(".kana:not(.invalid)").disabled);
  closeModals();

  // ---- WORD ラウンド（穴は1つ）
  selectRound(WORD_START);
  const w0 = ROUND_DATA[WORD_START];
  check("WORDラウンドの穴は1つ", q("#pattern").querySelectorAll(".hole").length === 1,
    String(q("#pattern").querySelectorAll(".hole").length));
  check("WORDラウンドは3〜4文字", [...w0.answers[0].word].length === [...w0.template].length);
  check("WORDでも全かな使える", q("#kanaGrid").querySelectorAll(".kana").length === 72);
  const wk = kanaOf(w0, w0.answers[0].word);
  click(q(`.kana[data-kana="${wk}"]`));
  check("WORDラウンドで正解できる", roundStates[WORD_START].discovered.has(w0.answers[0].word), w0.answers[0].word);
  check("待機中の頭はひらがな「の」", q("#mHead").textContent === "の", q("#mHead").textContent);
  // かなにポインタを合わせると、頭がそのかなになる
  q('.kana:not([disabled])').dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
  check("狙ったかなが棒人間の頭になる",
    q("#mHead").textContent.length === 1 && q("#mHead").textContent !== "の" && q("#mHead").classList.contains("aim"),
    q("#mHead").textContent);
  q('.kana:not([disabled])').dispatchEvent(new MouseEvent("pointerleave", { bubbles: true }));

  // ---- ゲームオーバー → 復活
  stars = 1;
  selectRound(2);
  const r2 = ROUND_DATA[2];
  const wrong2 = ALL_KANA.find(k => !r2.answers.some(a => a.word === fillWord(r2, k)));
  click(q(`.kana[data-kana="${wrong2}"]`));
  check("★0になる", stars === 0);
  const scoreAtDeath = score;

  setTimeout(() => {
    check("ゲームオーバー画面が出る", q("#gameoverModal").classList.contains("show"));
    click(q("#reviveBtn"));
    check("復活で★5", stars === 5);
    check("復活でスコア保持", score === scoreAtDeath);
    check("復活後は入力可", !q('.kana[data-kana="' + ALL_KANA.find(k => !roundStates[2].used.has(k)) + '"]').disabled);

    // ---- 語彙データの健全性
    let bad = 0, dup = 0, totalWords = 0;
    ROUND_DATA.forEach(r => {
      const pool = r.mode === "dakutenSecond" ? PLAIN_KANA.filter(k => DAKUTEN_MAP[k]) : ALL_KANA;
      const legal = new Set(pool.map(k => fillWord(r, k)));
      const seen = new Set();
      r.answers.forEach(a => {
        totalWords++;
        if (!legal.has(a.word)) bad++;
        if (seen.has(a.word)) dup++;
        seen.add(a.word);
        if ([...a.word].length !== [...r.template].length) bad++;
      });
    });
    check("全語が盤面から入力可能・重複なし", bad === 0 && dup === 0, `不正${bad} 重複${dup}`);
    log.push(`  --  収録: ${ROUND_DATA.length}ラウンド / ${totalWords}語`);

    window.__result = { log, failed };
  }, 700);
})();
