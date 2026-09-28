# LAST LIGHT

A one-level browser survival game inspired by Roblox's *99 Nights in the Forest*. Keep the campfire burning and survive 5 nights. By day you chop trees and gather berries. At night you stay in the fire's light while the Deer and the bear hunt you.

Three.js with plain ES modules. There is no build step.

## Run

From the repo root, serve the folder with any static server, then open `index.html`:

```
python3 -m http.server 8790        # or: python3 tools/serve.py 8790
open http://127.0.0.1:8790/index.html
```

Add `?play=1` to skip the title screen. Three.js is vendored in `vendor/`; there is no build step.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look (click the game to lock the pointer) |
| Shift | Sprint (uses stamina) |
| Space | Jump |
| Left click | Use the equipped item (swing the axe, shine the flashlight) |
| E | Interact: chop a tree, pick up a log, pick berries, add a log to the fire |
| 1 / 2 / 3 | Axe / flashlight / sack |
| F | Toggle the flashlight |
| Q | Eat a berry from your pocket |
| Mouse wheel | Camera zoom |
| M | Mute |
| R | Restart from the death or win screen |

## How to survive

- **Day (~90 s):** chop trees (3 to 5 hits), pick up the logs (the sack holds 5) and press E at the campfire to feed it. Berry bushes grow out in the forest. They refill hunger, and they regrow at dawn.
- **Night (~75 s):** the fire burns faster at night. Its glowing ring marks the safe zone, and the ring shrinks as the fuel drops. The Deer can't enter the light and freezes when you hold your flashlight on it. The bear stalks you in the dark, avoids the fire, and can be fought with the axe.
- If the fire goes out at night, the Deer comes for you. Relight the fire with a log.
- The flashlight battery drains while the light is on and recharges near the fire.
- Survive night 5 to win.

## Code map

`src/main.js` handles bootstrap and the main loop. Each system has its own module: `world`, `player`, `controls`, `daynight`, `campfire`, `flashlight`, `monsters/deer`, `monsters/bear`, `survival`, `audio` and `ui`. `src/debug.js` exposes `window.__game` (`state()`, `setTime`, `skipToNight`, `setNight`, `teleport`, `give`, `god`, `lookAt`, `equip`, `spawnDeer`, `kill`). The headless play harness is `tools/play.py`.
