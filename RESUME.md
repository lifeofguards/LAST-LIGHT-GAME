# LAST LIGHT — where the demo stands

Playable end to end with no console errors: title screen, chop trees, feed the fire, eat berries, the Deer and the bear at night, survive 5 nights to win, and death with restart.

It was built by three rounds of builder → critic → blind-judge loops, one per piece. Each blind judge compared the game against a written spec of Roblox's *99 Nights in the Forest* (`reference/99nights.md`). Ours still lost on all 9 pieces. Each piece's last judged gap is in `progress/<piece>.json`. The final fix aimed at each gap was never judged.

## Biggest open gaps (start here)
1. **Camera.** The player's body hides the axe hits and the bear's rear-up and charge, and the camera snaps close when a trunk passes between it and the player. This one fix affects the monsters, forest and controls pieces.
2. **Flashlight.** A black arc cuts off the side of the light pool. It's probably the player casting a shadow from the spotlight.
3. **Night lighting deep in the woods.** It's near black, with a teal blob on the canopy. It needs a cold moonlight fill.
4. **Food balance.** Hunger never creates pressure.
5. **Campfire safe-zone ring.** The judges flip-flopped between a visible ring and a soft falloff. This is a design call.

## Tools
- `python3 tools/serve.py 8790`, then open http://127.0.0.1:8790/index.html. The progress page is at /progress.html.
- `tools/play.py`: headless-Chrome play harness (steps JSON: wait / key / press / click / move / eval / shot). It uses the `window.__game` debug API, which is in `src/debug.js`.
- `tools/build-workflow.js`, `tools/wave2.js`, `tools/wave3.js`: the orchestration scripts used to build the game. Their absolute paths point at the original working folder.
