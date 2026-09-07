const { chromium } = require("playwright");
const path = require("path");
const URL = "file://" + require("path").join(__dirname, "..", "index.html");
const OUT = __dirname + "/shots";
require("fs").mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: "iphone-se", width: 375, height: 667, dsf: 2, mobile: true },
  { name: "iphone-14", width: 390, height: 844, dsf: 3, mobile: true },
  { name: "android-small", width: 360, height: 640, dsf: 2, mobile: true },
  { name: "desktop", width: 1280, height: 800, dsf: 1, mobile: false }
];

(async () => {
  const browser = await chromium.launch();
  for (const d of DEVICES) {
    const ctx = await browser.newContext({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.dsf,
      isMobile: d.mobile,
      hasTouch: d.mobile
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(String(e)));
    page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
    await page.goto(URL);
    await page.waitForTimeout(400);

    // 入り口でおとな版を選ぶ。選ぶとページを読み込み直すので、
    // 読み込み完了と一覧の再表示を待たないと、消える寸前のDOMを掴んでしまう。
    if (await page.isVisible("#modeGate")) {
      await page.click('[data-mode="adult"]');
      await page.waitForLoadState("load");
      await page.waitForSelector("#roundModal.show");
      await page.waitForTimeout(200);
    }

    // ステージ一覧 → 通常ラウンド0を選ぶ
    await page.click('#roundList .roundChoice[data-round="0"]');
    await page.waitForTimeout(400);

    const metrics = async (label) => {
      const m = await page.evaluate(() => ({
        docScroll: document.documentElement.scrollHeight,
        docClient: document.documentElement.clientHeight,
        bodyScrollW: document.body.scrollWidth,
        bodyClientW: document.body.clientWidth,
        gridScroll: document.querySelector(".gridWrap").scrollHeight,
        gridClient: document.querySelector(".gridWrap").clientHeight,
        appH: document.querySelector(".app").getBoundingClientRect().height,
        kanaH: document.querySelector(".kana").getBoundingClientRect().height,
        pocketVisible: getComputedStyle(document.querySelector("#pocket")).display !== "none",
        mascotLeft: document.querySelector("#mascot").style.left
      }));
      const vScroll = m.docScroll - m.docClient;
      const hScroll = m.bodyScrollW - m.bodyClientW;
      const gridOver = m.gridScroll - m.gridClient;
      console.log(`${d.name.padEnd(13)} ${label.padEnd(10)} 縦あふれ:${String(vScroll).padStart(4)}px 横あふれ:${String(hScroll).padStart(3)}px ` +
        `盤面あふれ:${String(gridOver).padStart(4)}px かな高:${Math.round(m.kanaH)}px ポケット:${m.pocketVisible ? "表示" : "非表示"}`);
      return { vScroll, hScroll, gridOver };
    };

    await metrics("通常");
    await page.screenshot({ path: path.join(OUT, `${d.name}-main.png`) });

    // 数手プレイして演出後の状態を撮る
    const kanas = await page.$$eval(".kana:not(:disabled)", els => els.slice(0, 40).map(e => e.dataset.kana));
    for (const k of ["か", "が", "き", "こ", "さ"]) {
      const el = await page.$(`.kana[data-kana="${k}"]:not(:disabled)`);
      if (el) { await el.click(); await page.waitForTimeout(180); }
    }
    await page.waitForTimeout(500);
    await metrics("数手後");
    await page.screenshot({ path: path.join(OUT, `${d.name}-played.png`) });

    // SPECIAL ラウンド
    // 押すと全画面モーダルが自分の上に出るので、Playwright の遮蔽判定に
    // 引っかかる。実機のタップでは開くため、素のマウス操作で押す。
    {
      const b = await page.$eval("#roundListBtn", e => { const r = e.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; });
      await page.mouse.click(b.x, b.y);
    }
    await page.waitForTimeout(250);
    // ステージ一覧には、いまのステージの問題だけが並ぶ。種別は見出しで探す。
    const pickRound = async prefix => {
      for (const b of await page.$$("#roundList .roundChoice")) {
        if ((await b.textContent()).includes(prefix)) return b;
      }
      return null;
    };
    const spBtn = await pickRound("SPECIAL");
    if (spBtn) { await spBtn.click(); await page.waitForTimeout(400); await metrics("SPECIAL"); }
    await page.screenshot({ path: path.join(OUT, `${d.name}-special.png`) });

    // WORD ラウンド
    // 押すと全画面モーダルが自分の上に出るので、Playwright の遮蔽判定に
    // 引っかかる。実機のタップでは開くため、素のマウス操作で押す。
    {
      const b = await page.$eval("#roundListBtn", e => { const r = e.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2}; });
      await page.mouse.click(b.x, b.y);
    }
    await page.waitForTimeout(250);
    const wBtn = await pickRound("WORD");
    if (wBtn) { await wBtn.click(); await page.waitForTimeout(400); await metrics("WORD"); }
    await page.screenshot({ path: path.join(OUT, `${d.name}-word.png`) });

    if (errs.length) console.log("  !! エラー:", errs.join(" | "));
    await ctx.close();
  }
  await browser.close();
})();
