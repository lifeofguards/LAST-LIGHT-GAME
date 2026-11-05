# LAST LIGHT — Expansion contract

The owner loves the current game. **Keep every existing mechanic and the exact graphics style:** chunky low-poly Roblox look, the same palette, lighting, fog, HUD style, and the Deer, the brown bear, flashlight, chopping and fire feeding. New things must look like they were always part of the game.

Already in place, so don't redo them:
- Endless nights. There is no win screen any more; the death screen shows a best-night record.
- Days are 150 s and nights are 55 s (`src/daynight.js`).
- Rabbits drop raw meat, which is cooked at the fire (`src/survival.js`).
- Berry bushes regrow at dawn.

## The loop the owner wants
"Fun and addicting, adventure-game style." You can stay on the starting land and survive endless nights, or push outward. Feeding the fire levels it up, and each level opens more land. On the new land are caves surrounded by wolves. Kill the pack and the last wolf drops the cave key. The final cave is guarded by 4 gray bears; the last one drops its key. Inside that cave is a big gray Alpha bear guarding the Mountain Key, which unlocks a whole new region.

## Fire levels and land (owner: progression agent)
- Four fire levels. Level up by feeding logs. The XP needed per level is cumulative logs fed: L2 at 6 logs, L3 at 16, L4 at 30. Show it in the existing campfire HUD panel as "Lv 2 · 4/10 logs".
- Each level-up gets a "THE FOREST OPENS" card, a flare, and the edge of the land receding.
- Playable radius `G.progression.limitR`: L1 = 60, L2 = 90, L3 = 120, L4 = 150. Raise `MAP_R` in `world.js` to about 160 so trees, bushes and decor fill the whole area; backdrop forest goes beyond it.
- The edge of the unopened land is a readable in-world barrier in the game's style: a wall of dense dark fog and blocking trees, not an invisible wall. The player is kept inside `limitR` (soft push-back).
- Also gate interactions and creature AI to `limitR`.

## Caves (owner: progression agent)
`G.progression.caves` is an array created at construction and never reordered:
```js
{ id: 'wolf1'|'wolf2'|'wolf3'|'bear', type: 'wolf'|'bear', level: 2|3|4|4,
  x, z,            // centre of the cave mound
  entrance: {x,z}, // where the locked gate is
  interior: {x,z}, // centre of the inside chamber
  locked: true, cleared: false }
```
- `wolf1` is in L2 land (r ≈ 72), `wolf2` in L3 land (r ≈ 102), `wolf3` and `bear` in L4 land (r ≈ 132), on different sides of the map.
- Caves are big rock mounds with a dark mouth and a locked gate (planks plus a padlock). Inside is a dark chamber the flashlight matters in, with a reward chest. Wolf caves hold meat, batteries and a better axe on the first open. The bear cave holds the Alpha.
- Keys: when creatures emits `guardiansCleared {caveId, x, z}`, drop a glowing key there. Picking it up with E adds `inventory.keys[caveId]` and shows a key slot in the HUD. Pressing E at the cave gate with that key unlocks it and emits `caveUnlocked {caveId}`.
- When creatures emits `alphaDead {x, z}`, drop the Mountain Key. Use it at the Mountain Gate on the map edge to open the Mountain region: snowy slopes, pale rocks, snow pines, colder light, same art style. Raise `limitR` to cover it and emit `regionUnlocked {id:'mountain'}`.
- Progression owns `getInteraction(p)`: key pickups, gates, chests and the mountain gate. It returns the same shape as the other modules: `{dist, label, action, disabled?}`.

## Creatures (owner: creatures agent)
- **Wolf packs:** 4–5 wolves around each wolf cave, read from `G.progression.caves`.
  - They patrol the cave, notice the player at about 18 m, circle, then dart in to bite (fair telegraph), and retreat from fire light. They are hit with the axe, like the bear.
  - Each drops raw meat (reuse survival's meat pickup; ask `G.survival` for a `spawnMeat(x, z, n)` hook or add one there).
  - The **last** wolf of a pack emits `guardiansCleared {caveId, x, z}`.
  - Packs only activate once their cave's land is open (`fireLevel >= cave.level`).
  - Packs never respawn once cleared.
- **Gray bears:** 4 around the bear cave. They are the brown bear's body recoloured gray and a bit bigger, with similar behaviour. The last one emits `guardiansCleared {caveId:'bear'}`.
- **The Alpha:** a big gray bear inside the bear cave chamber that wakes after `caveUnlocked {caveId:'bear'}`. It has a boss health bar and emits `alphaDead {x, z}`.
- **More animals:** ambient and passive life so the forest feels alive.
  - Foxes, an elk or stag (call it "stag"; it is NOT the Deer monster), birds that fly up when you approach, and owls with eyeshine at night.
  - The Mountain region gets mountain goats.
  - Some are huntable for meat.
- Creatures owns `getInteraction(p)` (can be null) and `threatAt(p)` (0..1, feeds the heartbeat and music).
- Combat: reuse how the axe already damages the bear. Find it in `controls.js`/`bear.js` and generalise it with `G.creatures.hitAt(...)` or similar, keeping the bear working.

## Berries every day (owner: creatures agent, in survival.js)
- Make sure every bush refills at dawn. Verify it actually works.
- Also sprout a few new bushes each dawn across the open land, so there is fresh food every day, especially out in newly opened land.

## Music and sound (owner: audio agent)
- Near the fire (inside about 14 m): a rich, warm fire crackle (pops, hiss, low roar scaled by fuel), and music ducks almost silent.
- Away from the fire by day: procedural Zelda-style adventure music (original tunes). Fingerpicked acoustic guitar or banjo (Karplus–Strong plucks), simple I–IV–V progressions, a gentle upright-bass root, an occasional harmonica or fiddle-like lead. Calm, outdoorsy, loopable without being annoying, with varied phrases.
- As dusk hits it cross-fades into a **thriller score**: low drones, pulsing ostinato, tremolo strings, dissonant swells and heartbeat-synced hits rising with `G.threat`.
- At dawn it cross-fades back.
- New events the other agents emit should get sounds: wolf howls, snarls and bites, gray bear roars, Alpha roar, key pickup chime, gate unlock clunk, fire level-up whoosh, region-unlock fanfare, and animal ambience (bird flaps, owl hoots).
- Event names: `wolfHowl {x,z}`, `wolfBite`, `wolfHurt`, `wolfDie`, `grayBearRoar {x,z}`, `alphaRoar`, `keyPickup`, `caveUnlocked`, `fireLevelUp {level}`, `regionUnlocked`, `animalFlee {type,x,z}`. Subscribe with `G.events.on(...)` and tolerate any event never firing.

## Rules for every agent
- Run `python3 tools/serve.py 8790` only if http://127.0.0.1:8790/health is down. Test in the headless harness: `python3 tools/play.py steps.json --url "http://127.0.0.1:8790/index.html?play=1"`; read its docstring. Use and extend the `window.__game` debug API in `src/debug.js`: add hooks such as `setFireLevel(n)`, `clearPack(id)` and `giveKey(id)` so each piece can be tested without playing for 20 minutes.
- Zero console errors.
- Keep the frame rate sane: instancing, no per-frame allocations, and cheap AI beyond about 60 m.
- Edit only the files you own. For shared files (`main.js`, `debug.js`, `ui.js`, `style.css`, `survival.js`, `world.js`), re-read just before editing and make small exact edits. Never rewrite them wholesale or revert others' work.
- Do not git commit; the lead commits.
