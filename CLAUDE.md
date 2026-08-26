# Working on a Relay game

This project was scaffolded from the Relay template. Two rituals are not
optional, because the expensive mistakes in this family of games were never
bugs — they were beliefs nobody wrote down.

## Before writing any game code: answer `ASSUMPTIONS.md`

Open it and answer every question that is not marked _auto_. Not with a
restatement of the question — with the specific claim you are making about
**this** game, and what would prove it wrong.

`npm test` fails while any of them is blank or says TODO. That is deliberate.
Do not work around it by deleting questions.

The one that matters most and gets the laziest answers is
**`still-fun-day-30`**. "It is randomised" is not an answer. If the honest
answer is "nothing changes", write that down — a known shelf life is a design
constraint, and pretending otherwise is how a daily quietly dies at day nine.

If the game has a difficulty curve, answer **`independent-numbers`** before you
tune anything. The trap is real: Vine Drop's spec named a dial that was not one
(`count = drop rate x lifetime`), and it was invisible until somebody simulated
it.

## When an assumption turns out to be wrong

```
node tools/assume.mjs break <id> "what actually happened"
```

This flips it to `[broken]` in the ledger and opens a stub in `LESSONS.md` with
the assumption and the reality already filled in. **Finish the `So:` line while
you still remember**, because that line is the whole point and it is worthless a
week later.

A broken assumption is not a failure to hide. It is the only reliable source of
new knowledge this template has.

## When the game teaches you something else

```
node tools/assume.mjs learn "..."
```

Then, when it generalises past this game:

```
RELAY_TEMPLATE=<path to relay> node tools/assume.mjs promote --write
```

which appends it to the template's `docs/DESIGN-LESSONS.md`, attributed to this
game and dated, so the next game starts from it.

**Leave `LESSONS.md` empty if nothing was learned.** An empty file is an honest
result. Inventing lessons to fill it makes the whole list less trustworthy, and
the list only works if it is trusted.

## The shape of the code

- `src/game/*.rules.mjs` is **pure** — no DOM, no clock, no `Math.random`. The
  server imports it and replays submitted runs with it. `assume check` greps for
  violations. This is the anti-cheat and it is only the anti-cheat while it is
  pure.
- Export `moves(state, rng)` from the rules file even though nothing in the game
  needs it. It is what lets the checker actually play the game, which is how
  `terminates`, `metric-moves` and `strip-not-fingerprint` get verified instead
  of skipped.
- `src/game/*.view.mjs` is the screen. DOM or canvas, the host does not care.
- `relay.config.mjs` is the only other file you should need to touch.
- Do not edit `src/core`, `src/client`, `src/server` or `server.js` to make a
  game work. If you think you have to, that is a gap in the template worth a
  lesson.

## Read

`docs/DESIGN-LESSONS.md` before starting, and again when something is not
working. Every item in it names the game that paid for it.
