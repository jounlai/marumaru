// 「ひらがなが押せない」の再現調査
const { chromium } = require("playwright");
const URL = "file://" + require("path").join(__dirname, "..", "index.html");

async function scenario(browser, name, { seed, useTap }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  if (seed) {
    await page.addInitScript(seed);
  }
  await page.goto(URL);
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => ({
    modalOpen: !!document.querySelector(".modal.show"),
    stars, roundIndex, roundName: roundName(),
    locked: roundLocked(),
    disabled: [...document.querySelectorAll(".kana")].filter(b => b.disabled).length,
    total: document.querySelectorAll(".kana").length
  }));

  // ラウンド一覧が開いていれば1つ選ぶ
  if (state.modalOpen) {
    await page.click('#roundList .roundChoice[data-round="0"]');
    await page.waitForTimeout(300);
  }

  // 実際に押してみる（tap＝実機のタッチ / click＝マウス）
  const before = await page.evaluate(() => roundStates[roundIndex].used.size);
  const target = await page.$(".kana:not([disabled])");
  let pressed = false, err = null;
  if (target) {
    try {
      if (useTap) await target.tap(); else await target.click();
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => roundStates[roundIndex].used.size);
      pressed = after > before;
    } catch (e) { err = e.message.split("\n")[0]; }
  }

  const after = await page.evaluate(() => ({
    stars, locked: roundLocked(),
    disabled: [...document.querySelectorAll(".kana")].filter(b => b.disabled).length,
    total: document.querySelectorAll(".kana").length,
    // かなボタンの中心に本当に触れるか（別要素が覆っていないか）を判定
    hitTest: (() => {
      const b = [...document.querySelectorAll(".kana")].find(x => !x.disabled);
      if (!b) return "押せるボタンなし";
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === b ? "OK（ボタン自身）" : "覆われている → " + (top ? top.className || top.tagName : "null");
    })()
  }));

  console.log(`■ ${name}`);
  console.log(`   起動時: モーダル=${state.modalOpen} ★=${state.stars} ${state.roundName} ロック=${state.locked} 無効ボタン=${state.disabled}/${state.total}`);
  console.log(`   押下(${useTap ? "tap" : "click"})=${pressed ? "成功" : "★失敗★"}  ロック=${after.locked} 無効=${after.disabled}/${after.total}  当たり判定=${after.hitTest}` + (err ? `  例外=${err}` : ""));
  if (errs.length) console.log("   JSエラー:", errs.join(" | "));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();

  await scenario(browser, "新規・マウスclick", { useTap: false });
  await scenario(browser, "新規・実機タップ(tap)", { useTap: true });

  // 旧版(v4)のセーブが残っている：★0でゲームオーバー済み
  await scenario(browser, "旧v4セーブ・★0", {
    useTap: true,
    seed: () => localStorage.setItem("maruanagame-progress-v4", JSON.stringify({
      roundIndex: 0, roundTemplate: "○ん○ん", stars: 0, soundOn: true,
      rounds: [{ template: "○ん○ん", found: [], discovered: [], used: [], cleared: false, rewarded: false, gaveUp: false }]
    }))
  });

  // 旧版セーブ：そのラウンドで降参済み
  await scenario(browser, "旧v4セーブ・降参済みラウンド", {
    useTap: true,
    seed: () => localStorage.setItem("maruanagame-progress-v4", JSON.stringify({
      roundIndex: 0, roundTemplate: "○ん○ん", stars: 3, soundOn: true,
      rounds: [{ template: "○ん○ん", found: [], discovered: [], used: [], cleared: false, rewarded: false, gaveUp: true }]
    }))
  });

  // 旧版セーブ：全問発見済み（＝移行で perfect 扱いになる）
  await scenario(browser, "旧v4セーブ・クリア済みラウンド", {
    useTap: true,
    seed: () => localStorage.setItem("maruanagame-progress-v4", JSON.stringify({
      roundIndex: 0, roundTemplate: "○ん○ん", stars: 4, soundOn: true,
      rounds: [{ template: "○ん○ん", found: [], discovered: [], used: [], cleared: true, rewarded: true, gaveUp: false }]
    }))
  });

  await browser.close();
})();
