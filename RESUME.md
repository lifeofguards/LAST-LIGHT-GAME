# LAST LIGHT — where the demo stands

## Session saved 2026-11-05: pick up here
The adventure expansion is done and pushed (commits 008d4c3, e8b157b, 0421387):
- endless nights, with 150 s days and 55 s nights
- berries every dawn
- 4 fire levels that open land, plus a fire-level HUD
- 3 wolf caves and the Bear Cave (4 gray bears plus the Gray Alpha), with keys and the Mountain region
- more animals
- fire crackle, plus a Zelda-style day score and a thriller night score (`src/music.js`)

The full design is in `docs/EXPANSION.md`.

**Next: the deployed URL. It is blocked on GitHub sign-in.**
- The Chrome that Claude controls (Claude in Chrome) is NOT signed in to GitHub, and the `gh` CLI isn't logged in. SSH push works.
- The owner already approved making the repo public. Once someone is signed in as lifeofguards:
  1. In Settings → Danger Zone, choose Change visibility → Public.
  2. In Settings → Pages, set Source to GitHub Actions.
  3. Push or re-run `.github/workflows/pages.yml`.
  4. Check https://lifeofguards.github.io/last-light-demo/ and add the link to the README.

**Open for later:**
- Multiplayer (deferred by the owner).
- Nobody has listened to the music by ear yet.
- The Gray Alpha may be too tough.
- Caves are very dark.
- The walk from the Ridge Den to the Bear Cave is long.

**Local play:** run `python3 tools/serve.py 8790`, then open http://127.0.0.1:8790/index.html. Add `?play=1` to skip the title.

---

## Earlier notes (pre-expansion)

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
