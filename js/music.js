/* 「ことばポップ！」— 16小節のオリジナル・アーケードBGM。
 * 四つ打ち、跳ねるベース、裏拍のコード、きらきらしたシンセのフック。
 * 深いステージでも明るいまま、フィルとアルペジオで勢いを増す。
 */
"use strict";
const IcebergMusic = (() => {
  const MAJOR = [62, 64, 66, 69, 71, 74, 76, 78];
  // 8分音符の位置と音階番号。短いフック→返事→高い音域のサビ→ターン。
  const MELODY = [
    [[0,0],[1,2],[2,3],[3.5,4],[5,3],[6,2],[7,1]],
    [[0,2],[1,2],[2.5,4],[4,3],[5.5,2],[7,0]],
    [[0,4],[1,3],[2,2],[3.5,1],[5,2],[6,4],[7,5]],
    [[0,3],[1.5,1],[3,3],[4,4],[5,3],[6.5,1]],
    [[0,0],[1,2],[2,3],[3.5,5],[5,4],[6,3],[7,2]],
    [[0,4],[1,4],[2.5,5],[4,3],[5.5,2],[7,3]],
    [[0,2],[1,1],[2,0],[3.5,2],[5,4],[6,3],[7,2]],
    [[0,1],[1.5,3],[3,4],[4,3],[5,1],[6,0]],
    [[0,5],[1,5],[2,7],[3.5,6],[5,5],[6,4],[7,3]],
    [[0,4],[1,5],[2.5,4],[4,3],[5,2],[6.5,3]],
    [[0,4],[1,5],[2,7],[3.5,5],[5,4],[6,3],[7,2]],
    [[0,3],[1,4],[2.5,6],[4,5],[5,3],[6.5,1]],
    [[0,5],[1,3],[2,2],[3.5,3],[5,5],[6,4],[7,3]],
    [[0,4],[1,3],[2.5,2],[4,3],[5,4],[6.5,5]],
    [[0,4],[1,3],[2,2],[3.5,1],[5,2],[6,3],[7,4]],
    [[0,3],[1,1],[2.5,3],[4,1],[5,0],[6.5,1]]
  ];
  const LIGHT = [[50,57,59,66],[47,54,57,62],[43,50,54,59],[45,52,57,64]];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  function arrangement(scene){
    const tier = Math.max(0, Math.min(3, scene.stage < 5 ? 0 : scene.stage < 10 ? 1 : scene.stage < 16 ? 2 : 3));
    const kids = scene.mode === "kids";
    return { tier, kids, bpm: kids ? 132 : [128,130,132,134][tier],
      cutoff: kids ? 6400 : 7000, sparkle: kids || tier >= 2 };
  }
  function graph(c){
    const filter = c.createBiquadFilter(), gain = c.createGain();
    filter.type = "lowpass"; filter.Q.value = .45;
    gain.gain.value = .72;
    filter.connect(gain).connect(c.destination);
    // ドラムも合成。固定シードで試聴とゲームの音色を揃える。
    const noise = c.createBuffer(1, Math.ceil(c.sampleRate * .3), c.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 7331;
    for (let i = 0; i < data.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      data[i] = (seed >>> 0) / 2147483648 - 1;
    }
    const g = { c, filter, gain, noise, voices: new Set(), stopped: false };
    g.dispose = () => { filter.disconnect(); gain.disconnect(); };
    return g;
  }
  function voice(g, source, time, length, volume, pan, attack, shaping){
    const c = g.c, envelope = c.createGain();
    const position = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    if (position.pan) position.pan.value = pan;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + attack);
    envelope.gain.exponentialRampToValueAtTime(.00001, time + length);
    envelope.gain.setValueAtTime(0, time + length + .01);
    if (shaping) source.connect(shaping).connect(envelope);
    else source.connect(envelope);
    envelope.connect(position).connect(g.filter);
    g.voices.add(source);
    source.onended = () => {
      source.disconnect(); envelope.disconnect(); position.disconnect();
      if (shaping) shaping.disconnect();
      g.voices.delete(source);
      if (g.stopped && !g.voices.size) g.dispose();
    };
    source.start(time); source.stop(time + length + .02);
  }
  function note(g, pitch, time, length, volume, type = "sine", pan = 0, attack = .006, slide){
    const oscillator = g.c.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(midi(pitch), time);
    if (slide !== undefined) oscillator.frequency.exponentialRampToValueAtTime(midi(slide), time + length * .7);
    voice(g, oscillator, time, length, volume, pan, attack);
  }
  function noiseHit(g, time, length, volume, frequency, type, pan){
    const source = g.c.createBufferSource(), filter = g.c.createBiquadFilter();
    source.buffer = g.noise;
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = .65;
    voice(g, source, time, length, volume, pan, .003, filter);
  }
  function bar(g, time, index, scene){
    const a = arrangement(scene), eighth = 30 / a.bpm;
    const chord = LIGHT[index % 4];
    g.filter.frequency.setTargetAtTime(a.cutoff, time, .5);
    // 四つ打ちキックと2・4拍のクラップ。主旋律より低い位置で支える。
    [0,2,4,6].forEach(step => note(g, 47, time + step * eighth,
      .18, .12, "sine", 0, .004, 29));
    [2,6].forEach(step => {
      const at = time + step * eighth;
      noiseHit(g, at, .105, .058, 1900, "bandpass", .08);
      noiseHit(g, at + .014, .09, .028, 2600, "bandpass", -.08);
      note(g, 50, at, .09, .024, "triangle");
    });
    for (let step = 0; step < 8; step++) {
      noiseHit(g, time + step * eighth, step % 2 ? .1 : .04,
        step % 2 ? .025 : .014, 6500, "highpass", .3);
    }
    // ルート→オクターブ→5度。短く切って、裏拍のコードと噛み合わせる。
    [[0,0],[1.5,12],[2.5,7],[4,0],[5.5,12],[7,7]].forEach(([step,offset]) => {
      const pitch = chord[0] - 12 + offset, at = time + step * eighth;
      note(g, pitch, at, eighth * .86, .071, "triangle");
      note(g, pitch, at, eighth * .8, .029, "sine");
    });
    [1,3,5,7].forEach(step => chord.forEach((p,i) => {
      const at = time + step * eighth;
      note(g, p + 12, at, eighth * .72, .019, "triangle", (i - 1.5) * .25);
      note(g, p + 12, at, eighth * .5, .0035, "square", (i - 1.5) * .25);
    }));
    MELODY[index % 16].forEach(([step, degree]) => {
      const pitch = MAJOR[degree] + 12;
      const at = time + step * eighth;
      note(g, pitch, at, eighth * 1.25, .061, "triangle", -.12);
      note(g, pitch, at, eighth * .9, .009, "square", .12);
      note(g, pitch + 12, at, eighth * .65, .014, "sine", .1);
      note(g, pitch, at + eighth * .75, eighth * .8, .01, "sine", .5);
    });
    if (a.sparkle || index % 16 >= 8) {
      [0.5,2.5,4.5,5.5,6.5,7.5].forEach((step,i) => note(g,
        chord[i % 4] + 36, time + step * eighth, eighth * .55, .013, "sine", i % 2 ? .55 : -.55));
    }
    // 4小節ごとの小さなフィルで次のフレーズへ。
    if (index % 4 === 3) {
      [6.5,7,7.5].forEach((step,i) => {
        noiseHit(g, time + step * eighth, .06, .019 + i * .006, 2200, "bandpass", 0);
        note(g, 62 + i * 3, time + step * eighth, .08, .023, "triangle", -.25 + i * .25);
      });
    }
    return eighth * 8;
  }
  function create(c, getScene){
    let output = null, timer = null, next = 0, index = 0;
    function tick(){
      if (!output || c.state !== "running") return;
      // スリープから戻ったとき、過去の小節をまとめて鳴らさない。
      if (next < c.currentTime) next = c.currentTime + .05;
      if (next < c.currentTime + .2) {
        next += bar(output, next, index, getScene());
        index = (index + 1) % 16;
      }
    }
    return {
      get playing(){ return timer !== null; },
      start(){
        if (timer !== null) return;
        output = graph(c); next = c.currentTime + .06;
        tick(); timer = setInterval(tick, 100);
      },
      stop(){
        if (timer !== null) clearInterval(timer);
        timer = null;
        if (!output) return;
        const old = output; output = null; old.stopped = true;
        old.gain.gain.cancelScheduledValues(c.currentTime);
        old.gain.gain.setValueAtTime(old.gain.gain.value, c.currentTime);
        old.gain.gain.linearRampToValueAtTime(0, c.currentTime + .04);
        for (const oscillator of old.voices) oscillator.stop(c.currentTime + .05);
        if (!old.voices.size) old.dispose();
      }
    };
  }
  // 試聴ファイルと検査にも、ゲームと同じ楽譜・音源を使う。
  function render(c, scene, bars = 16, start = 0){
    const output = graph(c);
    let end = start;
    for (let i = 0; i < bars; i++) end += bar(output, end, i, scene);
    return end;
  }
  return { create, render, arrangement };
})();
