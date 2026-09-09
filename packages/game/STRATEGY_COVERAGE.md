# Scaling-strategy coverage

Audit of `bangalore_rpg_low_cost_scaling_strategy.md` against this package.
Section numbers refer to that document.

## Genre conflict — needs a decision

§21 describes a **crime thriller**: ordinary problems → smuggling → organized
crime. §22 places supernatural content *later*, explicitly so "the original
Bangalore crime-thriller identity remains intact". Nothing in the document
mentions an outbreak or infection.

The previous direction agreed here was Zhelter-style survival: airport as Act 1,
**outbreak on exit**, educational backgrounds converted to survival archetypes.

The systems are genre-agnostic and unaffected either way. What is affected is
seed content: the security guard's foreshadowing line, and whether the four
`PLAYER_BACKGROUNDS` map to survival archetypes or to crime-thriller
approaches (technical / social / observational / financial). **Unresolved.**

## Covered

| § | Requirement | Where |
| --- | --- | --- |
| 4 | One `QuestSystem` fed by data, not per-district systems | `systems/QuestManager.ts` + `data/quests/*.json` |
| 4 | Quest records carry `district` and `type` | `utils/types.ts` `QuestFile` |
| 5–6 | Layer 1 local-first; no server simulation | Entire package runs client-side |
| 8 | NPC tiers 1/2/3 | `NpcDef.tier`, validated |
| 9–10 | District as the unit of expansion, phased | `data/districts.json` (phases 1–2) |
| 11 | Movement, Dialogue, Quest, NPC, Inventory, Economy, Reputation, Save | `entities/`, `systems/` |
| 12 | New content is data, not code | `data/` + glob discovery; validators enforce |
| 14 | No continuous position streaming | Nothing is networked yet; documented in TECH_STACK |
| 17 | One currency (₹), one reputation system | `stats.money`, `ReputationManager` |
| 18 | Progression visible every session | Reputation tier in HUD, quest tracker |
| 19 | Ten reusable quest archetypes | `QUEST_TYPES` |
| 23 | 32×32 tiles, 32×48 characters | `constants.ts`; enforced by map validator |
| 24 | Layered maps | `maps.manifest.json` `layerOrder`, order enforced |
| 25 | Modular asset reuse | Tileset-per-PNG, glob-discovered |
| 26 | PWA-first | `vite-plugin-pwa`, 23 precached entries |
| 28 | Phase 0 complete | Airport, movement, camera, NPCs, dialogue, one mission, currency |
| 30 | Rules 1–4 | Local-first, no needless cloud, reused systems, data-driven |

## Deliberately not built

Per §29 and cost rules 5–7 — these cost time without proving the core game:

| § | Item | Why deferred |
| --- | --- | --- |
| 11 | Combat, Vehicle | Phase 1 vertical slice, after the loop is proven fun |
| 11, 16 | Achievements, Leaderboard | Layer 2; needs accounts first |
| 13, 28 | Temporary 5-min co-op | Phase 4. Single-player must be fun first (rule 5) |
| 15 | Firebase Auth / Firestore / RTDB | Phase 3. Needs a project and credentials |
| 22 | Enemy taxonomy incl. supernatural | Content on a combat system that does not exist yet |
| 27 | Capacitor native builds | After PWA shows player interest |
| 16 | Anti-cheat | Explicitly discouraged for the prototype |

## Notes on decisions

**One currency.** ₹ (`stats.money`) is the single currency; the document's
"POINTS" is the same concept with a less local name. `score`/`addScore` existed
but was **never called** — the HUD showed a permanent `Score 0`. Removed, and
replaced with `totalEarned` (lifetime income, excluding spending) which is what
a §16 leaderboard would actually rank on.

**Reputation is global and per-district.** The tier drives the §3 macro loop
(Outsider → Survivor → Trusted Helper → Fixer → Important Player); local
standing gates an area's deeper missions. Districts can require a completed
quest, a reputation floor, or both — which is how §18's "reputation → new
areas" works without a second currency.

**Save migration.** `SaveData` gained `reputation`, so `SAVE_VERSION` is now
`1.1.0`. Rather than discard older runs, `MIGRATABLE_SAVE_VERSIONS` lists
formats that upgrade forward; anything unrecognised is still refused.

**Map layer taxonomy.** §24's order is now the contract
(`Ground → Walls → Objects → Collision → Above Player → Effects → Foreground`).
The validator rejects a layer named outside it and a map whose layers are
ordered differently — both silently draw the wrong thing otherwise.
