# Final three-fighter stats and focused balance review

This report supersedes FIRST-PASS.md. Vampire and Assassin have not changed since the first three-fighter release. The focused pass improves Barbarian's heavy attack while retaining its 120 health, damage values, combo and Rampage specifications. It does **not** establish equal competitive matchups: evasive Vampire remains a strong counter.

## Final stats

| Fighter | Starting / maximum HP | Base speed | Moves: damage, timings and cooldown |
|---|---|---|---|
| Vampire | 90 / 110 | 240px/s | Knife3 damage, 2s CD. Bloodsuck5 damage/+5 healing, 5s CD, 0.5s miss stun. Cloak3s, 20s CD, half output rounded up (knife2, Bloodsuck3 damage/+3). Bat10s, then30s CD, 285px/s horizontal /260 vertical flight, no attacks, incoming×1.5, cooldowns continue. |
| Assassin | 80 / 80 | 240px/s | Katana5 damage, 115px reach, 3s CD. Dagger1 front/15 behind, 43px reach, 5s CD. Volley3 aimed knives at0.14s intervals, successful hits3/4/5, 12s CD; misses do not advance sequence, direction locked on activation, speed680px/s, lifetime1.35s. |
| Barbarian | 120 / 120 | 216px/s | Heavy10 damage, 0.35s windup, 0.7s total action, 150px reach, 3.5s CD, movement55%. Combo successful hits2/4/6/8/10, 45s CD, swings at0.35/0.85/1.35/1.85/2.35s, ends2.65s, 135px reach both sides, movement30%, no new jumps. Rampage3s, 60s CD, outgoing×1.5, incoming×0.8, speed264px/s; can overlap axe attacks. No damage:3s stun THEN5s at55% movement. |

Melee reach adds target radius (25px normal,14px bat). Normal collision height82px, bat28px. Barbarian heavy has an extra35px of vertical reach only against targets above it (117px center separation against normal fighters); downward reach and combo remain82px. Rampage does not bypass attack movement restrictions. No new generic knife is added to Assassin or Barbarian. All cooldowns begin on activation except bat.

## Exact changes

| Setting | Initial implementation | First three-fighter release | Final |
|---|---:|---:|---:|
| Vampire mechanics | As specified | Unchanged | Unchanged |
| Assassin health/damage | 80;5 /1-or-15 /3-4-5 | Unchanged | Unchanged |
| Assassin katana / dagger / volley CD | 1.5 /3 /7s | 3 /5 /12s | 3 /5 /12s |
| Barbarian health / heavy damage | 120 /10 | Unchanged | Unchanged |
| Barbarian base speed | 204px/s | 216px/s | 216px/s |
| Heavy windup | 0.55s | 0.45s | 0.35s |
| Heavy total action | 0.8s | 0.8s | 0.7s |
| Heavy cooldown | 5s | 5s | 3.5s |
| Heavy horizontal reach | 135px | 150px | 150px |
| Heavy overhead allowance | 0px | 0px | +35px |
| Combo and Rampage | User specifications | Unchanged | Unchanged |

The overhead swing visual now matches its higher arc; its status distinguishes WINDUP from RECOVERY. The 30% heavy cooldown reduction is the largest additional tuning change. Heavy still commits facing, can miss, and retains a visible delay. No health or damage buffs, hit-stun, homing, combo trapping, or changes to Vampire were added.

## Diagnose before tuning

The earlier aggregate concealed a strong strategy split. With the first-release mechanics and original controller, Barbarian beat brawler Assassin16/16 and brawler Vampire12/16, while evasive opponents usually won. Side and engine-role splits were similar, so slot bias did not explain most of the mismatch.

Two controller mistakes were corrected: cooldown-spacing made Barbarian retreat during its own axe swings; and random jumping could commit a delayed melee attack while rising away from a grounded target. Tactical/mobile controllers now follow during committed attacks, avoid that rising-away commitment, and wait out a crossing Bloodsuck before locking a new axe direction. The brawler remains impatient, preserving strategy diversity. These changes affect the simulation, not the intentionally forgiving practice-bot AI.

Correction alone did not fix the matchup. In the final same-controller baseline, Barbarian won31 of288 against Vampire and71 of288 against Assassin. Mechanics therefore contributed substantially.

Candidates tested shorter heavy timing/cooldown, greater movement during the heavy, and an overhead extension. Extra heavy movement was rejected: it did not consistently improve results. The final retains original heavy movement55%, adds overhead reach, and uses3.5s cooldown /0.35s windup /0.7s action. Candidate files and intermediate results are retained as evidence.

## Controlled comparison

**1,944 matches in the final comparison:** four runs of486 (old/new mechanics on training seeds and independent seeds offset270000). Each run has432 cross-character matches:144 per pairing from9 combinations of3 profiles,2 starting sides,2 engine roles,4 seeds; plus54 mirrors. Matches run the actual game update/physics/abilities at60Hz, ending at death or150s. Input resolution alternates. Timeouts are not awarded by remaining HP.

The full focused exploration contains6,318 matches across13 runs, including the1,944 above; intermediate tuning runs are not independent confirmation. The previous pass's1,458 reported matches remain historical evidence, not added to the final comparison's sample size.

