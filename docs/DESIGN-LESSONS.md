# What forty-odd games taught us

Everything here was paid for. Each item names the game it came from so you can go
and look. Read it once before your first Relay game and again when one is not
working.

---

## 1. The link is the product

You are not building a game with a share button. You are building **a link that
survives a group chat**, and the game is what happens after someone taps it.

**The single biggest miss across the whole collection:** almost every game shipped
one static `og.png` with the production URL hardcoded into the HTML. Gorgon,
Atalanta, newphonewhodis, daily-maze, patient-zero, SPOTTED 3D — all of them show
the identical picture whether you are announcing the game or posting a 6/6.

A card that says *"Keyhole — a new lock every day"* tells the chat a game exists.
A card that says **"OPENED IN 2 · 2/6 · 41s"** is a scoreboard nobody has to open,
and it is the reason the next person taps. Relay renders the card per link, from
a token in the URL, with no database lookup — so it works for practice runs, crew
runs and archived days too.

Hard-won details:

- **`og:image` must be an absolute URL.** Scrapers do not resolve relative paths.
  This is written in a comment in newphonewhodis because it cost an afternoon.
- **Scrapers do not run JavaScript.** Meta tags set from client code do not
  exist. Relay renders them server-side per URL, which is why `/d/37?r=…` has a
  different title from `/`.
- **Chat clients cache the first card they saw for a URL, sometimes forever.**
  Vary the URL, not the image.
- **1200×630, and keep the type inside a 90px margin** — X, Slack, Discord and
  iMessage all crop differently inside that box.
- **Bake the text into the pixels.** Most clients show the image and truncate
  the description to one line.
- Ship `og:image:width`/`height` or Slack and Discord render a thumbnail.
- **Every band on the card has to shrink to fit, including the title.** The
  title band was pinned at scale 10, which is fine for KEYHOLE and drops the day
  number clean off the right edge of GRANDMA'S WATCHING — and the day number is
  half the point, because it is what tells the chat which puzzle is being
  discussed. Same for the tagline, which is the announce card's headline: past
  about twenty characters it runs out of room at the smallest scale there is.
- **The card face is a 5x7 bitmap and a character it does not have draws
  nothing while still advancing the cursor** — a silent hole in the middle of a
  number. It had no `%`, no comma, no question mark. Anything a game prints on
  the card has to be in `src/server/font.mjs`, and `test/relay.test.mjs` in
  Grandma's Watching asserts it rather than trusting it.

## 2. The share text has four lines and the last one is the link

Title, one stat line, the strip, the link. That is the whole format and it is not
a stylistic preference: chat clients collapse tall messages, and the link is what
you are actually sending. Put anything after the URL and some clients stop
auto-linking it.

**Vary the glyph, not just the hue.** A strip of five different coloured squares
is a worse strip than squares, circles and dots. Some of your players cannot tell
your green from your red, and all of your players are looking at a phone
outdoors.

**No hashtags. No emoji in the title.** The strip is the visual.

### The spoiler test you want is not the one you will write first

The obvious test is "no strip should identify a single puzzle". We wrote it, and
it fails on Keyhole — enumerate all 360 locks against a fixed pair of guesses and
three strips map to exactly one lock.

It is the wrong test. The reader does not know which guesses you made, so the
mapping they would need runs through your private moves. The property that
actually matters is that **the strip is a function of the feedback alone** — if a
glyph ever varies with *which* pieces were involved, the strip becomes a channel
back to the answer. That is the assertion in `test/relay.test.mjs`, and it is the
one worth copying.

## 3. Decide the day boundary on purpose

Three games in this collection each picked a different one and never discussed it:
Vine Drop uses UTC, daily-maze uses `America/Los_Angeles`, Tidbits shifts by the
player's own offset.

- **One global boundary** → everyone races the same puzzle at the same instant.
  Berlin can spoil Vancouver, and the chat is always talking about one puzzle.
- **Per-player boundary** → nobody is ever spoiled, and the chat is incoherent,
  because "today's" means a different puzzle for each person in it.

