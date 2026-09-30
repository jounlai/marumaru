/* ===========================================================================
 * fx.js — 粒と背景の光
 *
 * Sparkle  … Canvas 2D の粒。紙吹雪・星・火花・コイン・かな・輪・花火。
 *            DOM で1粒ずつ要素を作っていたときは10粒で16ms かかり、
 *            20粒ほどが限界だった。Canvas なら数百粒を1枚に描ける。
 * SeaLight … WebGL の背景。深海に差す光の筋と、揺らぐ光と、昇る光の粒。
 *            熱（連鎖の勢い）が上がるほど濃くなる。熱0のあいだは描かない。
 *
 * どちらも、押した瞬間の処理では「積むだけ」にして、描くのは次のフレーム。
 * 粒が無くなれば描画の繰り返しも止める。
 *
 * 光のにじみ（shadowBlur）は描くたびに計算すると重い。形ごとに一度だけ
 * 小さな Canvas に焼き込み、以後はそれを回して貼るだけにする。
 * =========================================================================== */
"use strict";

const Sparkle = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const CACHE = new Map();

  // 形を一度だけ描いて取っておく。k は描き込みの細かさ（高精細画面のぶん）
  function sprite(key, w, h, glow, paint){
    let s = CACHE.get(key);
    if (s) return s;
    // 焼き込みは1つ数十KB。かなと色の組が増えすぎたら、いったん捨てて作り直す
    if (CACHE.size > 240) CACHE.clear();
    const pad = glow + 2, k = 2;
    const cv = document.createElement("canvas");
    cv.width = Math.ceil((w + pad * 2) * k);
    cv.height = Math.ceil((h + pad * 2) * k);
    const c = cv.getContext("2d");
    c.scale(k, k);
    c.translate(pad + w / 2, pad + h / 2);
    paint(c);
    s = {cv, w: w + pad * 2, h: h + pad * 2};
    CACHE.set(key, s);
    return s;
  }
  function paper(color){
    return sprite("p" + color, 12, 7, 0, c => {
      c.fillStyle = color; c.fillRect(-6, -3.5, 12, 7);
      // 光を受けた面。裏返るときにちらつく
      c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(-6, -3.5, 12, 2.2);
    });
  }
  function star(color){
    return sprite("s" + color, 22, 22, 8, c => {
      c.shadowColor = color; c.shadowBlur = 8;
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 4.6 : 11, a = i / 10 * Math.PI * 2 - Math.PI / 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.fillStyle = color; c.fill();
      c.shadowBlur = 0; c.fillStyle = "rgba(255,255,255,.7)";
      c.beginPath(); c.arc(0, -1, 2.4, 0, 7); c.fill();
    });
  }
  function coin(){
    return sprite("coin", 24, 24, 7, c => {
      c.shadowColor = "#ffcf3a"; c.shadowBlur = 7;
      c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fillStyle = "#ffd23f"; c.fill();
      c.shadowBlur = 0;
      c.lineWidth = 2; c.strokeStyle = "#e39700";
      c.beginPath(); c.arc(0, 0, 7, 0, 7); c.stroke();
      c.fillStyle = "#fff6c8"; c.beginPath(); c.arc(-3.5, -4, 2.2, 0, 7); c.fill();
    });
  }
  function glyph(ch, color){
    return sprite("g" + ch + color, 40, 40, 6, c => {
      c.font = '900 34px "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';
      c.textAlign = "center"; c.textBaseline = "middle";
      c.shadowColor = color; c.shadowBlur = 6;
      c.fillStyle = color; c.fillText(ch, 0, 2);
      c.shadowBlur = 0; c.fillStyle = "rgba(255,255,255,.55)"; c.fillText(ch, 0, 2);
    });
  }

  class Sparkle {
    constructor(canvas, max){
      this.cv = canvas;
      this.c = canvas.getContext("2d");
      this.max = max;
      this.parts = [];
      this.raf = 0;
      this.last = 0;
      this.dpr = 1;
      this.scale = 1;       // 動きを控える設定では減らす
      this.step = this.step.bind(this);
    }
    fit(){
      const d = Math.min(innerWidth < 600 ? 1.5 : 2, window.devicePixelRatio || 1);
      const w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
      this.dpr = d;
    }
    n(count){ return Math.max(1, Math.round(count * this.scale)); }
    /* よく使う形を先に焼いておく。初めて出す瞬間に焼くと、その1フレームが跳ねる */
    warm(colors, glyphs = []){
      const job = () => {
        for (const c of colors) { paper(c); star(c); }
        coin();
        for (const g of glyphs) for (const c of colors) glyph(g, c);
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(job, {timeout: 1500});
      else setTimeout(job, 200);
    }
    add(p){
      // 上限を超えたら古いものから捨てる。画面が粒で埋まり切らないように
      if (this.parts.length >= this.max) this.parts.splice(0, 1 + (this.max * .03 | 0));
      p.age = 0;
      this.parts.push(p);
      this.run();
    }
    run(){
      if (this.raf || typeof requestAnimationFrame !== "function") return;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.step);
    }

    /* 噴き上げ。押したかなから上へ吹き出す */
    burst(x, y, {count = 20, kinds = ["paper"], colors = ["#fff"], glyphs = null, speed = 520,
                 angle = -Math.PI / 2, spread = Math.PI * 2, size = 1, gravity = 1, life = 1} = {}){
      for (let i = 0, n = this.n(count); i < n; i++) {
        const kind = pick(kinds), a = angle + (Math.random() - .5) * spread, v = speed * rand(.35, 1);
        const p = {kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          rot: rand(0, 6.28), vr: rand(-12, 12), flip: rand(0, 6.28), vf: rand(6, 16),
          color: pick(colors), size: size * rand(.75, 1.3), life: rand(1.3, 2.3) * life,
          g: 900 * gravity, drag: .9};
        if (kind === "spark") Object.assign(p, {life: rand(.35, .7) * life, g: 280 * gravity, drag: 2.2});
        if (kind === "star") Object.assign(p, {life: rand(.8, 1.4) * life, g: 480 * gravity, drag: 1.6});
        if (kind === "coin") Object.assign(p, {life: rand(1.3, 2) * life, g: 1300 * gravity, drag: .4, vf: rand(8, 14)});
        if (kind === "glyph") Object.assign(p, {life: rand(1.2, 1.9) * life, g: 700 * gravity, drag: .7, vr: rand(-5, 5)});
        if (glyphs) p.ch = pick(glyphs);
        this.add(p);
      }
    }
    /* 上から降らせる。紙吹雪やかなの雨 */
    rain(count, {kinds = ["paper"], colors = ["#fff"], glyphs = null, size = 1} = {}){
      const W = innerWidth;
      for (let i = 0, n = this.n(count); i < n; i++) {
        const kind = pick(kinds);
        const p = {kind, x: rand(0, W), y: rand(-200, -12), vx: rand(-60, 60), vy: rand(80, 280),
          rot: rand(0, 6), vr: rand(-7, 7), flip: rand(0, 6), vf: rand(4, 11),
          color: pick(colors), size: size * rand(.8, 1.35), life: rand(2.6, 4), g: 140, drag: .55};
        if (glyphs) p.ch = pick(glyphs);
        if (kind === "glyph") Object.assign(p, {g: 420, vr: rand(-3, 3), size: size * rand(.7, 1.4)});
        this.add(p);
      }
    }
    /* 輪。押したところから広がる */
    ring(x, y, {color = "#fff", radius = 120, width = 6, life = .55} = {}){
      this.add({kind: "ring", x, y, vx: 0, vy: 0, color, radius, width, life, g: 0, drag: 0});
    }
    /* 花火。下から打ち上げて、上のほうで弾ける */
    fireworks(count, {colors = ["#ffd23f", "#7ef9d0", "#ff5ab4", "#8fd3ff"], top = .12, bottom = .42} = {}){
      const W = innerWidth, H = innerHeight;
      for (let i = 0, n = this.n(count); i < n; i++) {
        const tx = rand(W * .14, W * .86), ty = rand(H * top, H * bottom);
        this.add({kind: "shell", x: tx + rand(-40, 40), y: H + 20, sx: 0, tx, ty, t0: i * .16,
          life: 3, g: 0, drag: 0, color: pick(colors)});
      }
    }
    pop(p){
      const n = this.n(44);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, v = rand(230, 330);
        this.add({kind: "spark", x: p.tx, y: p.ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: rand(.9, 1.3), g: 150, drag: 1.3, color: i % 3 ? p.color : "#fff", size: 1.3});
      }
      this.ring(p.tx, p.ty, {color: p.color, radius: 110, width: 5, life: .5});
    }

    step(now){
      const dt = Math.min(.05, Math.max(0, now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.draw();
      if (this.parts.length) this.raf = requestAnimationFrame(this.step);
      else {
        this.raf = 0;
        this.c.setTransform(1, 0, 0, 1, 0, 0);
        this.c.clearRect(0, 0, this.cv.width, this.cv.height);
      }
    }
    update(dt){
      const floor = innerHeight + 220;
      for (const p of this.parts) {
        p.age += dt;
        if (p.kind === "shell") {
          if (p.age < p.t0) continue;
          const k = clamp01((p.age - p.t0) / .55), e = 1 - (1 - k) ** 3;
          if (!p.sy) p.sy = p.y;
          p.x += (p.tx - p.x) * Math.min(1, dt * 8);
          p.y = p.sy + (p.ty - p.sy) * e;
          if (k >= 1 && !p.done) { p.done = true; p.life = 0; this.pop(p); }
          continue;
        }
        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += (p.vr || 0) * dt;
        p.flip += (p.vf || 0) * dt;
        if (p.y > floor) p.life = 0;
      }
      // 消えた粒をその場で詰める。毎フレーム新しい配列を作ると、捨てた配列の
      // 片づけ（GC）がまとまって走り、ときどき1フレームが大きく跳ねる
      const a = this.parts;
      let j = 0;
      for (let i = 0; i < a.length; i++) {
        const p = a[i];
        if (p.age < p.life || (p.kind === "shell" && !p.done)) a[j++] = p;
      }
      a.length = j;
    }
    stamp(s, x, y, rot, sx, sy, alpha){
      const c = this.c, d = this.dpr, cos = Math.cos(rot), sin = Math.sin(rot);
      c.globalAlpha = alpha;
      c.setTransform(cos * sx * d, sin * sx * d, -sin * sy * d, cos * sy * d, x * d, y * d);
      c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
    }
    draw(){
      this.fit();
      const c = this.c, d = this.dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      const sparks = this.sparks || (this.sparks = []), rings = this.rings || (this.rings = []);
      sparks.length = 0; rings.length = 0;
      for (const p of this.parts) {
        if (p.kind === "shell") { if (p.age >= p.t0) sparks.push(p); continue; }
        const k = p.age / p.life;
        const fade = k > .72 ? Math.max(0, 1 - (k - .72) / .28) : 1;
        switch (p.kind) {
          case "paper": {
            // 裏返る紙。縦を cos で潰して、表と裏で明るさも変える
            const f = Math.cos(p.flip);
            this.stamp(paper(p.color), p.x, p.y, p.rot, p.size, p.size * f, fade * (.55 + .45 * Math.abs(f)));
            break;
          }
          case "star": {
            const s = .9 * p.size * (k < .15 ? k / .15 : 1);
            this.stamp(star(p.color), p.x, p.y, p.rot, s, s, fade);
            break;
          }
          case "coin":
            this.stamp(coin(), p.x, p.y, 0, p.size * Math.cos(p.flip), p.size, fade);
            break;
          case "glyph":
            this.stamp(glyph(p.ch || "の", p.color), p.x, p.y, p.rot * .25, p.size * .8, p.size * .8, fade);
            break;
          case "spark": sparks.push(p); break;
          case "ring": rings.push(p); break;
        }
      }
      c.setTransform(d, 0, 0, d, 0, 0);
      c.globalCompositeOperation = "lighter";
      for (const p of rings) {
        const k = p.age / p.life, r = p.radius * (1 - (1 - k) ** 3);
        c.globalAlpha = 1 - k;
        c.strokeStyle = p.color; c.lineWidth = p.width * (1 - k) + 1;
        c.beginPath(); c.arc(p.x, p.y, Math.max(.1, r), 0, 7); c.stroke();
      }
      // 火花は光の線。加算で重ねると、重なったところほど白く飛ぶ
      c.lineCap = "round";
      for (const p of sparks) {
        if (p.kind === "shell") {
          c.globalAlpha = .9; c.strokeStyle = p.color; c.lineWidth = 3;
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y + 26); c.stroke();
          continue;
        }
        const k = p.age / p.life;
        c.globalAlpha = k > .72 ? Math.max(0, 1 - (k - .72) / .28) : 1;
        c.strokeStyle = p.color; c.lineWidth = 3 * (p.size || 1) * (1 - k * .6);
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * .045, p.y - p.vy * .045); c.stroke();
      }
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
    }
  }
  return Sparkle;
})();


