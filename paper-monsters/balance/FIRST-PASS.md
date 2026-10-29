# Three-fighter balance pass

## Final changes

Vampire is unchanged: 90 starting /110 maximum HP, 240 px/s; knife 3 damage/2s cooldown, Bloodsuck 5 damage/+5 HP/5s cooldown with 0.5s miss stun, cloak 3s/20s cooldown with rounded half damage/healing, bat 10s then 30s cooldown, 1.5× incoming damage, smaller body and no attacks. Bat horizontal/vertical flight speeds are 285/260 px/s.

Assassin stays at 80 HP and 240 px/s. Katana remains 5 damage, 115px reach; dagger remains 1 front/15 rear damage, 43px reach; aimed volley remains three knives, successful hits 3/4/5, 0.14s spacing, speed680px/s, lifetime1.35s. Melee reach adds target radius. Only cooldowns changed: katana **1.5→3s**, dagger **3→5s**, volley **7→12s**. These are substantial recharge increases, chosen because the initial Assassin dominated the tested strategies; damage and identity are preserved.

Barbarian remains 120 HP. Compared with the initial implementation, walking speed **204→216px/s** (still 10% slower than the others); Cleaving Strike windup **0.55→0.45s**, reach **135→150px** plus target radius. Heavy damage10, cooldown5s, action0.8s and movement55% remain unchanged. Axe Tempest: five broad alternating sweeps at0.35/0.85/1.35/1.85/2.35s, ends2.65s, 135px reach plus radius, successful hits2/4/6/8/10, cooldown45s, movement30%, no new jumps; misses do not advance damage. Rampage remains3s, cooldown60s, outgoing×1.5/incoming×0.8, speed264px/s; can overlap axe attacks. No damage causes3s stun THEN5s movement at55%. Attack movement restrictions also apply during Rampage. All cooldowns begin on activation except Vampire bat.

Health is unchanged for all three. Default-on sound, aiming, selectable/random practice bots, delayed turning, stationary mode and Vampire mechanics are preserved. The bot now falls back to its basic move when its special is cooling down instead of wasting its attack opportunity.

## Method and results

1,458 recorded matches: 486 baseline, 486 tuned, and 486 holdout with seed offset90000. Each run has432 cross-character fights (144 per pairing) plus54 mirrors. Each pair covers all9 combinations of brawler/tactical/mobile strategies, both starting sides, both engine actor roles and4 seeds. Input order alternates. Runs stop at death or150s; timeouts are not assigned winners by remaining health.

The harness runs real game update, physics, cooldowns, collisions and abilities at60Hz. It replaces the deliberately easy practice-bot input controller with scripted full-speed fighters. Profiles vary reaction delay, aim error, dodging, spacing and jumping. The corrected Barbarian controller closes before committing to an attack; all reported comparisons use that same controller. Exploratory runs are excluded from the totals here.

| Run | Pair (A vs B) | A wins | B wins | Timeouts |
|---|---|---:|---:|---:|
| baseline-final | vampire vs assassin | 1 | 143 | 0 |
| baseline-final | vampire vs barbarian | 82 | 20 | 42 |
| baseline-final | assassin vs barbarian | 131 | 13 | 0 |
| tuned | vampire vs assassin | 86 | 57 | 1 |
| tuned | vampire vs barbarian | 85 | 18 | 41 |
| tuned | assassin vs barbarian | 96 | 46 | 2 |
| holdout | vampire vs assassin | 90 | 54 | 0 |
| holdout | vampire vs barbarian | 89 | 11 | 44 |
| holdout | assassin vs barbarian | 105 | 39 | 0 |

Assassin's initial near-universal advantage is removed. The tuned and holdout runs favor Vampire over Assassin, while Barbarian performs better against Assassin than before. Barbarian still struggles substantially against evasive Vampire strategies; this is unresolved balance risk, not evidence of parity. Barbarian can win close exchanges, but cooldown timing, healing and escape opportunities favor cautious play. We retained the specified character designs rather than chasing 50/50 by overfitting these controllers.

These are scripted strategy samples, not human skill ratings or independent human trials. Mirrors have small sample sizes, timeouts and side/order variability; role swapping reduces bias but does not prove its absence. Random seeds vary decisions, not the three underlying algorithms. Human play-testing is still needed, particularly Barbarian pursuit and Vampire sustain. The arena has no ring-outs; conclusions apply only to this arena and health-based rules.

## Verification

40 automated tests pass, including Vampire regressions, front/rear dagger behavior in both directions, volley successful-hit progression/reset, swept collision against bat hitboxes, aim scaling, actual runtime damage, Barbarian windup evasion/combo escape, Rampage modifiers and sequential stun/slow, character reset, practice-bot telegraphs/turning, and sound defaults.

Browser checks cover character selectors, aiming and Assassin damage, Barbarian paper animation and concurrent Rampage/axe attacks, health/cooldown displays, and the live release. These complement the headless mechanics tests; they are not human balance testing.

## Reproduce

```sh
node --test paper-monsters/tests/*.test.mjs
BASELINE=1 node paper-monsters/balance/simulate.mjs paper-monsters/balance/baseline-final.json
node paper-monsters/balance/simulate.mjs paper-monsters/balance/tuned.json
SEED_OFFSET=90000 node paper-monsters/balance/simulate.mjs paper-monsters/balance/holdout.json
```

The frozen baseline module captures the initial tuning; raw match outcomes accompany each summary. Earlier exploratory results are retained separately and are not included in the comparison above.
