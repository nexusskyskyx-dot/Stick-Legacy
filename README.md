# ⚔ Stick Legacy

A 2D side-scrolling **stick-figure RTS** built as a tribute to classic stick-war gameplay
(Stick War: Legacy style). Mine gold, train an army of stick warriors, take direct control
of any soldier, and **topple the enemy statue** before yours falls.

Everything — every unit, animation, sound effect and the war-drum soundtrack — is
**generated in code** (Canvas 2D + WebAudio). No sprites, no assets, no build step:
it's a pure static site, ready to deploy on Vercel / Netlify / GitHub Pages.

![Stick Legacy](https://img.shields.io/badge/HTML5-Canvas-orange) ![zero dependencies](https://img.shields.io/badge/dependencies-0-green)

## 🎮 How to play

Your statue (left) is your life. The enemy statue (right) is the target.

| Action | Control |
|---|---|
| Train Miner / Swordwrath / Archidon / Spearton / Magikill / Giant | `1` `2` `3` `4` `5` `6` (or click the cards) |
| All-out attack / defend orders | `F` / `G` (or the order buttons) |
| Select one of your units | Left-click it |
| **Take direct control** (possess) | Double-click it, or `C` |
| Move / attack while controlling | `A` `D` move · `Space` attack (miners: mine gold at the mine, auto-deposit at the statue) |
| Release control | `Esc` |
| Move / attack-move order for selected unit | Right-click the ground / an enemy |
| Pan camera | `←` `→`, drag, mouse wheel, or click the minimap |
| Jump camera to base / front line | `H` / `N` |
| Pause / mute | `P` / `M` |

**Economy:** Miners walk to the gold mine, swing their picks (3 strikes = 22 gold),
and haul the load back to your statue. More miners → faster army.

**Units:**

| Unit | Cost | Role |
|---|---|---|
| ⛏ Miner | 70 | Economy; defends itself with a pick |
| 🗡 Swordwrath | 130 | Fast, cheap melee swarm |
| 🏹 Archidon | 220 | Long-range arrows, fragile up close |
| 🛡 Spearton | 300 | Helmeted tank: spear + shield |
| 🔮 Magikill | 480 | Lobs exploding orbs (area damage) |
| 👹 Giant | 1500 | Screen-shaking colossus (4 pop) |

## ✨ Features

- **Procedural stick-figure animation** — full skeletal poses computed per frame:
  walk/run cycles, sword wind-up & slash, spear thrusts, bow draw-and-release,
  staff charging, pick swings, giant club smashes, hit recoil, and backward toppling deaths.
- **RTS + direct control hybrid**, just like the genre classic: command the army with
  global stances, then possess any single unit and fight it yourself.
- **Enemy AI commander** with grace-period build-up, evolving army composition
  (swords → archers → spears → mages → giants), attack waves, regrouping, and
  three difficulty levels.
- Living battlefield: parallax mountains, drifting clouds, birds, swaying grass,
  fortified bases with waving banners and flickering torches, glinting gold mines,
  cracking & crumbling statues with slow-motion destruction.
- Particles everywhere: blood, stone chips, gold sparks, walking dust, arrow trails,
  explosion rings, floating gold text.
- **100% procedural audio** — sword clashes, bow shots, coin dings, booms, and a
  looping tribal war-drum soundtrack synthesized with WebAudio.
- Minimap with click-to-jump camera, unit cards with procedurally drawn icons,
  population & gold HUD, kill counter, battle timer, victory/defeat stats screen.
- Attract mode: the menu background is a live AI-vs-AI battle.
- Mobile-friendly: touch drag to pan, on-screen controls while possessing a unit.

## 🗂 Project structure

```
index.html          page shell, HUD & overlays
css/style.css       stone-and-parchment UI theme (scales with viewport)
js/config.js        constants, unit stats, difficulty tuning
js/util.js          math helpers, seeded RNG
js/audio.js         procedural WebAudio SFX + war-drum music
js/stickman.js      skeletal poses & stick-figure renderer (the animation engine)
js/game.js          simulation: units, economy, combat, projectiles, particles
js/ai.js            enemy AI commander (also drives the menu demo battle)
js/renderer.js      battlefield rendering: parallax, bases, mines, statues, effects
js/ui.js            DOM HUD, menus, minimap, input
js/main.js          bootstrap & game loop
tests/smoke.mjs     headless simulation test (node tests/smoke.mjs)
```

## 🚀 Run locally

No dependencies, no build — serve the folder over any HTTP server:

```bash
python3 -m http.server 3000
# or: npx serve .
```

Open http://localhost:3000. (ES modules require HTTP — `file://` won't work.)

## ▲ Deploy on Vercel

Zero config: import this repository in Vercel (Framework: *Other*, no build command)
or run:

```bash
npx vercel --prod
```

## 🧪 Tests

```bash
node tests/smoke.mjs
```

Simulates minutes of accelerated gameplay headlessly (economy, waves, projectiles,
possession, statue destruction) and renders every frame through a stub canvas.

## ⚖️ Note

Stick Legacy is an original fan-made tribute. It is not affiliated with, endorsed by,
or derived from assets of Max Games / Stick War: Legacy — all code, art and audio
here are original, generated procedurally at runtime.
