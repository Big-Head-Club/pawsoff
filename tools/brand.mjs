// The things a link needs before anyone has played: the unfurl plate, the app
// icon, the manifest.
//
//   node tools/brand.mjs
//
// All of it is generated from assets that already exist, so there is nothing to
// keep in sync by hand. The card plate is built from the baked sprites; the icon
// is drawn from arithmetic.

import { readFile, writeFile } from "node:fs/promises"
import { readPNG, writePNG } from "../src/server/png.mjs"
import { resize } from "./cutout.mjs"
import { COLORS } from "../src/game/game.rules.mjs"

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

function canvas(w, h, rgb) {
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[0]; rgba[i * 4 + 1] = rgb[1]; rgba[i * 4 + 2] = rgb[2]; rgba[i * 4 + 3] = 255
  }
  return { w, h, rgba }
}

// Source-over, ALPHA INCLUDED. The first version wrote the three colour
// channels and left alpha alone, which is invisible when you draw onto an
// opaque card and total when you draw onto a transparent strip first: the
// parade composited perfectly into a buffer that was still 0% opaque, then
// contributed nothing to the card. Zero non-ground pixels, no error.
function composite(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    const ty = y + dy
    if (ty < 0 || ty >= dst.h) continue
    for (let x = 0; x < src.w; x++) {
      const tx = x + dx
      if (tx < 0 || tx >= dst.w) continue
      const s = (y * src.w + x) * 4, d = (ty * dst.w + tx) * 4
      const a = src.rgba[s + 3] / 255
      if (!a) continue
      const da = dst.rgba[d + 3] / 255
      const oa = a + da * (1 - a)
      for (let c = 0; c < 3; c++) {
        dst.rgba[d + c] = Math.round((src.rgba[s + c] * a + dst.rgba[d + c] * da * (1 - a)) / oa)
      }
      dst.rgba[d + 3] = Math.round(oa * 255)
    }
  }
}

// --- the card plate ---------------------------------------------------------
// A parade of the six colours along the bottom right.
//
// Placement is dictated by the card, not by taste: the host scrims this plate
// 66% toward the ground colour — deliberately, because a card is a place to read
// a number — so anything here is a watermark, and it has to sit clear of the
// title, the headline, the stat band and the footer or it just muddies type.
// Bottom right is the only quiet quarter.
const W = 1200, H = 630
const GROUND = hex("#f2e6cf")

// Pre-compensate for that 66% scrim. Composited at full strength the parade
// comes back as pastel fog; darkened and saturated first, it survives being
// mixed two-thirds into cream and still reads as six different colours, which
// is the one thing the picture has to say.
function punch(img, darken = 0.68, sat = 1.5) {
  const out = Buffer.from(img.rgba)
  for (let i = 0; i < img.w * img.h; i++) {
    if (!out[i * 4 + 3]) continue
    const r = img.rgba[i * 4], g = img.rgba[i * 4 + 1], b = img.rgba[i * 4 + 2]
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    for (let c = 0; c < 3; c++) {
      const v = img.rgba[i * 4 + c]
      out[i * 4 + c] = Math.max(0, Math.min(255, Math.round((l + (v - l) * sat) * darken)))
    }
  }
  return { w: img.w, h: img.h, rgba: out }
}

const plate = canvas(W, H, GROUND)
const order = ["cat", "unicorn", "cat", "unicorn", "cat", "unicorn"]

// Build the parade in its own strip first, then place it — laying it out
// straight onto the card meant guessing where it ended, and the last unicorn
// walked off the right edge.
const pieces = []
for (let i = 0; i < order.length; i++) {
  const species = order[i]
  const src = readPNG(await readFile(`public/art/sprites/${species}-${i % 2 ? "b" : "a"}-${COLORS[i % COLORS.length].key}.png`))
  const h = species === "unicorn" ? 150 : 134
  pieces.push(punch(resize(src, Math.max(1, Math.round(src.w * (h / src.h))), h)))
}
const STEP = 0.62                       // overlap, so it reads as a crowd not a row
const rawW = Math.round(pieces.slice(0, -1).reduce((a, p) => a + p.w * STEP, 0) + pieces.at(-1).w)
const rawH = Math.max(...pieces.map((p) => p.h))
let strip = canvas(rawW, rawH, GROUND)
for (let i = 0; i < rawW * rawH; i++) strip.rgba[i * 4 + 3] = 0
let sx = 0
for (const p of pieces) { composite(strip, p, Math.round(sx), rawH - p.h); sx += p.w * STEP }