/* 深海の光。熱が上がるほど、上から光の筋が差し、光が揺らぎ、光の粒が昇る。
 * 画面の半分の細かさで描いて引き伸ばす（光なのでぼけて構わない）。
 * WebGL が使えない、または失われたときは何もしない（今までの黒い背景のまま）。 */
const SeaLight = (() => {
  const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const FRAG = `precision mediump float;
uniform vec2 R;uniform float T;uniform float H;uniform vec3 C;uniform vec3 B;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec2 uv=gl_FragCoord.xy/R;
  float asp=R.x/R.y;
  // 光の筋。画面の上の外から、扇に広がって差し込む
  vec2 d=uv-vec2(.5+.12*sin(T*.07),1.35);d.x*=asp;
  float a=atan(d.x,-d.y);
  float r=smoothstep(.52,1.,sin(a*9.+T*.33)*.5+.5)
         +smoothstep(.62,1.,sin(a*15.-T*.21+1.7)*.5+.5)*.7
         +smoothstep(.7,1.,sin(a*23.+T*.5+.4)*.5+.5)*.35;
  r*=smoothstep(1.7,.2,length(d))*(.35+.65*uv.y);
  // 水面の揺らぎが落とす光
  vec2 q=vec2(uv.x*asp,uv.y)*5.;
  float c=nz(q+vec2(T*.13,T*.09))*nz(q*1.7-vec2(T*.11,T*.17));
  c=pow(c,2.2)*(.4+.6*uv.y);
  // 昇る光の粒
  vec2 g=vec2(uv.x*asp,uv.y+T*.035)*vec2(15.,11.);
  vec2 id=floor(g);vec2 f=fract(g)-.5;
  float s=h21(id);
  vec2 o=vec2(s-.5,fract(s*7.1)-.5)*.6+vec2(.12*sin(T*.8+s*20.),0.);
  float dot1=smoothstep(.09,0.,length(f-o))*step(.62,s)*(.5+.5*sin(T*2.+s*30.));
  // 海は海の色のまま。熱の色は光（筋・揺らぎ・粒）にだけ付ける。
  // 地まで熱の色で塗ると、画面全体が一色に染まって盤面が沈む
  vec3 L=mix(C,vec3(1.),.3);
  vec3 col=B+vec3(0.,.035,.07)*uv.y*H+L*(r*.12+c*.22)*H+L*dot1*H*1.1;
  gl_FragColor=vec4(col,1.);
}`;

  class SeaLight {
    constructor(canvas){
      this.cv = canvas;
      this.ok = false;
      this.raf = 0;
      this.t0 = performance.now();
      this.h = 0;            // 画面に出している熱（本物の熱へ少しずつ寄せる）
      this.step = this.step.bind(this);
      canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); this.ok = false; this.stop(); });
      canvas.addEventListener("webglcontextrestored", () => this.init());
      this.init();
    }
    init(){
      const gl = this.cv.getContext("webgl", {alpha: false, antialias: false, depth: false,
        powerPreference: "low-power", preserveDrawingBuffer: false});
      if (!gl) { this.ok = false; return; }
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const v = sh(gl.VERTEX_SHADER, VERT), f = sh(gl.FRAGMENT_SHADER, FRAG);
      if (!v || !f) { this.ok = false; return; }
      const pr = gl.createProgram();
      gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.ok = false; return; }
      gl.useProgram(pr);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.gl = gl;
      this.u = {R: gl.getUniformLocation(pr, "R"), T: gl.getUniformLocation(pr, "T"),
        H: gl.getUniformLocation(pr, "H"), C: gl.getUniformLocation(pr, "C"), B: gl.getUniformLocation(pr, "B")};
      this.ok = true;
      // 最初の1枚はシェーダーの組み立てで重い。熱が上がった瞬間に跳ねないよう、
      // 見えないうちに一度描いておく
      this.draw(0, performance.now());
    }
    /* aim … 目標の熱（0〜1）。hue … 色相（度）。base … 地の色 [r,g,b]。
       live … いま描いてよいか（遊んでいる画面が見えているか） */
    update(aim, hue, base, live){
      this.aim = aim; this.hue = hue; this.base = base; this.live = live;
      if (this.ok && live && (aim > .01 || this.h > .01)) this.run();
    }
    run(){
      if (this.raf || typeof requestAnimationFrame !== "function") return;
      this.raf = requestAnimationFrame(this.step);
    }
    stop(){
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.cv.style.opacity = "0";
    }
    step(now){
      this.raf = 0;
      if (!this.ok || !this.live || document.hidden) { this.stop(); return; }
      // 光はゆっくり動くので 30fps で足りる。1フレームおきに描く
      this.odd = !this.odd;
      if (this.odd) {
        this.h += (this.aim - this.h) * .12;
        if (this.aim <= .01 && this.h < .01) { this.h = 0; this.stop(); return; }
        this.draw(this.h, now);
        // 熱0のときは完全に消す（今までの黒い画面と見分けがつかないように）
        this.cv.style.opacity = Math.min(1, this.h * 4).toFixed(3);
      }
      this.raf = requestAnimationFrame(this.step);
    }
    draw(h, now){
      const k = innerWidth < 600 ? .4 : .5;
      const w = Math.max(1, Math.round(innerWidth * k)), hgt = Math.max(1, Math.round(innerHeight * k));
      if (this.cv.width !== w || this.cv.height !== hgt) { this.cv.width = w; this.cv.height = hgt; }
      const gl = this.gl, u = this.u;
      gl.viewport(0, 0, w, hgt);
      gl.uniform2f(u.R, w, hgt);
      gl.uniform1f(u.T, (now - this.t0) / 1000);
      gl.uniform1f(u.H, h);
      gl.uniform3fv(u.C, hsl(this.hue || 160, 1, .6));
      gl.uniform3fv(u.B, this.base || [.02, .03, .05]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  function hsl(h, s, l){
    h = ((h % 360) + 360) % 360 / 360;
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  return SeaLight;
})();
