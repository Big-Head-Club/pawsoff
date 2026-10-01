// New felt kinds from Nano Banana, using the existing felt cat as the style
// reference so the set reads as one shoot. Two walk poses per kind.
//
//   node tools/gen.mjs dog horse ...   [--tries 2]
//
// Writes art/src/new/<kind>_<pose>-<n>.png. Pick keepers into SET in bake.mjs.
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

const MODEL = process.env.ART_MODEL || "gemini-3.1-flash-image"
const KEY = (await readFile(join(homedir(), ".config/gemini-api-key"), "utf8")).trim()
const REF = (await readFile("art/src/sc2_1.png")).toString("base64")

const STYLE = "A photograph in exactly the same style as the reference: a handmade needle-felted wool toy, " +
  "undyed pale off-white grey wool (no colour at all, no pink, no brown), soft studio light, " +
  "plain flat magenta backdrop, whole subject in frame with margin, strict side view, facing RIGHT, " +
  "cute and chunky, small black bead eyes. One subject only, no props, no text."
const KINDS = {
  dog: "A cute puppy with floppy ears and a short tail",
  horse: "A cute little pony horse with a short fluffy mane and tail (no horn)",
  pencil: "A cute pencil character lying horizontally, sharpened point facing right with a small dark graphite tip, an eraser end on the left, two little bead eyes near the point, and four tiny stubby felt legs underneath",
  candy: "A cute wrapped sweet: a round candy with twisted wrapper ends on the left and right, two little bead eyes, and four tiny stubby felt legs underneath",
}
const POSES = {
  1: "mid-stride walking: front left leg forward, back leg back.",
  2: "the other half of the walk cycle: legs together, under the body.",
}

const args = process.argv.slice(2)
const ti = args.indexOf("--tries")
const tries = ti >= 0 ? Number(args[ti + 1]) : 1
const names = args.filter((a, i) => !a.startsWith("--") && i !== ti + 1)

async function draw(kind, pose, n) {
  const text = `${STYLE} Subject: ${KINDS[kind]}, ${POSES[pose]}`
  const body = {
    contents: [{ parts: [{ inlineData: { mimeType: "image/png", data: REF } }, { text }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "2K" } },
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(`${kind}: ${json.error?.message || res.status}`)
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
  if (!part) throw new Error(`${kind}: no image`)
  const out = `art/src/new/${kind}_${pose}-${n}.png`
  const raw = Buffer.from(part.inlineData.data, "base64")
  if (/png/.test(part.inlineData.mimeType)) await writeFile(out, raw)
  else {
    const tmp = join(tmpdir(), `po-${kind}-${Date.now()}.jpg`)
    await writeFile(tmp, raw)
    spawnSync("sips", ["-s", "format", "png", tmp, "--out", out], { stdio: "ignore" })
  }
  console.log("drew", out)
}

await mkdir("art/src/new", { recursive: true })
const jobs = []
for (const kind of names) for (const pose of [1, 2]) for (let t = 0; t < tries; t++) {
  let n = 1 + t
  while (existsSync(`art/src/new/${kind}_${pose}-${n}.png`)) n++
  jobs.push(draw(kind, pose, n).catch((e) => console.error(e.message)))
}
await Promise.all(jobs)
