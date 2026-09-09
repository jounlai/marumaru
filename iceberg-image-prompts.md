# 氷山素材の制作記録

`iceberg-assets.md` のA〜Eを、組み込みの `image_gen` で生成。CLI/APIは使用していない。
原画の保存先は `/home/jounlai/.codex/generated_images/01a083a3-883c-70d3-b9a7-f295be74be6e/`。
最終素材はすべて `img/` に保存した。任意のFは未作成。

## 最終画像

- `iceberg.png`: 480×2400。原画の水面を384pxに合わせて上下をリサイズし、不透明度を40%に調整。
- `maru-dive.png` / `maru-dive-1.png`〜`-4.png`: 240×360。BはCの1枚目と同じ画像。
- `maru-kids-1.png`〜`-4.png`: 240×360。浮き輪、シュノーケル、潜水服、潜水艇。
- `ogp.png`: 1200×630。40KB制限に合わせ、48色に減色。縮小時のお題の読みやすさを優先。

寸法調整・PNG減色にはFFmpegとNodeを使用し、アプリの依存は増やしていない。
透過はアルファ値も検査。市松模様が焼き込まれた2枚は、再生成後に無彩色の背景を除去して仕上げた。

## 使用プロンプト

### iceberg.png

Create game asset img/iceberg.png, genuine transparent PNG 480 x 2400 pixels. Flat illustrated iceberg, pale icy blue #dff1ff to #4a86ad, overall translucent 35-45% opacity, no background ocean. Small above-water peak in top 16% of canvas, exact waterline at y=384, enormous submerged mass below (ratio at least 1:5), narrowing darkening downward and fading completely transparent at bottom with no visible endpoint. Centered, sparse planar cracks, no dark patterns in x=90-100 strip for UI numbers. No text, no border, no photorealism. Preserve waterline at exactly 16% even if canvas size requires adjustment.

### maru-dive-1.png

参照: `img/maru-run.png`。

Use case: illustration-story. Reference image is exact character identity and flat cartoon style. Generate a single transparent PNG sprite of same Maru-kun diving straight DOWN head first, both arms extended down beyond head, legs together above, red cape streaming UP. White disc head with red の emblem exactly as reference (this emblem IS the face, do not replace with a human face), white body #ebecf1 shadow #b0b4ce, thin dark navy #131e54 outline, red cape #ed0f1e. Add simple blue swimming goggles over emblem suggesting relaxed expression. Entire body visible, centered, height 360px with proportional width, transparent canvas with small even margins. Flat solid limited colors, no texture, no shadows outside character, no text other than identity emblem. Must read at 32px. This is adult depth tier 1, confident and fresh.

### maru-dive-2.png

参照: dive-1原画。

Edit target: reference diving mascot. Create tier 2 variant. Preserve EXACT canvas size, pose, position, head center, silhouette, navy outline and flat coloring, red の emblem face. Only change: goggles now slightly squinting and stressed, add large tired blue crescent cheek shadows, red cape slightly worn at edges. Comical mildly weary explorer, never horror. Genuine transparent background: remove ALL external colored glow/shadow/halo, empty pixels outside character fully transparent. Solid flat colors within character, clean navy edges. No additional text.

### maru-dive-3.png

参照: dive-1原画。

Create adult tier 3 variation of this exact diving mascot sprite. LOCK canvas, pose, size and position exactly. Preserve white disc head red の emblem, white suit navy outlines, head-down arms-down feet-up red cape-up. Add comically unshaven navy stubble beard around lower rim of round head, heavy half-closed determined goggle eyes, large tired blue cheek shadows and torn frayed red cape. Funny exhausted explorer, not scary. FLAT solid coloring. Background fully transparent alpha=0, no glow, no aura or shadow. Single sprite no other text.

### maru-dive-4.png

参照: dive-3原画。

Edit tier 3 diving mascot into tier 4 at ultimate depth. Exact same canvas framing pose and position. Head-down white disc-headed red の superhero. Eyes inside goggles now large glowing pale golden discs, thick shaggy navy beard around head rim, dark cheek shadows. Cape very ragged with several missing chunks. Deadpan exhausted comedic explorer, no smile, no horror. Keep red の recognizable. Flat limited palette, absolutely transparent empty background with zero glow or shadow outside character. All other proportions and positions identical.