A link you paste into a group chat wants the first one. Relay defaults to a single
global boundary and lets you move it, so the day flips at a civilised hour for
wherever most of your players are rather than at 00:00 UTC, which is mid-afternoon
in California.

And **ship the countdown.** Every daily needs "next puzzle in 4:21:07" and half of
them forgot it.

## 4. Never let the first daily be the tutorial

A daily gives a player one attempt. If they spend it working out what the buttons
do, they have had a bad time on the only puzzle they get, and they do not come
back tomorrow.

`practiceGate: true` gives a first-time player one throwaway round before their
first real one — a hand-picked puzzle, not a random one, that rewards the exact
thinking the game is about — and says plainly that it did not count. It costs
about twenty lines and it is the highest-value screen in the template.

Keep unlimited practice on random seeds afterwards, and make practice runs
**visibly** unscored. A practice run that quietly submits is worse than no
practice at all.

## 5. Crews: the group chat gets its own puzzle

Six characters in the query string salt the daily seed. Open the plain link and
you play World, the same puzzle as everyone; open `?c=K7RM2P` and your group is
playing a puzzle nobody outside the chat has ever seen.

No rooms, no lobbies, no database rows, no realtime. This was invented for the
Emojivas games and it should have been in every daily since. It is the cheapest
possible answer to "prospers in the group chat but does not require it".

Codes use an alphabet with no `I`, `O`, `L`, `0` or `1`, because they get read
aloud and retyped.

## 6. Balance: the dial you think you have may be derived

The Vine Drop spec listed "active tomatoes on the vine" (5 → 22) as the difficulty
dial. It is not a dial. A tomato sits on the vine for four ripening stages and
then drops, so **count = drop rate × lifetime**. Holding 22 at the late-game
stage durations meant about seven drops a second — unplayable by an order of
magnitude, and invisible until it was simulated.

Before you tune anything, write down which of your numbers are independent.

Then:

- **Build a bot harness and handicap it.** `test/balance.mjs` in Vine Drop plays
  with a bot that can only see the viewport, has a reaction time and cannot tap
  faster than a thumb. Without the handicaps a bot tells you nothing.
- **Bots play about one tier above the human of the same name**, because they have
  perfect information about where the trouble is. Read "bot novice" as "a decent
  human".
- **Never plateau.** Vine Drop's curve flattened after three minutes and strong
  players rode the ten-minute cap instead of dying. Every curve needs to keep
  climbing past where you think anyone will get.
- **Some parameters are cliffs, not dials.** Slime Tide's purge radius has no
  useful middle setting. Test the ends before you tune the middle.
- **Check that the game can end.** Detritus, as specified, could not terminate.
- Treat every number as wrong until a person has played it. The harness tells you
  the shape of the curve; it does not tell you whether the game is fun.

## 7. Verification: verify the metric, not the flourish

If your rules file is pure — no DOM, no clock, no `Math.random` — the client can
submit **the moves it made** instead of the score, and the server replays them.
That is not a feature you add later; it is a property you keep from the first
line, and it is free.

- **Rank on the thing you can prove.** Keyhole re-simulates the number of tries
  and treats the clock as a claim, used only as a tiebreak, clamped to an hour.
- **An illegal move in a replayed log must be ignored, not thrown.** A tampered
  log should end in a different score, never in a 500.
- **Store the log.** It is a few kilobytes and it buys re-verification, ghost
  replays and the ability to answer "what actually happened".
- A test that asserts a run cannot exceed its own limits catches more real bugs
  than any anti-cheat.

Determinism is worth testing directly: same seed a thousand times, and a diff of
browser output against Node output. Vine Drop's are byte-identical, and knowing
that is what lets the server reject a score without a second thought.

## 8. Mobile first, laptop respectable

The link arrives on a phone. Almost always. But people do open these on a laptop,
and a phone screenshot floating in grey looks like a mistake.

**The fixed portrait stage solves both.** One 10:16 box, identical on every
device, so "what was on screen" is the same rectangle for every player — which is
what makes a daily fair and a leaderboard comparable. On a phone it is the screen.
On a laptop it is a framed play surface and the space beside it becomes the rail
(board, countdown) instead of dead margin.

The rule that decides whether an idea belongs here at all:

