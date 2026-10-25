You are the CONTENT worker on the HYPERNOVA game build. Your job is data only: the tables that
define the game's content. The numbers below are DECIDED by the project manager — use them
exactly. Your creative work is the names, the flavour text, and the colour palettes.

READ FIRST:
1. docs/INTERFACES.md §5 — the exact export shapes and the rules a test enforces.
2. tests/content.test.js — the test your file must pass. Read it; it is the law.
3. docs/DESIGN.md — the theme (feeding a star that escalates into a hypernova).

WRITE THIS ONE FILE, COMPLETE AND RUNNABLE: src/core/content.js
It must contain NO logic except plain exported arrays. No imports.

## INJECTORS — exactly 12, in this order, with these exact numbers:
| tier | id | baseCost | costGrowth | baseRate | unlockAt |
|---|---|---|---|---|---|
| 0 | ion_spark | 15 | 1.15 | 0.1 | 0 |
| 1 | plasma_coil | 100 | 1.15 | 1 | 50 |
| 2 | fusion_ring | 1100 | 1.15 | 8 | 600 |
| 3 | gravity_well | 12000 | 1.15 | 47 | 7e3 |
| 4 | star_forge | 130000 | 1.16 | 260 | 8e4 |
| 5 | pulsar_array | 1.4e6 | 1.16 | 1400 | 9e5 |
| 6 | quasar_lance | 2e7 | 1.17 | 7800 | 1.5e7 |
| 7 | nebula_loom | 3.3e8 | 1.17 | 44000 | 2.5e8 |
| 8 | dark_reactor | 5.1e9 | 1.18 | 2.6e5 | 4e9 |
| 9 | singularity_engine | 7.5e10 | 1.18 | 1.6e6 | 6e10 |
| 10 | hypernova_core | 1e12 | 1.19 | 1e7 | 8e11 |
| 11 | vacuum_tap | 1.5e13 | 1.19 | 6.5e7 | 1.2e13 |
Write numbers as JS numeric literals (1.4e6 is fine). Names: cosmic/engineering flavour, one
short evocative blurb each (max 90 chars).

## STAGES — at least 15, `at` thresholds exactly:
0, 500, 5e3, 5e4, 5e5, 5e6, 5e7, 5e8, 5e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15
Names in order: SPARK, EMBER, PLASMA, PROTOSTAR, RED GIANT, BLUE GIANT, SUPERNOVA, NEUTRON STAR,
MAGNETAR, QUASAR, BLAZAR, HYPERNOVA, GALAXY FORGE, STELLAR KINGDOM, SINGULARITY.
`detail` 1..6 (rise slowly, cap 6), `bloom` 0.35 -> 1.6 (rising), `orbit` 1.0 -> 2.2,
`camDist` 6.0 -> 9.0 (early) then back to 5.0 for the final stages (closer = more intense).
Palettes must evolve: warm amber -> orange -> white-hot -> blue-white -> violet -> cyan -> gold.
All colours 6-digit lowercase hex. Each palette must keep `bg` very dark (luminance < 0.15).

## UPGRADES — at least 46, built mechanically from these rules:
(a) For EACH of the 12 injectors, two `injector_mult` upgrades:
    id `<injector>_x2a`, mult 2, requires { injector: <id>, count: 10 }, cost = round(baseCost*20)
    id `<injector>_x2b`, mult 2, requires { injector: <id>, count: 25 }, cost = round(baseCost*400)
(b) Ten `global_mult` upgrades, mult 1.5/2/3 escalating, requires { totalFlux: X } with X =
    2e3, 2e4, 2e5, 2e6, 2e7, 2e8, 1e9, 1e10, 1e11, 1e12 and cost = X * 2.5.
(c) Fourteen `mechanic` upgrades using ONLY these keys/values (cost = the value shown in the
    `cost` column; requires.totalFlux = cost/4):
    auto_pulse_1   {autoPulse,1}      cost 4e3        auto_pulse_2   {autoPulse,3}   cost 2e6
    combo_ret_1    {comboRetention,0.25} cost 2e4     combo_ret_2    {comboRetention,0.35} cost 5e6
    wide_window_1  {chargeWindow,0.25}  cost 1e4       wide_window_2  {chargeWindow,0.30}  cost 3e7
    crit_boost_1   {critMult,1}       cost 8e4         crit_boost_2   {critMult,2}    cost 4e8
    od_long_1      {overdriveDuration,4} cost 6e4      od_long_2      {overdriveDuration,6} cost 8e8
    od_power_1     {overdriveMult,2}  cost 2e5         od_power_2     {overdriveMult,3} cost 6e9
    chain_1        {chainSurge,1}     cost 5e6         offline_boost  {offlineFrac,0.25} cost 1e6
    auto_collapse  {autoCollapse,1}   cost 5e11
    (that is 15 — include all of them)
Names should read like technology of a civilisation that learned to farm stars.

## MECHANIC_KEYS — export exactly:
['autoPulse','comboRetention','chargeWindow','critMult','overdriveDuration','overdriveMult',
 'chainSurge','offlineFrac','fluxMult','autoCollapse']

## PERKS — at least 12, bought with Shards. Costs 2..400 (integers, rising). Use only legal
effect keys. Suggested set (you may add more): comboRetention, chargeWindow, critMult,
overdriveDuration, overdriveMult, chainSurge, offlineFrac, autoPulse, fluxMult.
`requires` may use { collapses: N } or { totalShards: N } or { ascends: N }.

## ACHIEVEMENTS — at least 26, using only the allowed counters listed in the test
(pulses, crits, perfects, collapses, ascends, overdrives, totalFlux, stageIndex, injectorsTotal,
upgradesOwned, playSec). Cover the real progression: first pulse, 100/1000/10000 pulses, first
crit, 50 perfects, first overdrive, 10 overdrives, each of the first 6 stages, first collapse,
5 collapses, first ascend, 1e6/1e9/1e12/1e15 totalFlux, 25/100 injectors owned, 10/30 upgrades,
1h played. Witty but short names.

SELF-TEST (must pass before you finish, and you must paste its real output):
  cd /home/hermes/projects/hypernova
  node --check src/core/content.js
  node --test tests/content.test.js
Iterate until the test passes. Do not edit the test.

Finish by printing the absolute path you wrote, the test output, and the word DONE.
