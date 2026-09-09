// 深度・モードをまたいで、一覧と移動演出が同じ素材を使うことを確認する。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");

(async () => {
  const browser = await chromium.launch();
  try {
    for (const mode of ["adult", "kids"]) {
      const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
      await page.addInitScript(m => localStorage.setItem("maruanagame-mode", m), mode);
      await page.goto("file://" + path.join(root, "index.html"));
      // スタート画面が立つので、そこから層の一覧へ入る
      await page.waitForSelector("#startGate:not([hidden])");
      await page.click("#sgListBtn");
      await page.waitForSelector("#roundModal.show");
      for (const [stage, tier] of [[0,1],[4,1],[5,2],[9,2],[10,3],[15,3],[16,4],[20,4]]) {
        const expected = `img/maru-${mode === "kids" ? "kids" : "dive"}-${tier}.png`;
        const actual = await page.evaluate(si => {
          roundIndex = STAGES[si][0];
          viewStage = si;
          openRoundList();
          const current = document.querySelector(".stopChar").getAttribute("src");
          travelTo(Math.max(0, si - 1), si);
          const destination = document.querySelector(".tvChar").getAttribute("src");
          document.querySelector("#travel").hidden = true;
          const strip = document.querySelector(".stageStrip");
          return { current, destination, overflow: strip.scrollWidth - strip.clientWidth };
        }, stage);
        assert.equal(actual.current, expected);
        assert.equal(actual.destination, expected);
        assert.equal(actual.overflow, 0);
        const bytes = fs.readFileSync(path.join(root, expected));
        assert.ok(bytes.length <= 40000, expected + " exceeds 40KB");
        assert.equal(bytes.readUInt32BE(20), 360);
      }
      // 演出のタイマーを終えてから、実際のiPhone SEサイズで上下を記録する。
      await page.waitForTimeout(2400);
      await page.evaluate(() => {
        roundIndex = STAGES[0][0]; viewStage = 0; openRoundList();
        document.querySelector(".stageStrip").scrollTop = 0;
      });
      await page.waitForFunction(() => [...document.images].every(i => i.complete));
      assert.equal(await page.locator(".stopChar").evaluate(i => i.naturalHeight), 360);
      await page.screenshot({ path: path.join(__dirname, "shots", `iceberg-${mode}-top.png`) });
      await page.evaluate(() => {
        const strip = document.querySelector(".stageStrip"); strip.scrollTop = strip.scrollHeight;
      });
      await page.screenshot({ path: path.join(__dirname, "shots", `iceberg-${mode}-bottom.png`) });
      assert.equal(await page.evaluate(() => document.body.scrollWidth - innerWidth), 0);
      await page.evaluate(() => {
        // 全体図だけはモーダルのスクロール枠から取り出し、クリップを避ける。
        const strip = document.querySelector(".stripInner").cloneNode(true);
        document.body.replaceChildren(strip);
        document.body.style.cssText = "margin:0;padding:0;display:block;width:321px;height:auto;overflow:visible";
      });
      await page.locator(".stripInner").screenshot({ path: path.join(__dirname, "shots", `iceberg-${mode}-strip.png`) });
      console.log(`${mode}: 全4段階の一覧・移動画像、375px幅、素材読み込み OK`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