> **If it needs a keyboard, it is not a link game.**

Keyboard input is an accelerant, never a requirement. No hover states. No
right-click. Hit targets of 44px or more — this is being played one-handed,
probably while walking. daily-maze had to ship different boards for mouse and
touch; that is a warning, not a pattern to copy.

## 9. Identity last

No sign-in, no splash, no cookie banner, no "are you sure". An anonymous id in
`localStorage` is enough to run a leaderboard and a streak.

Ask for a name **once**, at the moment it buys something — after their first
scored run, when the rank is already on screen — and let them decline. A game
that asks who you are before it will let you play has lost most of the people who
tapped the link.

## 10. It has to work when the server does not

The game must be fully playable with the API down; the score simply does not
post. Every screen in Relay degrades to "offline — playing unscored" rather than
to a spinner. A daily that white-screens during a deploy is a daily people stop
opening.

## 11. Art, cheaply and consistently

The full Midjourney pipeline lives in `tools/`. The parts that generalise:

- **Lock style by removing the variable that varies, not by adding a reference.**
  `--sref` hijacks colour: a style reference with a strong accent forces that
  accent onto everything downstream and silently discards the ink you asked for.
  An identical locked suffix with one thing changing gives a real set.
- **Delete the environment.** Naming terrain in a character prompt makes the model
  spend the character's colours on sky and grass. "Plain flat background, no
  scenery" fixes both consistency and palette in one pass.
- **A grid of four is one subject from four angles, not four similar subjects.**
  To get two people who look alike, submit the same description twice.
- **For cutouts, shoot on saturated cobalt and key by flooding in from the frame
  edge** — a plain colour threshold eats the dark side of a dark subject, because
  a black object photographed on blue reflects blue. `tools/cutout.mjs`.
- Photographs read as expensive and cost the same as anything else. But **scrim
  them hard** behind type: a card is a place to read a number.

## 12. Scope is the whole game

Whatever you are building — one game you will run for years, or the twelfth one
this month — the constraint is the same: the thing has to survive the days you do
not feel like it. So:

- **No build step, no dependencies.** The browser imports the same modules the
  server does. Nothing to install, nothing to break in a year.
- **One file to edit.** `relay.config.mjs` plus a rules/view pair.
- **Two files of game.** If your rules file is over about 200 lines, the idea is
  probably two ideas.
- The primitives are already built. Every hour spent rebuilding a leaderboard is
  an hour not spent on the one thing that makes the game yours.
- **A game you ship and keep running beats three you abandon.** The archive, the
  streak and the countdown are all bets on the game still being there in six
  weeks; if you are not making that bet, turn them off rather than half-running
  them.

## 13. Smaller things that were each learned the hard way

- **Sweep the dead objects in the same tick they die**, or the renderer draws a
  caught thing for one more frame and the game feels laggy.
- **Pause on tab-hidden rather than catching up.** Simulating forty seconds in one
  frame is a death the player never saw.
- **A tap outside the play box is not a tap.** Otherwise a letterboxed screen
  lets a player produce input the server will reject, voiding an honest run.
- **Emoji in generated art prompts is unreliable** — describe the glyph in words.
- **Commit as you go.** Stage named paths; never `git add -A`.
- **Never hand someone a `/var/folders` path.** Save into the project and give a
  link they can click.

---

### From Kim's Game (2026-08-21)

#### note

The Relay host tore the game down before reading its input log. screenResult() calls clearStage() (which nulls `live`) and only then read `live?.log`, falling back to `state.guesses` — Keyhole's own shape. Every other game on the template therefore submitted an empty log, was rejected as a metric mismatch, and had the player FLAGGED for cheating on a completely honest run. Snapshot the log inside finish(), while the instance is still mounted.

#### note

A change-blindness game has two kinds of change and they are not on the same difficulty scale. A thing appearing on bare shelf and a gap opening where a thing was are both changes to the LAYOUT: they pop out of a glance and need no memory of what anything is. A thing turning into a different thing changes no layout at all, so it can only be found by naming objects one at a time against memory. The spec ordered them ADD < SWAP < REMOVE and the balance sim said ADD = REMOVE << SWAP, which moved REMOVE from round 10 to round 4 and made the late game SWAP-dominant. Model the glance separately from the fixation or you will tune the on-ramp to fix a bug in your bot.

