# PAWS OFF

A daily game. Felt cats and unicorns walk across the screen; tap every one
except the two kinds the round forbids. Built on
[Relay](https://github.com/Big-Head-Club/relay).

```
npm test            # assumptions + template tests + this game's own
node server.js      # http://localhost:3000
```

## The game

Each round announces two forbidden kinds — one cat colour and one unicorn
colour — for two seconds, then the animals start crossing.

- Tap a **safe** animal: points, and the combo multiplier climbs.
- Tap a **forbidden** animal: **one life**.
- Let a **safe** animal walk off the far side: **one life**.
- Let a **forbidden** animal walk off: correct, and a small restraint bonus.

Three lives for the whole run. The forbidden pair changes every round and never
repeats back to back for the same species, so the round card has to be read
every time. There is no round cap — the ladder keeps climbing past where anyone
gets to.

## The code

- `src/game/game.rules.mjs` — **pure**: no DOM, no clock, no `Math.random`. One
  move resolves one whole round (`{ r, taps: [[spawnIndex, ms], ...] }`), so the
  server rebuilds the schedule from the seed and recomputes the score itself.
  Nothing the client claims about its score is used.
- `src/game/game.view.mjs` — the screen. DOM sprites moved with `translate3d` in
  one rAF loop. The simulation works in **stage units** and the screen scales to
  it, so a phone and a laptop run the identical run.
- `src/game/backdrop.mjs` — the five animated backdrops: a still plate plus a
  canvas particle layer, never video.
- `src/game/juice.mjs` — the celebration and the synthesised bell.
- `relay.config.mjs` — name, day boundary, metric, share lines.
- `ASSUMPTIONS.md` — what this game assumes, and what would prove it wrong.
  `npm test` fails while any of it is unanswered.

### Verification

`verify: "resim"`. The client submits the taps it made, not the score. A tap
only counts if the animal was really on screen at that moment, each animal takes
at most one tap, and taps closer together than a thumb can move are dropped —
the same three rules on the client and the server. `test/relay.test.mjs` asserts
that a round cannot exceed its own ceiling, which catches more than any
anti-cheat.

### Harnesses

```
node test/balance.mjs 400   # does it resolve, and does the curve keep climbing
node test/duel.mjs 400      # is it about what it thinks it is about
```

The balance bot is handicapped with physical floors: an animal is not perceived
for 150ms, attention is **serial** (each animal costs a fixed identification
time — this is the real bottleneck of the whole game), and a thumb cannot tap
faster than its own limit. The duel bots all get identical eyes, attention and
thumbs and differ in exactly one predicate: which animals they decide to tap.

Reading both rules scores ~950. Tracking colour without species scores ~63.

## Art

Midjourney produces **one grey base per pose**; the six colours are arithmetic.
Ask it for a red cat and a blue cat and you get two different cats.

```
node tools/bake.mjs      # frames -> key -> normalise -> six tints -> public/art/sprites
bash tools/bakebg.sh     # backdrop plates -> public/art/bg   (macOS sips)
```

The four sprite frames and five backdrop plates the bake consumes are committed
in `art/src`; everything derived is gitignored and regenerates from them.

- `tools/key.mjs` — magenta chroma key. Magenta rather than cobalt because the
  bases are grey, and grey is invisible to a blueness test. Threshold sampled
  from each frame's own border, flood with hysteresis (Midjourney vignettes),
  largest component only.
- `tools/tint.mjs` — neutralise (the magenta screen tints the wool pink, which
  drags every colour warm), multiply by the hue, stamp the marking, draw the
  silhouette the camera did not.

Every colour carries a **shape** as well as a hue — star, dot, triangle, stripe,
heart, diamond — on the sprite, on the round card and in the HUD reminder. Colour
is never the only signal.

## Production

`PUBLIC_ORIGIN` must be absolute or the unfurl card is wrong. `DAILY_SALT` or
tomorrow's puzzle is precomputable. `SAVE_PATH` on a mounted volume or the
leaderboard dies with the container.
