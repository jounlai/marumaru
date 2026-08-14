// 棒人間のアニメーションをコマ送りで撮り、1枚のシートに並べて確認する
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = __dirname + "/shots";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4 });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto("file://" + require("path").join(__dirname, "..", "index.html"));
  await page.waitForTimeout(300);
  await page.click('#roundList .roundChoice[data-round="0"]');
  await page.waitForTimeout(300);

  // 棒人間だけを大きく撮るため、確認用に拡大表示する
  await page.addStyleTag({ content: `
    #track{height:210px !important}
    #mascot{transform:translateX(-50%) scale(4) !important;transform-origin:bottom center}
    #mBubble{display:none !important}
    #goal{display:none !important}
  `});
  await page.waitForTimeout(200);

  const box = { x: 108, y: 92, width: 175, height: 230 };
  const frames = async (label, count, stepMs, trigger) => {
    if (trigger) await page.evaluate(trigger);
    const files = [];
    for (let i = 0; i < count; i++) {
      const f = `${OUT}/frame-${label}-${String(i).padStart(2, "0")}.png`;
      await page.screenshot({ path: f, clip: box });
      files.push(f);
      await page.waitForTimeout(stepMs);
    }
    return files;
  };

  // 歩行：1サイクル(0.92s)を8コマ
  await page.evaluate(() => {
    mascotEl.classList.add("walking");
    mascotEl.style.left = "50%";
  });
  await page.waitForTimeout(200);
  await frames("walk", 8, 115);
  await page.evaluate(() => mascotEl.classList.remove("walking"));

  // 正解ジャンプ 0.8s を8コマ
  await frames("cheer", 8, 100, () => mascotPose("cheer", 820));
  await page.waitForTimeout(600);

  // 転倒 1.5s を10コマ
  await frames("fall", 10, 150, () => mascotPose("down", 1520));
  await page.waitForTimeout(600);

  // 宙返り 1.3s を10コマ
  await frames("spin", 10, 130, () => mascotPose("spin", 1320));

  console.log(errs.length ? "JSエラー: " + errs.join(" | ") : "JSエラーなし");
  await browser.close();
})();