// The parade lives in the space nothing else wants, and that space is MEASURED
// rather than guessed: the footer runs along the bottom left in 5-scale type, so
// the parade starts after it, and it is lifted clear of the bottom edge instead
// of having its feet cut off by it. Then the whole strip is scaled to fit what
// is left — which is the only way this stays correct when the footer changes.
const FOOTER_END = 92 + "ONE A DAY / NO SIGN-IN".length * (5 + 1) * 5
const RIGHT_PAD = 14, BOTTOM_PAD = 16, GAP = -190
// Deliberately allowed to run back UNDER the footer. The host mixes this plate
// two-thirds into the ground before any type is drawn on top, so the parade is a
// watermark by the time the footer lands on it — and a card whose only subject
// is a corner sticker is a worse card than one with a slight overlap.
const availW = W - FOOTER_END - GAP - RIGHT_PAD
const k = Math.min(1.25, availW / rawW)
strip = resize(strip, Math.round(rawW * k), Math.round(rawH * k))
composite(plate, strip, W - strip.w - RIGHT_PAD, H - strip.h - BOTTOM_PAD)
console.log(`  parade ${strip.w}x${strip.h} at x=${W - strip.w - RIGHT_PAD}, footer ends ${FOOTER_END}`)
await writeFile("themes/paper/card.png", writePNG(plate.w, plate.h, plate.rgba))
console.log(`themes/paper/card.png  ${W}x${H}`)

// --- the icon ---------------------------------------------------------------
// A paw, drawn rather than photographed. A felt sprite is lovely at 200px and
// mud at 16px, and a favicon is a 16px problem — so the mark is four toes and a
// pad, which survives being a handful of pixels in a browser tab.
function paw(size, groundHex, inkHex) {
  const g = hex(groundHex), ink = hex(inkHex)
  const img = canvas(size, size, g)
  const R = size * 0.19                      // corner radius, drawn by hand
  for (let y = 0; y < size; y++) for (let x2 = 0; x2 < size; x2++) {
    const dx = Math.max(R - x2, x2 - (size - 1 - R), 0)
    const dy = Math.max(R - y, y - (size - 1 - R), 0)
    if (dx * dx + dy * dy > R * R) {
      const i = (y * size + x2) * 4
      img.rgba[i + 3] = 0
    }
  }
  const ell = (cx, cy, rx, ry) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      if (y < 0 || y >= size) continue
      for (let x2 = Math.floor(cx - rx); x2 <= cx + rx; x2++) {
        if (x2 < 0 || x2 >= size) continue
        const u = (x2 - cx) / rx, v = (y - cy) / ry
        if (u * u + v * v > 1) continue
        const i = (y * size + x2) * 4
        if (img.rgba[i + 3] === 0) continue          // stay inside the rounded square
        img.rgba[i] = ink[0]; img.rgba[i + 1] = ink[1]; img.rgba[i + 2] = ink[2]
      }
    }
  }
  const s = size / 100
  ell(50 * s, 66 * s, 25 * s, 20 * s)               // pad
  ell(26 * s, 38 * s, 10 * s, 13 * s)               // toes
  ell(43 * s, 28 * s, 10 * s, 13.5 * s)
  ell(61 * s, 28 * s, 10 * s, 13.5 * s)
  ell(78 * s, 38 * s, 10 * s, 13 * s)
  return img
}

const icon = paw(512, "#b8281c", "#f2e6cf")
await writeFile("public/icon.png", writePNG(icon.w, icon.h, icon.rgba))
console.log("public/icon.png  512x512")

await writeFile("public/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="19" fill="#b8281c"/>
  <ellipse cx="50" cy="66" rx="25" ry="20" fill="#f2e6cf"/>
  <ellipse cx="26" cy="38" rx="10" ry="13" fill="#f2e6cf"/>
  <ellipse cx="43" cy="28" rx="10" ry="13.5" fill="#f2e6cf"/>
  <ellipse cx="61" cy="28" rx="10" ry="13.5" fill="#f2e6cf"/>
  <ellipse cx="78" cy="38" rx="10" ry="13" fill="#f2e6cf"/>
</svg>
`)
console.log("public/icon.svg")

// --- the manifest -----------------------------------------------------------
// It still said "Relay", which is what an installed icon on a home screen would
// have been called.
await writeFile("public/manifest.webmanifest", JSON.stringify({
  name: "PAWS OFF",
  short_name: "PAWS OFF",
  description: "Tap all but two. A new pair to leave alone every round.",
  start_url: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#f2e6cf",
  theme_color: "#b8281c",
  icons: [
    { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
  ],
}, null, 2) + "\n")
console.log("public/manifest.webmanifest")
