# PAWS OFF — assumptions

Written before the game was, checked on every `npm test`. Each of these is a
HYPOTHESIS, not a decision: the point is that it is written down where it can be
found to be wrong. When one breaks, run `node tools/assume.mjs break <id> "what
actually happened"` — that is the moment the lesson is cheap to capture.

Answers marked _auto_ are verified by `node tools/assume.mjs check`. The rest
need a sentence from you; the checker will not accept a blank or a TODO.

### independent-numbers [open]
> Which of your difficulty numbers are actually independent, and which are derived from the others?
_answer below. Vine Drop's spec listed 'tomatoes on the vine' as the dial. It is not one: count = drop rate x lifetime, so the spec's late-game numbers implied ~7 drops a second. Invisible until simulated._

Four are independent: **speed** (which is the reaction budget — how many ms an
animal is on screen), **spawn interval**, **how many colours are in play**, and
**what share of the field is forbidden**. Everything else is derived.

The spec named `max concurrent` (3 rising to 10) as a dial. It is not one:
`concurrent = crossMs / interval`, and with the spec's own numbers it sits at
3.3-3.6 for the entire first six rounds — flat, while the table claims it is
climbing. `test/balance.mjs` prints the derived value next to the quoted one.

Two more the sim found. The spec's ladder is stitched from an `r <= 7` arm and
an `r >= 8` arm that do not meet, so round 8 came out EASIER than round 7. And
the interval decay is a cliff, not a dial: at 0.85 per round, round 11 goes from
2.9 to 8.2 lives lost in three rounds, which is a wall. At 0.88 it climbs.

**Wrong if:** a run of the balance harness shows life-loss-per-round falling
anywhere as the round number rises, or concurrency moving more than speed does.

### terminates [open]
> Does every run end?
_auto — checked for you. Detritus, as specified, could not terminate. Nothing in its rules rewarded advancing._



### metric-moves [open]
> Does the leaderboard metric actually vary between runs?
_auto — checked for you. A metric that is the same for everybody is a leaderboard sorted by submission time wearing a hat._



### strip-not-fingerprint [open]
> Can the share strip be reversed into the answer?
_auto — checked for you. If the number of distinct strips approaches the number of distinct puzzles, the strip is an identifier and the game dies in the group chat that liked it most._



### rules-pure [open]
> Is the rules file free of the DOM, the clock and unseeded randomness?
_auto — checked for you. It is the anti-cheat, and it is only the anti-cheat while it is pure. One Date.now() and the server can no longer reproduce a run._



### deterministic [open]
> Does the same seed produce the same run, every time?
_auto — checked for you. Everything downstream — verification, the daily itself, the archive — is built on this._



### identity-set [open]
> Have you set key, title and epoch away from the template's defaults?
_auto — checked for you. Two games sharing a key hand out the same puzzle. An unset epoch means puzzle numbers that do not match the day you launched._



### practice-not-spoiler [open]
> Does the practice-gate seed collide with any real day's puzzle?
_auto — checked for you. The first-run practice round handing somebody next Tuesday's puzzle is a slow leak nobody would think to look for._



### one-handed [open]
> Can this be played one-handed on a phone, outdoors, while walking?
_answer below. That is how a link from a group chat is opened. If it needs a keyboard it is not a link game; daily-maze had to ship separate boards for mouse and touch._

Yes, and it is the only way it is meant to be played. One input: tap an animal.
Hit boxes are the sprite plus 12 stage units of padding on every side and the
nearest centre wins a contested tap, so a thumb that lands between two lanes
resolves to one animal rather than to none. No keyboard, no hover, no drag, no
second finger. The stage is the fixed 10:16 box, so the same run is the same
rectangle on a phone and a laptop.

**Wrong if:** anyone plays a round and reports a tap that visibly hit an animal
and did nothing, or that one tap cleared two animals.

### day-boundary [open]
> Why did you pick this timezone for the day boundary, and who does it disadvantage?
_answer below. One global boundary means the chat always discusses one puzzle and someone can be spoiled. A per-player boundary means nobody is spoiled and the chat is incoherent. Three games here each picked differently, by accident._

One global boundary at midnight Pacific. Everyone races the same run, so a group
chat is always arguing about one puzzle and a score is comparable without asking
"which day did you get".

It disadvantages Europe and Asia, where the puzzle lands mid-morning rather than
first thing, and it means a Berlin player can spoil a Vancouver one — which is
the accepted cost of a chat that makes sense. UTC was the alternative and is
worse for the same reason it is worse for Vine Drop: UTC midnight is 4-5pm in
California, dropping the new puzzle into the middle of a working afternoon for
most of the people this gets sent to.

**Wrong if:** the archive shows play concentrated in a window the Pacific
boundary cuts in half.

### first-thirty-seconds [open]
> What does a stranger who has never heard of this see in their first thirty seconds?
_answer below. They arrived from a link, mid-conversation, with no context and no patience._

A title screen with two felted animals crossing it, one line of tagline, and a
PLAY button. Because `practiceGate` is on, their first tap starts a THROWAWAY
round that says so — a round-one pace, two clearly different rules, and a coach
line under the banner reading "Tap everything else. Letting a safe one walk off
costs a life too." That sentence is the whole game and it is the one thing a
stranger cannot infer from watching.

Then the real run: a two-second banner stamping down two cards — a felted cat
with a star on it, a felted unicorn with a dot — and thirty seconds of tapping.
They will lose. Median good player dies at round 5, which is about a minute.

**Wrong if:** watching someone's first run shows them tapping the forbidden
animals repeatedly, which would mean the banner is not reading as a prohibition.

### still-fun-day-30 [open]
> What makes day 30 different from day 3? If nothing does, say so.
_answer below. 'It is randomised' is not an answer. Most dailies die of sameness, not of difficulty._

Day 30 differs from day 3 in the rule sequence and nothing else, and that is a
real shelf life, not a feature. This is a go/no-go inhibition game: the skill is
holding your thumb back, and that skill does not deepen the way a deduction game's
does. Nobody is going to discover a new strategy in week four.

What is actually carrying it: the score is a number you can beat, the strip says
how far you got, and the run is short enough to send. The bet is on the chat and
the streak, not on novelty.

The honest reading of the duel sim is that the two-rule structure is what makes
it a game at all rather than a tapping test — tracking colour without species
scores 63 against 951 — so if day 30 gets stale the lever is a third rule
dimension (a direction, a size), not more colours.

**Wrong if:** week-two retention holds but scores stop improving, which would
mean people are playing out of habit with nothing left to learn.