| Run | Pair A vs B | A wins | B wins | Timeouts |
|---|---|---:|---:|---:|
| final-baseline | vampire vs assassin | 86 | 57 | 1 |
| final-baseline | vampire vs barbarian | 72 | 17 | 55 |
| final-baseline | assassin vs barbarian | 107 | 35 | 2 |
| final-baseline-holdout | vampire vs assassin | 90 | 52 | 2 |
| final-baseline-holdout | vampire vs barbarian | 81 | 14 | 49 |
| final-baseline-holdout | assassin vs barbarian | 106 | 36 | 2 |
| final-focus | vampire vs assassin | 86 | 57 | 1 |
| final-focus | vampire vs barbarian | 70 | 30 | 44 |
| final-focus | assassin vs barbarian | 62 | 81 | 1 |
| final-holdout | vampire vs assassin | 90 | 52 | 2 |
| final-holdout | vampire vs barbarian | 54 | 31 | 59 |
| final-holdout | assassin vs barbarian | 56 | 87 | 1 |

Combined final results: Vampire vs Assassin176–109 with3 timeouts; Vampire vs Barbarian124–61 with103 timeouts; Assassin vs Barbarian118–168 with2 timeouts. Same-controller baseline was Vampire vs Barbarian153–31 with104 timeouts and Assassin vs Barbarian213–71 with4 timeouts. Barbarian improved on both the training and independent seeds.

## Remaining Vampire counter, by strategy

| Vampire strategy | Barbarian strategy | Vampire wins | Barbarian wins | Timeouts |
|---|---|---:|---:|---:|
| brawler | brawler | 2 | 30 | 0 |
| brawler | tactical | 7 | 19 | 6 |
| brawler | mobile | 5 | 11 | 16 |
| tactical | brawler | 18 | 0 | 14 |
| tactical | tactical | 22 | 0 | 10 |
| tactical | mobile | 21 | 0 | 11 |
| mobile | brawler | 17 | 1 | 14 |
| mobile | tactical | 20 | 0 | 12 |
| mobile | mobile | 12 | 0 | 20 |

Barbarian wins30/32 close-brawler encounters. Against tactical/mobile Vampires across all Barbarian styles it wins only1/192 (the rest are Vampire wins or timeouts). This is not slight imbalance. It reflects real sustain and mobility interactions amplified by scripted reactions: Bloodsuck heals while crossing a direction-committed swing; reactive jumping can avoid attacks; the slow, non-jumping combo can be escaped. The current controllers do not learn feints, double-jump pursuit, platform routing or long-term adaptation. All strategies have access to state information at decision times; none is a model of human perception.

One paired tactical sample (seed2017, side0, role0) illustrates sustain: with first-release mechanics Vampire healed55 over63.73s while Barbarian dealt70 total; with final mechanics Vampire healed60 over59.35s while Barbarian dealt85. Better axe pressure alone does not erase that healing advantage. A universal Barbarian damage/health buff would also amplify its already-dominant close brawls and its now-favorable Assassin matchup. We stopped the bounded pass here rather than claiming parity or changing the user's character designs substantially. Human tests should specifically challenge evasive Vampire and Barbarian pursuit before further tuning.

## Side and role audit (final two runs)

| Pair A vs B | Split | A wins | B wins | Timeouts |
|---|---|---:|---:|---:|
| vampire vs barbarian | side 0 | 66 | 31 | 47 |
| vampire vs barbarian | side 1 | 58 | 30 | 56 |
| vampire vs barbarian | role 0 | 64 | 31 | 49 |
| vampire vs barbarian | role 1 | 60 | 30 | 54 |
| assassin vs barbarian | side 0 | 64 | 78 | 2 |
| assassin vs barbarian | side 1 | 54 | 90 | 0 |
| assassin vs barbarian | role 0 | 60 | 83 | 1 |
| assassin vs barbarian | role 1 | 58 | 85 | 1 |

Both split values improve relative to the old mechanics overall; mirrors and seed variation remain too small for precise human win-rate claims. The independent run used a previously unused seed offset. The three controller algorithms are still the same three algorithms, not hundreds of independent human players.

## Verification and reproduction

43 tests pass, including new overhead hit/escape boundaries, unchanged downward/combo reach and heavy recovery/cooldown behavior. Existing runtime tests still verify windup dodging, escaping a combo, Rampage overlap and15-damage heavy, sequential stun/slow, Vampire abilities, Assassin aim/backstabs/projectiles, fighter resets and sound defaults. Browser checks exercised revised Barbarian against Vampire and Assassin practice bots, displayed cooldowns and axe visuals. Practice bots intentionally move slower and telegraph attacks, so browser exchanges validate functionality rather than competitive balance.

```sh
node --test paper-monsters/tests/*.test.mjs
MECHANICS=./release-1-core.mjs node paper-monsters/balance/simulate.mjs paper-monsters/balance/final-baseline.json
MECHANICS=./candidate-d-core.mjs node paper-monsters/balance/simulate.mjs paper-monsters/balance/final-focus.json
MECHANICS=./release-1-core.mjs SEED_OFFSET=270000 node paper-monsters/balance/simulate.mjs paper-monsters/balance/final-baseline-holdout.json
MECHANICS=./candidate-d-core.mjs SEED_OFFSET=270000 node paper-monsters/balance/simulate.mjs paper-monsters/balance/final-holdout.json
```

The final comparison uses controllerVersion4. Older controllers are frozen in simulate-v1/v2/v3.mjs. Candidate-d-core.mjs matches final public mechanics. FIRST-PASS.md describes the previous release, not the final stats.
