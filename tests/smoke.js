// jsdom で index.html を読み込み、実際にプレイして挙動を検証する。
// ブラウザの classic script はトップレベル const を共有するため、
// data.js + game.js + テスト本体を1つの eval にまとめて同じスコープで動かす。
const fs = require("fs");
const { JSDOM } = require("jsdom");

const ROOT = "/home/jounlai/marumaru";
const html = fs.readFileSync(ROOT + "/index.html", "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
window.localStorage.clear();
window.navigator.vibrate = () => true;
window.AudioContext = function () { throw new Error("no audio in jsdom"); };

const errors = [];
window.addEventListener("error", e => errors.push("window error: " + e.message));

const src = [
  fs.readFileSync(ROOT + "/js/data.js", "utf8"),
  fs.readFileSync(ROOT + "/js/game.js", "utf8"),
  fs.readFileSync(__dirname + "/testbody.js", "utf8")
].join("\n;\n");

window.eval(src);

setTimeout(() => {
  const r = window.__result || { log: ["(テスト本体が完了しなかった)"], failed: 1 };
  console.log(r.log.join("\n"));
  if (errors.length) console.log("\nRUNTIME ERRORS:\n" + errors.join("\n"));
  console.log(r.failed ? `\n=== ${r.failed} 件失敗 ===` : "\n=== すべて成功 ===");
  process.exitCode = (r.failed || errors.length) ? 1 : 0;
}, 1500);
