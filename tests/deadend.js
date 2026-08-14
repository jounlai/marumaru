// プレイ中に「急に押せなくなる」経路の検証
const { chromium } = require("playwright");
const URL = "file://" + require("path").join(__dirname, "..", "index.html");

const line = (t, ok, extra) => console.log(`   ${ok ? " ok " : "FAIL"}  ${t}${extra ? "  — " + extra : ""}`);

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  const ck = (t, ok, extra) => { if (!ok) failed++; line(t, ok, extra); };

  /* ---- 1) ★を使い切ってゲームオーバー → 背景タップで閉じようとする ---- */
  {
    console.log("■ ★0 → ゲームオーバー画面を背景タップ／Escで閉じようとする");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(URL); await page.waitForTimeout(300);
    await page.click('#roundList .roundChoice[data-round="0"]');
    await page.waitForTimeout(200);

    // 不正解を5回押して★を尽きさせる
    await page.evaluate(() => {
      const r = ROUND_DATA[roundIndex];
      const words = new Set(r.answers.map(a => a.word));
      const wrong = ALL_KANA.filter(k => !words.has(fillWord(r, k)));
      for (let i = 0; i < 5; i++) document.querySelector(`.kana[data-kana="${wrong[i]}"]`).click();
    });
    await page.waitForTimeout(900);
    ck("ゲームオーバー画面が出る", await page.isVisible("#gameoverModal"));

    await page.mouse.click(10, 10);                 // 背景タップ
    await page.keyboard.press("Escape");            // Esc
    await page.waitForTimeout(250);
    ck("背景タップ／Escでは閉じない", await page.isVisible("#gameoverModal"));

    // 万一閉じた場合でも復帰できるか（強制的に閉じて確認）
    await page.evaluate(() => closeModals({ force: true }));
    await page.waitForTimeout(250);
    ck("閉じても下部バーで理由が出る", await page.isVisible("#doneBar"), (await page.textContent("#doneMsg")).trim());
    ck("「★5で再開」ボタンが出る", await page.isVisible("#reviveBarBtn"));
    await page.click("#reviveBarBtn");
    await page.waitForTimeout(300);
    await page.click(".kana:not([disabled])");
    await page.waitForTimeout(200);
    ck("再開後にかなを押せる", await page.evaluate(() => roundStates[roundIndex].used.size > 5),
      "★=" + await page.evaluate(() => stars));
    if (errs.length) ck("JSエラーなし", false, errs.join(" | "));
    await ctx.close();
  }

  /* ---- 2) 押せる仮名を使い切る（★は残っている） ---- */
  {
    console.log("■ 押せるかなを全部使い切った（★は潤沢）");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errs = []; page.on("pageerror", e => errs.push(String(e)));
    await page.goto(URL); await page.waitForTimeout(300);
    await page.click('#roundList .roundChoice[data-round="0"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      stars = 99;                                   // ★を潤沢にして全部押す
      const r = ROUND_DATA[roundIndex];
      // クリアしないよう、正解は目標未満だけ押す
      pressableKanas().forEach(k => {
        const b = document.querySelector(`.kana[data-kana="${k}"]`);
        if (b && !b.disabled) b.click();
      });
    });
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({
      exhausted: roundExhausted(), cleared: roundStates[roundIndex].cleared, perfect: roundStates[roundIndex].perfect,
      enabled: [...document.querySelectorAll(".kana")].filter(b => !b.disabled).length
    }));
    // 全かなを押すと必ず全答えが見つかるため、この状態は必ず PERFECT になる（exhausted は保険）
    ck("全部押した結果、盤面がロックされる", st.enabled === 0, `残り押下可能=${st.enabled}`);
    ck("その状態は PERFECT として扱われる", st.perfect, `cleared=${st.cleared} exhausted=${st.exhausted}`);
    ck("下部バーが出ている", await page.isVisible("#doneBar"), (await page.textContent("#doneMsg")).trim());
    ck("「やり直す」が出ている", await page.isVisible("#retryBtn"));
    await page.click("#retryBtn");
    await page.waitForTimeout(300);
    await page.click(".kana:not([disabled])");
    await page.waitForTimeout(200);
    ck("やり直し後にかなを押せる", await page.evaluate(() => roundStates[roundIndex].used.size === 1));
    if (errs.length) ck("JSエラーなし", false, errs.join(" | "));
    await ctx.close();
  }

  /* ---- 3) 通常のモーダルは今までどおり閉じられる ---- */
  {
    console.log("■ 通常モーダルの開閉（退行チェック）");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(URL); await page.waitForTimeout(300);
    await page.click('#roundList .roundChoice[data-round="0"]');
    await page.waitForTimeout(200);
    await page.click("#menuBtn"); await page.waitForTimeout(200);
    await page.mouse.click(195, 15);
    await page.waitForTimeout(200);
    ck("メニューは背景タップで閉じる", !(await page.isVisible("#menuModal")));
    await page.click("#roundListBtn"); await page.waitForTimeout(200);
    await page.keyboard.press("Escape"); await page.waitForTimeout(200);
    ck("ラウンド一覧はEscで閉じる", !(await page.isVisible("#roundModal")));
    await page.click(".kana:not([disabled])"); await page.waitForTimeout(200);
    ck("閉じたあとかなを押せる", await page.evaluate(() => roundStates[roundIndex].used.size > 0));
    await ctx.close();
  }

  console.log(failed ? `\n=== ${failed} 件失敗 ===` : "\n=== すべて成功 ===");
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
