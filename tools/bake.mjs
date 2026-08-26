// The whole art pipeline, start to finish.
//
//   node tools/bake.mjs
//
// Midjourney frame -> magenta key -> trim -> face the same way -> neutralise ->
// six tints with markings and a drawn silhouette -> public/art/sprites.
//
// It is one command on purpose. The art and the game are on separate clocks:
// every screen in this game works with the sprites missing (the view falls back
// to coloured shapes on an image error), so this can be re-run whenever a better
// frame turns up without touching a line of game code.

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { readPNG, writePNG } from "../src/server/png.mjs"
import { trim, resize } from "./cutout.mjs"
import { key, luma } from "./key.mjs"
import { tint } from "./tint.mjs"
import { COLORS } from "../src/game/game.rules.mjs"

// Every sprite faces RIGHT once baked; the view mirrors it with scaleX for the
// animals walking the other way. A base that faces left is flipped here rather
// than in CSS, so "which way is this sprite facing" is never a runtime question.
// Grouped by species, because the two poses of one animal are not two sprites —
// they are the two halves of a WALK CYCLE, and the view alternates them as the
// animal covers ground. That only reads as walking if they are registered
// against each other first; see `register` below.
const SET = [
  { species: "cat",     h: 144, poses: ["art/src/sc2_1.png", "art/src/sc2_2.png"], flip: false },
  { species: "unicorn", h: 152, poses: ["art/src/felt_uni_1.png", "art/src/felt_uni_3.png"], flip: true },
]

// Lift every base to the same mean brightness before it is tinted.
//
// This is not a cosmetic pass. The tint is a MULTIPLY, so the base's luminance
// is the output's luminance — a pose shot half a stop darker becomes a visibly
// different red from the pose beside it, and in a game whose entire mechanic is
// "is this the forbidden colour", two reds is a broken rule, not a blemish.
// Poses within a species have to be interchangeable at a glance.
const TARGET_LUMA = 168
function normalise(img, target = TARGET_LUMA) {
  const { w, h, rgba } = img
  const mean = luma(img).mean
  if (mean <= 0) return img
  const k = target / mean
  const out = Buffer.from(rgba)
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) {
      // Scale toward white rather than straight multiply, so the brightest wool
      // does not clip to a flat blown-out patch that takes no tint at all.
      const v = rgba[i * 4 + c]
      out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v) * (1 - 1 / k) : v * k)))
    }
  }
  return { w, h, rgba: out }
}

// REGISTRATION. The whole walk cycle lives or dies here.
//
// The two poses are two separate photographs of the same toy: Midjourney framed
// them at slightly different sizes and sat them at slightly different heights in
// the frame. Alternate them raw and the animal does not walk, it JITTERS — it
// jumps a few pixels up and sideways twice a second, which reads as a broken
// sprite rather than as legs.
//
// So both frames are put on one canvas, sharing:
//   - SCALE, matched on sqrt(alpha area) rather than on bounding-box height. A
//     bounding box includes a raised tail or an ear, so height-matching shrinks
//     whichever pose happens to have its tail up. Area is what actually tracks
//     how big the animal is.
//   - BASELINE, the lowest opaque row. Feet stay on the ground between frames,
//     which is the single cue that separates walking from hovering.
//   - CENTRE, the horizontal centroid of the alpha, so the body stays put and
//     only the legs move.
function bounds(img) {
  const { w, h, rgba } = img
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0, sx = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] < 40) continue
    area++; sx += x
    if (x < x0) x0 = x; if (x > x1) x1 = x
    if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return { x0, y0, x1, y1, area, cx: area ? sx / area : w / 2, baseline: y1 }
}

function place(img, canvasW, canvasH, dx, dy) {
  const out = Buffer.alloc(canvasW * canvasH * 4)
  for (let y = 0; y < img.h; y++) {
    const ty = y + dy
    if (ty < 0 || ty >= canvasH) continue
    for (let x = 0; x < img.w; x++) {
      const tx = x + dx
      if (tx < 0 || tx >= canvasW) continue
      const s = (y * img.w + x) * 4, d = (ty * canvasW + tx) * 4
      img.rgba.copy(out, d, s, s + 4)
    }
  }
  return { w: canvasW, h: canvasH, rgba: out }
}

function register(frames, targetH) {
  const b0 = frames.map(bounds)
  const meanArea = b0.reduce((a, b) => a + b.area, 0) / b0.length
  // Match scale on area, then bring the whole set to the target height.
  const scaled = frames.map((f, i) => {
    const k = Math.sqrt(meanArea / b0[i].area)
    return resize(f, Math.max(1, Math.round(f.w * k)), Math.max(1, Math.round(f.h * k)))
  })
  const b1 = scaled.map(bounds)
  const tallest = Math.max(...b1.map((b) => b.y1 - b.y0 + 1))
  const k2 = targetH / tallest
  const sized = scaled.map((f) => resize(f, Math.max(1, Math.round(f.w * k2)), Math.max(1, Math.round(f.h * k2))))
  const b2 = sized.map(bounds)

  // One canvas big enough for the widest frame plus the shifts it needs.
  const widest = Math.max(...b2.map((b) => b.x1 - b.x0 + 1))
  const canvasW = widest + 8
  const canvasH = targetH + 8
  return sized.map((f, i) => {
    const b = b2[i]
    const dx = Math.round(canvasW / 2 - b.cx)
    const dy = Math.round((canvasH - 4) - b.baseline)     // feet on a shared line
    return place(f, canvasW, canvasH, dx, dy)
  })
}

function mirror(img) {
  const { w, h, rgba } = img
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + (w - 1 - x)) * 4, d = (y * w + x) * 4
      rgba.copy(out, d, s, s + 4)
    }
  }
  return { w, h, rgba: out }
}

const OUT = "public/art/sprites"
await mkdir(OUT, { recursive: true })

const POSE = ["a", "b"]
let written = 0

for (const item of SET) {
  let frames = []
  for (const srcPath of item.poses) {
    let img = key(readPNG(await readFile(srcPath)))
    img = trim(img, 0.02)
    if (item.flip) img = mirror(img)
    frames.push(img)
  }
  frames = register(frames, item.h)
  frames = frames.map((f) => normalise(f))

  for (let i = 0; i < frames.length; i++) {
    const img = frames[i]
    const name = `${item.species}-${POSE[i]}`
    const l = luma(img)
    // A cutout that comes back dark is a silhouette, and multiplying a silhouette
    // by a colour gives a black shape in six flavours. Say so rather than shipping
    // six identical blobs.
    const warn = l.mean < 110 ? "  <-- TOO DARK TO TINT" : ""
    console.log(`${name.padEnd(10)} ${String(img.w).padStart(3)}x${img.h}  luma ${l.mean.toFixed(0)}  cover ${(l.coverage * 100).toFixed(0)}%${warn}`)

    await writeFile(`${OUT}/${name}-grey.png`, writePNG(img.w, img.h, img.rgba))
    written++
    for (const c of COLORS) {
      const t = tint(img, c.hex, c.mark, { edge: 2, markAlpha: 0.34, neutral: 0.92 })
      await writeFile(`${OUT}/${name}-${c.key}.png`, writePNG(t.w, t.h, t.rgba))
      written++
    }
  }
  // Both frames of a species MUST come out the same size, or the view has to
  // know about per-frame geometry and the swap moves the animal again.
  const [f0, f1] = frames
  if (f0.w !== f1.w || f0.h !== f1.h) throw new Error(`${item.species}: frames disagree on size`)
}
console.log(`\n${written} files in ${OUT}`)
