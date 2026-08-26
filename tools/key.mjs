// Magenta chroma key → sprite with a real alpha channel.
//
// The template's cutout.mjs keys cobalt (b - max(r,g)). PAWS OFF shoots on
// magenta, so the measure is `min(r,b) - g` instead: magenta is high in red AND
// blue and low in green, and a grey animal — which is what every base sprite is,
// so it can be tinted — sits at exactly zero on that measure. Cobalt would have
// been the wrong screen here: a grey cat on blue is only a little less blue than
// the wall behind it.
//
// Three things beyond a threshold, each of which was needed by one of the three
// styles in the probe round:
//   - THRESHOLD SAMPLED FROM THE FRAME'S OWN BORDER. Midjourney never returns
//     the same magenta twice, and it vignettes.
//   - FLOOD FROM THE EDGE, so a magenta-ish pocket enclosed by the subject
//     survives and a cast shadow on the backdrop — which is darker magenta,
//     connected to the border — is eaten.
//   - LARGEST COMPONENT ONLY, which drops the stray specks the felt style
//     leaves around the rim.
//
//   node tools/key.mjs <in.png> <out.png> [height]

import { readFile, writeFile } from "node:fs/promises"
import { readPNG, writePNG } from "../src/server/png.mjs"
import { trim, resize } from "./cutout.mjs"

export function key(img, opts = {}) {
  const { w, h, rgba } = img
  const mag = new Int16Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    mag[i] = Math.min(r, b) - g
  }

  // Sample the border: the backdrop is whatever is at the frame edge.
  const edge = []
  for (let x = 0; x < w; x += 2) { edge.push(mag[x]); edge.push(mag[(h - 1) * w + x]) }
  for (let y = 0; y < h; y += 2) { edge.push(mag[y * w]); edge.push(mag[y * w + w - 1]) }
  edge.sort((a, b) => a - b)
  const edgeLo = edge[Math.floor(edge.length * 0.05)]
  const lo = opts.lo ?? Math.max(12, Math.round(edgeLo * 0.45))
  const hi = opts.hi ?? Math.max(lo + 10, Math.round(edgeLo * 0.85))

  const bg = new Uint8Array(w * h)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (bg[i] || mag[i] < lo) return
    bg[i] = 1; stack.push(i)
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
  while (stack.length) {
    const i = stack.pop()
    const x = i % w, y = (i / w) | 0
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
  }

  const alpha = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    alpha[i] = bg[i] ? Math.max(0, Math.min(1, 1 - (mag[i] - lo) / (hi - lo))) : 1
  }

  // Keep only the biggest blob of subject. A soft-lit felt toy leaves a halo of
  // specks that a threshold cannot tell from a whisker.
  const lab = new Int32Array(w * h).fill(-1)
  let bestId = -1, bestN = 0, id = 0
  for (let s = 0; s < w * h; s++) {
    if (lab[s] >= 0 || alpha[s] < 0.5) continue
    let n = 0; const st = [s]; lab[s] = id
    while (st.length) {
      const i = st.pop(); n++
      const x = i % w, y = (i / w) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (lab[j] >= 0 || alpha[j] < 0.5) continue
        lab[j] = id; st.push(j)
      }
    }
    if (n > bestN) { bestN = n; bestId = id }
    id++
  }
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && lab[i] !== bestId) alpha[i] = 0

  // Soften only the cut line.
  const blur = Float32Array.from(alpha)
  for (let pass = 0; pass < 2; pass++) {
    const src = Float32Array.from(blur)
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (src[i] === 1 && src[i - 1] === 1 && src[i + 1] === 1 && src[i - w] === 1 && src[i + w] === 1) continue
      blur[i] = (src[i] * 4 + src[i - 1] + src[i + 1] + src[i - w] + src[i + w]) / 8
    }
  }

  // De-spill. Nothing in this set is genuinely magenta, so pull red and blue
  // back toward green at the rim — otherwise every sprite wears a pink outline
  // and the tint pass turns that outline into a second, wrong colour.
  const out = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    let r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    const excess = Math.min(r, b) - g
    if (excess > 0) {
      const k = opts.despill ?? 0.85
      r -= (r - g) > 0 ? Math.min(r - g, excess) * k : 0
      b -= (b - g) > 0 ? Math.min(b - g, excess) * k : 0
    }
    out[i * 4] = Math.max(0, Math.round(r))
    out[i * 4 + 1] = g
    out[i * 4 + 2] = Math.max(0, Math.round(b))
    out[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, blur[i])) * 255)
  }
  return { w, h, rgba: out }
}

// Mean luminance of what survived. A cutout that comes back near-black is a
// silhouette, not a sprite, and there is no point building on it.
export function luma(img) {
  let sum = 0, n = 0
  for (let i = 0; i < img.w * img.h; i++) {
    const a = img.rgba[i * 4 + 3]
    if (a < 200) continue
    sum += 0.2126 * img.rgba[i * 4] + 0.7152 * img.rgba[i * 4 + 1] + 0.0722 * img.rgba[i * 4 + 2]
    n++
  }
  return { mean: n ? sum / n : 0, coverage: n / (img.w * img.h) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inp, outp, hArg] = process.argv.slice(2)
  let img = key(readPNG(await readFile(inp)))
  img = trim(img, 0.02)
  if (hArg) img = resize(img, Math.round(img.w * (Number(hArg) / img.h)), Number(hArg))
  const l = luma(img)
  await writeFile(outp, writePNG(img.w, img.h, img.rgba))
  console.log(`${outp} ${img.w}x${img.h}  mean luma ${l.mean.toFixed(0)}  coverage ${(l.coverage * 100).toFixed(0)}%`)
}