#### note

Put anatomy under your bot's handicaps. The first pass at Kim's Game's harness let its strong bot re-check seven objects a second; an eye makes four or five fixations a second and cannot identify an object without one, so that bot was not a tier above a good player, it was a different species — and it reported the whole late ladder as solved. Every tier of bot cleared 15 rounds and the numbers looked fine. A handicap with no physical floor under it is a handicap you will quietly tune away when the answer is inconvenient.

#### note

Relay's unfurl card shrank its headline to fit and pinned its stat tiles at one size. That is invisible while a game's stats are two-digit numbers, and slices the last tile in half the moment one of them is a WORD — a tier name, a theme, a difficulty. Kim's Game's second tile is the day's shelf ('Windowsill') and it ran 170px off the right edge of the card. Anything on a card that a game supplies has to shrink to fit; the card is 1200px and the game author cannot see it from relay.config.mjs.

---

### From Grandma's Watching (2026-08-21)

#### independent-numbers

**Assumed:** Which of your difficulty numbers are actually independent, and which are derived from the others?

**What actually happened:** The balance sim confirmed the viewport is not a dial (3.68 -> 3.38 across a 2.6x size range, and SMALLER scores slightly BETTER, the opposite of the spec). But it also killed my own replacement dial: watch seconds are flat-to-negative (3.74 at 20s, 3.60 at 45s, 3.31 at 90s), because a fixed memory decays and a longer watch just adds interference. The real dial is how busy the street is, and the only lever the PLAYER has is where they point.

**So:** in an observation game, neither the size of the window nor the length of
the look is a difficulty dial. Both feel like dials because they are the two
numbers on the screen. What is actually scarce is **how many things a person can
hold**, and that is a property of the person, not of the game — so the only
numbers you control are **how many things are out there** and **how many of the
questions are about the part you told them to watch**. Tune those two and leave
the timer alone; the timer is a session-length device and a reason nobody can
take notes, and it should be chosen for feel.

The corollary is the useful half: a longer look makes a bot *worse*, because
everything new it takes in evicts something it had. That is not a bug in the
model, it is why "do not stare at one thing, dear" and "do not fixate" are both
in the game's copy, and it is why the second-best strategy is to stop looking
once you are full.

#### The duel sim was measuring the route, not the strategy

**What happened:** the first duel gave each strategy its own path over the
scene — the brief-follower got a tight sweep of the two named houses, the
control got a wide one, and a "random" bot got random waypoints. Random won,
convincingly, at everything. It was not a finding about briefs. Long diagonal
traverses across a whole scene pass over more objects than a tidy three-row
serpentine does, so the random bot simply *saw more*, and the experiment had
accidentally been about pathfinding.

**So:** when a duel sim compares strategies, hold the MOTION fixed and vary only
the decision you are testing. Same route, same speed, same everything — the
brief-follower and the control differ in one predicate, "which things do I spend
memory on". With that fixed the answer inverted: following the brief went from
losing to a random bot to beating an actively-ignoring one by 0.63 of a question
and nearly doubling accuracy on the questions it is aimed at (68% against 44%).

Related: the same run also caught a bot that never moved. Once its memory was
full it rehearsed whatever was in front of it, and there is always something in
front of you, so it spent forty-five seconds staring at one porch and could not
answer a single counting question. A "top up what is fading" rule needs a
threshold or it is a "stand still" rule.

#### Questions have different prices and the cheap ones should be the wide ones

**What happened:** with every question priced the same, three of the five types
sat at chance. Counting was 25% — the guess rate — and "which of these was
furthest left" was 23%, *below* it, because it needs four particular things held
at once and nobody holds four particular things.

**So:** separate the questions that cost a FIXATION from the ones that cost a
GLANCE. Naming the colour of a particular object at a named place needs a real
look. Saying *what* was in a place you have been told the name of, or roughly
where you saw a distinctive thing, survives on a glance in passing. Once that is
modelled, the design falls out of it: the questions about the briefed area
should be the expensive ones, and the questions about everywhere else should be
the cheap ones — otherwise the wide questions compete with the briefed area for
the same scarce memory and the brief cannot pay for itself.

