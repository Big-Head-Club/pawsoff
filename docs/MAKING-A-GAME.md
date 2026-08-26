# Making a game

```
node tools/new-game.mjs sixes "Sixes" ~/games/sixes
cd ~/games/sixes && node server.js
```

You now have a working daily game with a placeholder ruleset. Three files stand
between that and yours — and one that comes first.

## 0. `ASSUMPTIONS.md` — before any code

The scaffolder writes it. Answer everything not marked _auto_; `npm test` fails
until you do. It takes ten minutes and it is the only part of this process that
has ever saved anyone a week.

The two that get the laziest answers: **`independent-numbers`** (which of your
difficulty numbers are derived from the others — that trap has been sprung twice
in this collection) and **`still-fun-day-30`** ("it is randomised" is not an
answer; "nothing changes, this has a shelf life" is).

## 1. `src/game/game.rules.mjs` — pure

No DOM, no clock, no `Math.random`. The server imports this file and replays your
players' runs with it, which is the entire anti-cheat.

```js
create(seed)            -> state
apply(state, move)      -> state          // ignore illegal moves, never throw
events(state)           -> ["hit", …]     // one glyph key per beat, spoiler-safe
result(state, { seconds }) -> { metric, tiebreak, events, …display }
replay(seed, log)       -> state
PRACTICE_SEED                              // the hand-picked first-timer puzzle
```

`metric` is what the board ranks by, in the direction `relay.config.mjs` says.
`tiebreak` is always higher-is-better, so hand back `-seconds` for "faster wins".

## 2. `src/game/game.view.mjs` — the screen

```js
mount(root, { seed, mode, coach, finish }) -> { log, destroy() }
```

Build whatever you like into `root` — DOM, canvas, SVG. Push each move onto
`log`, run it through `apply`, and call `finish(state, result(state))` when it is
over. `mode` is `"daily" | "practice" | "gate"`; `coach` is true only for the
first-ever practice round, so say the quiet part out loud there and nowhere else.

Also export `glyphs` (the emoji for your strip) and `how` (three lines for the
help sheet — what to do, how you are scored, why the strip is safe to share).

## 3. `relay.config.mjs`

The metric, the epoch, the timezone, and the two share lines. `share.headline`
and `share.statLine` are the only copy that ends up on the unfurl card, so write
them last, when you know what a good run feels like.

## What you get without writing anything

Deep links and the archive (`/d/37`), crews (`?c=CODE`), a result-carrying share
link, a per-link unfurl card, the leaderboard, streaks, the first-run practice
gate, unlimited practice, the countdown to the next puzzle, anonymous identity,
optional names, offline tolerance, two themes, and server-side re-simulation of
every submitted run.

## Before you ship

- [ ] `npm test` is green — which means every assumption is answered and the
      checkable ones hold.
- [ ] `PUBLIC_ORIGIN` is set in production. Without it the unfurl is wrong.
- [ ] `DAILY_SALT` is set to something random, or your puzzles are precomputable.
- [ ] `epoch` is the day you actually launch.
- [ ] Paste the link into a real group chat and look at the card. Then finish a
      run, paste that link, and look at it again. They should be different.
- [ ] Play it once on a phone, one-handed, outdoors.
- [ ] Play it once with the server stopped.
- [ ] Read `docs/DESIGN-LESSONS.md` §6 and check your `independent-numbers`
      answer still stands now that the game exists.
- [ ] Anything you got wrong on the way: `assume break` it, finish the `So:`
      line, and `assume promote` it back into the template. If nothing was
      learned, leave `LESSONS.md` empty and say so.
