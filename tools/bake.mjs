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
const SET = [
  { out: "cat-a",     src: "art/probes/sc2_1.png",       flip: false, h: 144 },
  { out: "cat-b",     src: "art/probes/sc2_2.png",       flip: false, h: 144 },
  { out: "unicorn-a", src: "art/probes/felt_uni_1.png",  flip: true,  h: 152 },
  { out: "unicorn-b", src: "art/probes/felt_uni_3.png",  flip: true,  h: 152 },
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

for (const item of SET) {
  let img = key(readPNG(await readFile(item.src)))
  img = trim(img, 0.02)
  if (item.flip) img = mirror(img)
  img = resize(img, Math.max(1, Math.round(img.w * (item.h / img.h))), item.h)
  img = normalise(img)

  const l = luma(img)
  // A cutout that comes back dark is a silhouette, and multiplying a silhouette
  // by a colour gives a black shape in six flavours. Say so rather than shipping
  // six identical blobs.
  const warn = l.mean < 110 ? "  <-- TOO DARK TO TINT" : ""
  console.log(`${item.out.padEnd(10)} ${String(img.w).padStart(3)}x${img.h}  luma ${l.mean.toFixed(0)}  cover ${(l.coverage * 100).toFixed(0)}%${warn}`)

  await writeFile(`${OUT}/${item.out}-grey.png`, writePNG(img.w, img.h, img.rgba))
  for (const c of COLORS) {
    const t = tint(img, c.hex, c.mark, { edge: 2, markAlpha: 0.34, neutral: 0.92 })
    await writeFile(`${OUT}/${item.out}-${c.key}.png`, writePNG(t.w, t.h, t.rgba))
  }
}
console.log(`\n${SET.length * (COLORS.length + 1)} files in ${OUT}`)