採用原画への修正指示:

Use case background-extraction. Remove the baked gray checkerboard completely and export genuine alpha transparency PNG: exterior pixels must have alpha ZERO, including cape holes and between limbs. Do NOT draw a checkerboard. Also remove digit 4 from belt buckle leaving plain white buckle. Preserve the character artwork, pose, exact size and coordinates unchanged. No shadow or glow. Single cutout transparent sprite.

### maru-kids-1.png

参照: `img/maru-run.png` と dive-1原画。

Single kids tier 1 game sprite transparent PNG. First reference exact character identity, second diving pose reference only. White disc head with red の mark, white suit and red cape, dark navy outlines. Head down, hands stretching down, feet above, cape trailing upward. Bright yellow inflatable swim ring around waist, friendly joyful closed happy eyes added on face, no goggles yet. Compact cute original mascot proportions with BIG round head; thick clean navy lines and flat bright solid fills. 360px tall canvas proportional width, genuine alpha transparent background, no checkerboard, no glow, no background, no scene, no extra writing or numbers.

### maru-kids-2.png

参照: kids-1原画。

Edit this sprite: replace yellow swim ring with cyan goggles and orange snorkel on head, happy curved eyes and rosy cheeks visible. Keep exact same pose canvas and position, all other artwork unchanged. Preserve genuine alpha transparency. Empty transparent pixels should have black RGB, not gray patterns. Render transparent RGBA PNG cutout, no checker pattern anywhere.

### maru-kids-3.png

参照: kids-1原画。

Create kids tier 3 diving sprite. Same white disc head red の identity, same head-down diving pose hands below head and feet above. Replace swim ring with bright orange and yellow diving suit and big circular diving helmet around the head, clear blue glass shows happy curved eyes, rosy cheeks and red の face. Red cape flows up. Friendly confident explorer, compact strong silhouette. Transparent PNG with alpha zero background, no glow no shadow no checkerboard pattern. Flat bright solid colors thick navy outlines. Same vertical canvas placement and size as reference.

### maru-kids-4.png

参照: `img/maru-run.png`。

Single kids tier 4 game sprite, small cheerful YELLOW SUBMARINE pointing straight downward, tail propeller at top and rounded nose at bottom, small red fins like superhero cape. Big circular cyan glass porthole low in body showing Maru-kun: white circular disc head with bright red の emblem and smiling happy curved eyes, rosy cheeks. Same navy #131e54 outlines white #ebecf1 red #ed0f1e identity as reference. Bright yellow #ffd42a orange #ff8a1f blue #38a9ea, flat solid colors with sparse highlights, thick clean outlines easy to read at 32px. No scenery, no writing except red の identity, no digits, no glow. Genuine transparent alpha PNG canvas height360px proportional width, full sub centered with small even margins.

### ogp.png

参照: `img/logo.png` と dive-1原画。

Use case ads-marketing. Create Japanese word game SNS card, 1200x630 PNG. Left 60% has HUGE legible exact Japanese prompt 「〇んこう」 in bold rounded white Japanese typography, with 〇 golden yellow #ffd34d. Text must dominate and be readable on small timeline thumbnails. Right shows flat pale blue iceberg, tiny above-water tip and much larger submerged tapering mass descending into dark navy sea, and small head-down diving Maru-kun from second reference. Ocean sky blue at top 16%, deep blue to almost black at bottom. Small exact colorful game logo from first reference at bottom left with breathing room, reproduce its shapes faithfully. Flat clean limited palette, no photographic textures, no grain, no decorative extra text. No borders. Export PNG 1200x630, preserve alpha where appropriate.

## 確認

`node tests/iceberg.js` は両モードの段階の境目で一覧と移動演出の画像を確認し、375×667の一覧上下と氷山全体のスクリーンショットを `tests/shots/iceberg-*.png` に出力する。
