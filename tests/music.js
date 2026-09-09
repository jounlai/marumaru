// 実際のWebAudioで再生・消音・復帰と音声出力を確認する。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");
const url = "file://" + path.join(root, "index.html");

function wav(channels, rate){
  const samples = channels[0].length, b = Buffer.alloc(44 + samples * 4);
  b.write("RIFF"); b.writeUInt32LE(b.length - 8, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write("data", 36);
  b.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) for (let c = 0; c < 2; c++)
    // 試聴用は単独で聴きやすい音量にする。ゲーム内では効果音より控えめ。
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i] * 3)) * 32767), 44 + (i * 2 + c) * 2);
  return b;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width:375,height:667}});
    fs.mkdirSync(path.join(__dirname,"shots"),{recursive:true});
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(() => localStorage.setItem("maruanagame-mode", "adult"));
    await page.reload();
    assert.equal(await page.evaluate(() => actx === null), true, "操作前に自動再生しない");
    await page.click("#sgStartBtn");
    await page.waitForFunction(() => actx?.state === "running" && musicPlayer?.playing);
    await page.evaluate(() => openMenu());
    await page.click("#soundBtn");
    assert.deepEqual(await page.evaluate(() => [soundOn,musicOn,musicPlayer.playing]), [false,true,true]);
    await page.click("#musicBtn");
    assert.equal(await page.evaluate(() => musicPlayer.playing), false);
    await page.goto(url);
    await page.click("#sgStartBtn");
    assert.deepEqual(await page.evaluate(() => [soundOn,musicOn,actx]), [false,false,null]);
    await page.evaluate(() => openMenu());
    await page.click("#musicBtn");
    await page.waitForFunction(() => actx?.state === "running" && musicPlayer?.playing);
    assert.equal(await page.evaluate(() => soundOn), false, "BGMだけを再生できる");
    await page.evaluate(() => {
      dispatchEvent(new Event("pagehide")); dispatchEvent(new Event("focus"));
    });
    assert.equal(await page.evaluate(() => musicPlayer.playing), false, "ページ離脱中は復帰しない");
    await page.evaluate(() => dispatchEvent(new Event("pageshow")));
    assert.equal(await page.evaluate(() => musicPlayer.playing), true);
    await page.evaluate(() => {
      Object.defineProperty(document,"hidden",{value:true,configurable:true});
      Object.defineProperty(document,"visibilityState",{value:"hidden",configurable:true});
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.evaluate(() => musicPlayer.playing), false);
    await page.evaluate(() => {
      delete document.hidden; delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(await page.evaluate(() => musicPlayer.playing), true);
    // 連打や重複する復帰イベントでも同じプレイヤーを使う。
    assert.equal(await page.evaluate(() => {
      const original = musicPlayer;
      for (let i=0;i<10;i++) { resumeAudio(); unlockAudio(); }
      return original === musicPlayer;
    }), true);
    await page.click("#musicBtn");
    await page.click("#soundBtn");
    assert.deepEqual(await page.evaluate(() => [soundOn,musicOn,musicPlayer.playing]), [true,false,false]);
    assert.equal(await page.locator("#musicBtn").getAttribute("aria-pressed"), "false");
    await page.screenshot({path:path.join(__dirname,"shots","music-menu-iphone-se.png")});
    // 旧セーブの消音を引き継ぐ（BGMが追加されても突然音を出さない）。
    await page.evaluate(() => {
      const save = serializeProgress(); delete save.musicOn; save.soundOn = false;
      localStorage.setItem(saveKeyFor(mode),JSON.stringify(save));
    });
    await page.reload();
    assert.deepEqual(await page.evaluate(() => [soundOn,musicOn]), [false,false]);

    const arrangements = await page.evaluate(() => [
      IcebergMusic.arrangement({mode:"adult",stage:0}),
      IcebergMusic.arrangement({mode:"adult",stage:20}),
      IcebergMusic.arrangement({mode:"kids",stage:20})
    ]);
    assert.ok(arrangements.every(a => a.bpm >= 128 && a.cutoff >= 6000), "全モード・深度で明るく軽快");
    assert.ok(arrangements[1].bpm >= arrangements[0].bpm, "深海でもテンポを落とさない");
    assert.equal(arrangements[1].sparkle,true);
    assert.equal(arrangements[2].sparkle,true);

    // 小節の継ぎ目を含む実音声を描画。無音・NaN・クリッピングを検出する。
    for (const [name, scene] of [
      ["surface",{mode:"adult",stage:0}],
      ["deep",{mode:"adult",stage:20}],
      ["kids",{mode:"kids",stage:20}]
    ]) {
      const audio = await page.evaluate(async ({scene,preview}) => {
        const rate = 22050, bars = preview ? 16 : 4;
        const duration = bars * 240 / IcebergMusic.arrangement(scene).bpm;
        const c = new OfflineAudioContext(2,Math.ceil((duration+3)*rate),rate);
        IcebergMusic.render(c,scene,bars,.03);
        const buffer = await c.startRendering();
        const left = buffer.getChannelData(0);
        let peak=0,sum=0,jump=0;
        for(let i=0;i<left.length;i++) {
          peak=Math.max(peak,Math.abs(left[i])); sum+=left[i]*left[i];
          if(i) jump=Math.max(jump,Math.abs(left[i]-left[i-1]));
        }
        return {peak,rms:Math.sqrt(sum/left.length),jump,rate,
          channels:preview ? [Array.from(left),Array.from(buffer.getChannelData(1))] : null};
      }, {scene,preview:process.argv.includes("--preview")});
      assert.ok(Number.isFinite(audio.rms) && audio.rms>.003, name+" must be audible");
      assert.ok(audio.peak<.5, name+" leaves headroom for effects");
      assert.ok(audio.jump<.08, name+" has no discontinuities");
      if(audio.channels) {
        const dir=path.join(root,"output","music"); fs.mkdirSync(dir,{recursive:true});
        fs.writeFileSync(path.join(dir,`kotoba-no-umi-${name}.wav`),wav(audio.channels,audio.rate));
      }
      console.log(`${name}: RMS=${audio.rms.toFixed(4)}, peak=${audio.peak.toFixed(4)}, jump=${audio.jump.toFixed(4)}`);
    }
    assert.deepEqual(errors,[]);
    console.log("BGM: 再生・個別消音・設定保存・旧セーブ・背景停止・復帰・実音声 OK");
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
