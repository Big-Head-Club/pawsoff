// One grey base per pose in, six coloured sprites out.
//
// Midjourney cannot produce six consistent recolours of the same animal — ask
// it for a red cat and a blue cat and you get two different cats. So it draws
// each pose ONCE, in pale neutral grey, and the colour is arithmetic:
//
//   MULTIPLY. out = src * colour / 255. A pale body takes the hue cleanly and a
//   near-black outline stays near-black, because anything times a dark number is
//   dark. That property is the whole reason the base is shot pale — a dark base
//   multiplies down to a silhouette.
//
// Then the MARKING goes on: a tiled shape, masked to the sprite's own alpha,
// so colour is never the only thing separating two animals. Six colours, six
// shapes, and the banner and the strip both lead with the shape.
//
//   node tools/tint.mjs <base.png> <outdir> <prefix>

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { readPNG, writePNG } from "../src/server/png.mjs"
import { COLORS } from "../src/game/game.rules.mjs"

const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

// Each marking is a predicate over a repeating tile. Coordinates come in
// normalised to the tile, so the same function draws at any sprite size.
//
// The tile is a FRACTION OF THE SPRITE, not a pixel count. Fixed at 22px it
// looked like a pattern on a 220px hero render and like noise on the 72px
// sprite the game actually draws — which is the only size that matters, because
// the marking exists so that a player who cannot see the colour can still play.
const TILES_ACROSS = 4.5
const MARKS = {
  dot:      (x, y) => Math.hypot(x - .5, y - .5) < .26,
  diamond:  (x, y) => Math.abs(x - .5) + Math.abs(y - .5) < .34,
  stripe:   (x, y) => y > .34 && y < .60,
  triangle: (x, y) => y > .24 && y < .76 && Math.abs(x - .5) < (.76 - y) * .62,
  star: (x, y) => {
    const dx = x - .5, dy = y - .5
    const r = Math.hypot(dx, dy)
    if (r > .42) return false
    const a = Math.atan2(dy, dx)
    const k = Math.cos(((a * 5) % (Math.PI * 2)) - Math.PI / 2)
    return r < .18 + .24 * Math.abs(k)
  },
  heart: (x, y) => {
    const dx = (x - .5) * 2.3, dy = (y - .56) * 2.3
    const v = dx * dx + dy * dy - .30
    return v * v * v - dx * dx * dy * dy * dy < 0
  },
}

// A photographed subject has no line around it. That is fine at poster size and
// a real problem at 58px against a busy field, where the whole sprite collapses
// into one soft shape — so the pipeline draws the outline the camera did not.
// Dilate the alpha by a couple of pixels and fill the new ring with a dark
// value, so the silhouette survives the shrink.
//
// The ring is written as a GREY, not as the colour, because the multiply pass
// runs afterwards: writing the colour here would square the hue and turn every
// outline into a near-black smear at the wrong saturation. Grey times colour is
// the colour, darkened — which is the line the camera did not draw.
function outline(img, px, mix) {
  const { w, h, rgba } = img
  const src = Uint8Array.from({ length: w * h }, (_, i) => rgba[i * 4 + 3])
  const grown = Uint8Array.from(src)
  for (let p = 0; p < px; p++) {
    const prev = Uint8Array.from(grown)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (prev[i] > 200) continue
      let m = prev[i]
      if (x > 0) m = Math.max(m, prev[i - 1])
      if (x < w - 1) m = Math.max(m, prev[i + 1])
      if (y > 0) m = Math.max(m, prev[i - w])
      if (y < h - 1) m = Math.max(m, prev[i + w])
      grown[i] = m
    }
  }
  const grey = Math.round(255 * mix)
  const out = Buffer.from(rgba)
  for (let i = 0; i < w * h; i++) {
    if (grown[i] <= 8) continue
    if (src[i] >= 140) continue                    // interior: leave the photo alone
    out[i * 4] = grey; out[i * 4 + 1] = grey; out[i * 4 + 2] = grey
    out[i * 4 + 3] = Math.max(rgba[i * 4 + 3], grown[i])
  }
  return { w, h, rgba: out }
}

export function tint(src0, hex, mark, { markAlpha = 0.42, tilesAcross = TILES_ACROSS, edge = 0 } = {}) {
  const [cr, cg, cb] = hexToRgb(hex)
  const img = edge ? outline(src0, edge, 0.34) : src0
  const { w, h, rgba } = img
  const out = Buffer.from(rgba)
  const tile = Math.max(6, Math.round(h / tilesAcross))
  const fn = MARKS[mark]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (out[i + 3] === 0) continue
      let r = (rgba[i] * cr) / 255, g = (rgba[i + 1] * cg) / 255, b = (rgba[i + 2] * cb) / 255
      // The marking only shows on the body, never on the outline: a shape
      // stamped across the ink reads as damage, not as a pattern.
      const lum = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255
      if (lum > 0.45 && fn(((x % tile) / tile + 1) % 1, ((y % tile) / tile + 1) % 1)) {
        const a = markAlpha * Math.min(1, (lum - 0.45) / 0.25)
        r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a
      }
      out[i] = Math.round(r); out[i + 1] = Math.round(g); out[i + 2] = Math.round(b)
    }
  }
  return { w, h, rgba: out }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inp, outdir, prefix, edgeArg] = process.argv.slice(2)
  const base = readPNG(await readFile(inp))
  const edge = edgeArg == null ? 2 : Number(edgeArg)
  await mkdir(outdir, { recursive: true })
  for (const c of COLORS) {
    const t = tint(base, c.hex, c.mark, { edge })
    await writeFile(`${outdir}/${prefix}-${c.key}.png`, writePNG(t.w, t.h, t.rgba))
  }
  console.log(`${outdir}/${prefix}-*.png  ${COLORS.length} colours`)
}
