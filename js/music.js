/* 「ことばの海」— 16小節のオリジナルBGM。
 * オルゴール、柔らかな和音、泡の返事。音声ファイルや外部ライブラリは使わない。
 * 深度の変化は小節の境目で反映し、旋律を切らずに海の色を変える。
 */
"use strict";
const IcebergMusic = (() => {
  const MAJOR = [62, 64, 66, 69, 71, 74, 76, 78];
  const MINOR = [62, 64, 65, 69, 70, 74, 76, 77];
  // 8分音符の位置と音階番号。休符を残して、考える時間を邪魔しない。
  const MELODY = [
    [[0,0],[2,2],[3,3],[6,1]], [[0,2],[3,4],[6,3]],
    [[0,2],[2,1],[4,0],[7,1]], [[0,3],[4,1]],
    [[0,0],[2,2],[4,5],[6,4]], [[0,3],[3,2],[6,1]],
    [[0,2],[3,1],[5,0]],       [[0,1],[4,0]],
    [[0,5],[2,4],[4,3],[7,2]], [[0,4],[3,3],[6,2]],
    [[0,2],[2,3],[4,5],[6,4]], [[0,3],[4,1]],
    [[0,2],[2,1],[4,0],[6,2]], [[0,3],[3,4],[6,3]],
    [[0,2],[3,1],[5,0]],       [[0,1],[3,0]]
  ];
  const LIGHT = [[50,57,59,66],[47,54,57,62],[43,50,54,59],[45,52,57,64]];
  const DEEP = [[50,57,60,65],[46,53,57,62],[43,50,57,62],[45,52,55,62]];
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  function arrangement(scene){
    const tier = Math.max(0, Math.min(3, scene.stage < 5 ? 0 : scene.stage < 10 ? 1 : scene.stage < 16 ? 2 : 3));
    const kids = scene.mode === "kids";
    return { tier, kids, bpm: kids ? 94 : [84,80,76,72][tier],
      dark: !kids && tier >= 2, cutoff: kids ? 4200 : [3600,2600,1700,1100][tier] };
  }
  function graph(c){
    const filter = c.createBiquadFilter(), gain = c.createGain();
    filter.type = "lowpass"; filter.Q.value = .45;
    gain.gain.value = .48;
    filter.connect(gain).connect(c.destination);
    const g = { c, filter, gain, voices: new Set(), stopped: false };
    g.dispose = () => { filter.disconnect(); gain.disconnect(); };
    return g;
  }
  function note(g, pitch, time, length, volume, type = "sine", pan = 0, attack = .012){
    const c = g.c, oscillator = c.createOscillator(), envelope = c.createGain();
    const position = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
    if (position.pan) position.pan.value = pan;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(midi(pitch), time);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + attack);
    envelope.gain.exponentialRampToValueAtTime(.00001, time + length);
    envelope.gain.setValueAtTime(0, time + length + .01);
    oscillator.connect(envelope).connect(position).connect(g.filter);
    g.voices.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect(); envelope.disconnect(); position.disconnect();
      g.voices.delete(oscillator);
      if (g.stopped && !g.voices.size) g.dispose();
    };
    oscillator.start(time); oscillator.stop(time + length + .02);
  }
  function bar(g, time, index, scene){
    const a = arrangement(scene), eighth = 30 / a.bpm;
    const scale = a.dark ? MINOR : MAJOR;
    const chord = (a.dark ? DEEP : LIGHT)[index % 4];
    g.filter.frequency.setTargetAtTime(a.cutoff, time, .5);
    // 和音はゆっくり立ち上がり、次の小節に少し重なる。
    chord.forEach((p, i) => note(g, p + 12, time, eighth * 9, .013,
      "sine", (i - 1.5) * .3, .6));
    note(g, chord[0] - 12, time, eighth * 3.7, .055, "sine", 0, .06);
    note(g, chord[0] - 12, time + eighth * 4, eighth * 3.7, .035, "sine", 0, .06);
    const phrase = MELODY[index % 16];
    phrase.forEach(([step, degree], i) => {
      if (!a.kids && a.tier === 3 && i % 2) return;
      const pitch = scale[degree] + (a.dark ? 0 : 12);
      const at = time + step * eighth;
      note(g, pitch, at, eighth * 2.6, .055, "sine", -.18);
      note(g, pitch + 12, at, eighth * .8, .011, "sine", -.18);
      // 右側から短く返る残響。フィードバックを使わず必ず消える。
      note(g, pitch, at + eighth * .75, eighth * 2, .012, "sine", .45);
    });
    if (a.kids || a.tier < 2) {
      [1,3,5,7].forEach((step, i) => note(g, chord[(i + index) % 4] + 24,
        time + step * eighth, eighth * .8, a.kids ? .016 : .009, "triangle", i % 2 ? .5 : -.5));
    } else {
      note(g, scale[(index + 3) % 5] + 12, time + eighth * 5.5, eighth * 1.8,
        .013, "sine", .5);
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