Two smaller corollaries, both paid for: a count of one is not a count, it is a
presence question whose option row gives it away; and a whole-scene count
rewards sweeping, which is free, so it is a question that argues against your
own brief.

---

### From Housekeeping (2026-08-21)

#### note

A game needs to own its own title screen and Relay gave it no way to. The host rendered title, tagline and buttons for every game in the collection, so the one screen most likely to decide whether a link gets tapped looked identical for all of them. The hook is small — an optional game.splash(root, {seed}) rendered behind the screen content, torn down by clearStage — and what it buys is large: Housekeeping's title screen is the game running quietly behind the words, a cabinet where two things trade places every few seconds while you read. It teaches the mechanic by demonstration before a word of explanation. Hand the game a SCRAMBLED seed, not today's, or the title screen spoils the puzzle.

#### note

Pacing is a dial, it is easy to set wrong, and generosity you have not accounted for is a difficulty change you did not notice making. Both these games gave a player about 320ms between finding the change and being asked to study again — not enough time to notice you were right, let alone enjoy it. But the fix cannot be 'show the room for a second as a reward', because in a game whose late-round study clock is about ONE SECOND that reward is more study time than the round itself grants, and it silently undoes the ladder. So the win beat covers the board and lifts what you caught OUT of it, held up large, which costs the difficulty nothing and is a far better look at the thing than a 47-pixel object on a shelf. Any beat that does show the board — an arrival, a countdown — has to be added to the study budget in the balance harness.

#### note

A title must never break mid-word, and the CSS that is right for a result headline is wrong for a title. Relay's .big sets overflow-wrap:anywhere so a long result line wraps instead of overflowing; put a game's name in the same class and you get HOUSEKEEPIN / G on the splash. Headlines wrap, titles shrink.

---

### From Housekeeping (2026-08-21)

#### note

A game needs to own its own title screen and Relay gave it no way to. The host rendered title, tagline and buttons for every game in the collection, so the one screen most likely to decide whether a link gets tapped looked identical for all of them. The hook is small — an optional game.splash(root, {seed}) rendered behind the screen content, torn down by clearStage — and what it buys is large: Housekeeping's title screen is the game running quietly behind the words, a cabinet where two things trade places every few seconds while you read. It teaches the mechanic by demonstration before a word of explanation. Hand the game a SCRAMBLED seed, not today's, or the title screen spoils the puzzle.

#### note

Pacing is a dial, it is easy to set wrong, and generosity you have not accounted for is a difficulty change you did not notice making. Both these games gave a player about 320ms between finding the change and being asked to study again — not enough time to notice you were right, let alone enjoy it. But the fix cannot be 'show the room for a second as a reward', because in a game whose late-round study clock is about ONE SECOND that reward is more study time than the round itself grants, and it silently undoes the ladder. So the win beat covers the board and lifts what you caught OUT of it, held up large, which costs the difficulty nothing and is a far better look at the thing than a 47-pixel object on a shelf. Any beat that does show the board — an arrival, a countdown — has to be added to the study budget in the balance harness.

#### note

A title must never break mid-word, and the CSS that is right for a result headline is wrong for a title. Relay's .big sets overflow-wrap:anywhere so a long result line wraps instead of overflowing; put a game's name in the same class and you get HOUSEKEEPIN / G on the splash. Headlines wrap, titles shrink.

#### note

An assertion that reads POSITION cannot see a transposition, and it will pass forever while doing nothing. Housekeeping's view test fingerprinted the room by each object's transform; a swap puts a different object on the same slot at the same coordinates, so 'the room never changes while you are looking' never once detected the game's only mechanic. Kim's Game had the same hole for its SWAP op, plus a second one: the counter's increment was dropped in a rewrite and the assertion sat there passing on a variable nothing touched. Two lessons. Fingerprint by CONTENT, not by layout. And every time you write an assertion that matters, break the thing it guards and watch it fail — if it does not, you have written a comment.
