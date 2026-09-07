const { chromium } = require("playwright");
const OUT="/tmp/claude-1000/-home-jounlai-marumaru/618ffd1b-29d0-4814-ab24-0207418b9e74/scratchpad";
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const p=await ctx.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:8000/index.html"); await p.waitForTimeout(300);
  await p.click('[data-mode="kids"]'); await p.waitForLoadState("load"); await p.waitForSelector("#roundModal.show"); await p.waitForTimeout(250);
  // 正解が少ないラウンドを選んでクリアまで持っていく
  const btns = await p.$$("#roundList .roundChoice");
  for (const btn of btns) { if ((await btn.textContent()).includes("〇き")) { await btn.click(); break; } }
  await p.waitForTimeout(400);
  for(const k of ["と","さ","つ","す"]){ const el=await p.$(`.kana[data-kana="${k}"]:not(:disabled)`); if(el){await el.click(); await p.waitForTimeout(700);} }
  await p.waitForTimeout(2500);
  await p.screenshot({path:`${OUT}/bar-kids.png`});
  console.log("バー:", await p.evaluate(()=>document.querySelector("#doneBar").className), "|", await p.evaluate(()=>document.querySelector("#doneMsg").textContent.trim()));
  console.log("エラー:", errs.length?errs[0]:"なし");
  await b.close();
})();
