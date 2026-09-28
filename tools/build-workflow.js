export const meta = {
  name: 'last-light-forest-survival',
  description: 'Build a 99-Nights-style Three.js forest survival game: foundation, per-piece builder/critic loops with blind judging, then whole-game integration',
  phases: [
    { title: 'Foundation', detail: 'reference research + base game build' },
    { title: 'Pieces', detail: 'builder -> harsh critic -> blind judge loops per piece' },
    { title: 'Integration', detail: 'fresh agent plays whole game and smooths it' },
  ],
}

const ROOT = '/Users/matthewpool/GAUNTLET AI CLAUDE CODE'
const MAX_ROUNDS = 2

const CONTEXT = `
PROJECT: "LAST LIGHT" — a one-level browser survival game inspired by Roblox's "99 Nights in the Forest": tense, approachable, basic, easy to play, but every detail polished. Three.js, plain ES modules, no build step.
- Game lives in: ${ROOT}/forest/  (entry forest/index.html, code in forest/src/). Three.js is vendored at ${ROOT}/vendor/three.module.js (import as '../../vendor/three.module.js' from forest/src/*.js, or '../vendor/three.module.js' from forest/index.html); addons at ${ROOT}/vendor/jsm/ (e.g. vendor/jsm/postprocessing, utils, math).
- A dev server is ALREADY running at http://127.0.0.1:8790 serving the repo root (no-cache). Game URL: http://127.0.0.1:8790/forest/index.html . Do NOT start another server.
- Headless play harness (parallel-safe, each run gets its own Chrome): python3 ${ROOT}/forest/tools/play.py steps.json [--url URL]. Read its docstring (top of the file) for the step format: wait / key(hold) / press / click / move (mouse-look) / eval (JS in page, prints result) / shot (screenshot PNG). Run it with cwd=${ROOT}. It prints console errors at the end. Rendering is SwiftShader so FPS is low in headless — use the debug API to jump state instead of waiting minutes. Look at screenshots with the Read tool. Put your steps json and screenshots under ${ROOT}/forest/shots/<your-piece-id>/.
- The game MUST expose a debug API window.__game (used by every critic): at least __game.state() -> plain JSON snapshot (phase 'day'|'night', night number, timeOfDay 0..1, player pos/health/hunger/stamina, inventory, equipped, fire fuel, flashlight on/battery, monsters [{type,pos,state}], gameOver/won), __game.setTime(t01) , __game.skipToNight(), __game.teleport(x,z), __game.give(item,count), __game.god(bool), __game.lookAt(x,z) (point the camera/player at a world spot), __game.equip(name). URL param ?play=1 skips the title screen straight into gameplay (pointer lock not required for keyboard play in headless).
- Live progress website: ${ROOT}/forest/progress/<piece-id>.json is shown on a live page the user is watching. Format: {"status":"building"|"judging"|"won"|"lost"|"done","round":N,"note":"one short sentence","gap":"biggest gap or empty","shot":"shots/<piece>/<file>.png"  (path relative to forest/),"history":["short line", ...]}. Keep history, append to it, never erase earlier lines. Update it when you start and when you finish.
- Several agents edit this codebase AT THE SAME TIME. Only edit files your piece owns unless a tiny hook is unavoidable; for shared files (src/main.js, index.html) re-read right before editing and use small exact Edit replacements, never rewrite a shared file wholesale. Never revert others' work. Do not git commit.
- HARD TIME LIMIT: the user has a 1-hour budget for the whole project. Work fast and decisively; favor the highest-impact changes.
`

const DESIGN = `
DESIGN (keep it basic and approachable like 99 Nights, but polished):
- Roblox-like look: blocky low-poly character (R6-style blocky body), chunky readable shapes, flat-shaded/soft materials, saturated-but-muted forest palette by day; night is DARK and scary, fog swallows the tree line, only fire/flashlight make pools of warm light.
- Third-person over-the-shoulder camera, mouse to look (pointer lock on click), WASD move, Space jump, Shift sprint (stamina), E interact, 1/2/3 hotbar (1 axe, 2 flashlight, 3 sack), F toggles flashlight, left click uses equipped item.
- Map: a clearing with the central CAMPFIRE, dense forest ring around it (circular map radius ~120), some berry bushes, a few rocks/logs/stumps. Trees can be chopped with the axe (3-4 hits, tree falls/wobbles, drops logs). Carry logs in the sack (max ~5). Feed the fire with E near it.
- Day ~90s, night ~75s. Goal: SURVIVE 5 NIGHTS. Big "NIGHT 1" style title card when night falls, "DAY 2" at dawn. Win screen after night 5, death screen "You survived N nights" with restart.
- Campfire: fuel drains (faster at night); its light radius shrinks with fuel; ring of light = safe zone. If it dies at night, the Deer comes for you.
- Flashlight: old handheld flashlight with a real cone (SpotLight + visible soft beam), battery drains while on, recharges slowly by the fire; flicker when low. Shining it on the Deer makes it freeze/flinch and back off.
- The Deer: tall, gaunt, antlered humanoid-deer silhouette with glowing eyes, only at night; stalks from the tree line, cannot enter the fire's light, freezes when lit by the flashlight, lunges if you're in the dark and not lighting it.
- The Bear: roams the forest; at night it STALKS you — follows at distance, eyeshine in the dark, low growls, then charges; you can hit it with the axe (it has HP) or run to the fire (it avoids fire light).
- Survival: health and hunger bars; hunger drains, eat berries (E on a bush or item) to refill; hunger at 0 drains health.
- Audio: all procedural WebAudio (wind, crickets at night/birds by day, fire crackle, footsteps on grass, axe thunks, tree fall, bear growl, Deer screech/stinger, heartbeat when threatened). Starts on first user gesture.
- HUD: Roblox-clean: health/hunger/stamina bars bottom-left, hotbar bottom-center, night counter & clock top-center, fire fuel indicator, context prompts ("[E] Add log to fire").
`

const REF = `${ROOT}/forest/reference/99nights.md`

phase('Foundation')
const [refDoc, foundation] = await parallel([
  () => agent(`${CONTEXT}
YOUR JOB: write a precise reference spec of the real Roblox game "99 Nights in the Forest" (by Grandma's Favourite Games) that critics will use as the comparison baseline. Use WebSearch/WebFetch (wiki pages, reviews, video descriptions) plus your own knowledge. Cover, piece by piece, concretely and sensorially (what you see, hear, feel, timings, numbers where known): flashlight/torch (old flashlight, how it looks, the beam, battery, shining at the Deer), the Deer, the Bear and wolves (stalking behavior, sounds, eyes), the campfire (fuel, light radius, feeding logs, upgrades), day/night cycle and atmosphere/fog/lighting, the forest and chopping trees, movement/camera (Roblox third person, sprint), hunger/food/inventory/sack, sound design, HUD/UI/title/death screens, and the overall moment-to-moment tension loop. Also list what makes it approachable and what makes nights scary. Write it to ${REF} (create the directory). Return a 5-line summary.`, { label: 'reference-research', phase: 'Foundation' }),
  () => agent(`${CONTEXT}
${DESIGN}
YOUR JOB (foundation builder): a previous foundation builder was INTERRUPTED partway (session paused). All module files below already exist in ${ROOT}/forest/src/ (~1400 lines, unverified, may not run). Read what exists, keep what is good, and FINISH it into the COMPLETE, playable base game in ${ROOT}/forest/ (replace forest/index.html if it is still the throwaway cube test). It must be fully playable end to end: title screen -> day 1 -> nights -> win/death -> restart. Structure the code so separate specialists can later own and improve each piece independently, one module per piece:
  src/main.js (bootstrap, loop, wiring), src/input.js, src/controls.js (player movement + camera), src/player.js (character model), src/world.js (terrain, forest, trees, chopping, bushes, props), src/daynight.js (sky, sun/moon, fog, lighting, night counter), src/campfire.js, src/flashlight.js, src/monsters/deer.js, src/monsters/bear.js, src/survival.js (health/hunger/inventory/items), src/audio.js, src/ui.js (HUD, title, death, win, prompts; can use HTML/CSS overlay), src/debug.js (window.__game API + ?play=1).
Implement the debug API exactly as described. Use the play harness to verify: no console errors, day and night screenshots look good, chopping works, fire feeding works, monsters appear at night. Set ${ROOT}/forest/progress/foundation.json with status "done" and a representative night screenshot when finished. Aim to finish in ~15 minutes. Return a short list of files and the debug API.`, { label: 'foundation-builder', phase: 'Foundation' }),
])
log('Foundation done: ' + String(foundation).slice(0, 300))

const PIECES = [
  { id: 'flashlight', files: 'src/flashlight.js', focus: 'the feeling of holding the flashlight/torch at night: beam shape, soft falloff, volumetric-ish cone, dust, sway/lag with movement, click on/off, battery drain + low-battery flicker, recharge by fire, how it reveals the forest and makes the Deer freeze.' },
  { id: 'monsters', files: 'src/monsters/deer.js, src/monsters/bear.js', focus: 'the Deer and the bear stalking you after dark: silhouettes, glowing eyes/eyeshine in the dark, stalking at the edge of vision, approach/charge telegraphs, growls/screech hooks into audio, fleeing fire light, freeze when flashlighted, fair-but-scary attacks, bear fight with the axe.' },
  { id: 'campfire', files: 'src/campfire.js', focus: 'the campfire: flames and embers animation, warm flickering light, light radius shrinking with fuel, visible safe-zone edge, feeding logs with a satisfying flare-up, fuel meter, smoke, the dread of it dying at night.' },
  { id: 'daynight', files: 'src/daynight.js', focus: 'day/night cycle and atmosphere: golden sunset, dusk transition, pitch-dark scary night with moonlight and fog, dawn relief, NIGHT N / DAY N title cards timing, sky, stars, fog swallowing the tree line.' },
  { id: 'forest', files: 'src/world.js', focus: 'the forest world and chopping: tree variety and density, Roblox-like chunky low-poly look, ground/grass, the clearing, readable paths, chopping feedback (hit shake, chips, wobble, fall with thud, log drops), bushes, props, forest feeling endless in fog.' },
  { id: 'controls', files: 'src/controls.js, src/input.js, src/player.js', focus: 'movement and camera: Roblox-like third person feel, responsive acceleration, sprint + stamina, jump arc, camera collision/smoothing, blocky character with walk/run/chop animations, head bob-free but alive, item held in hand.' },
  { id: 'survival', files: 'src/survival.js', focus: 'hunger, food, health and inventory: berry bushes that visibly deplete/regrow, eating feedback, sack carrying logs, hotbar item switching, damage feedback (screen flash, knockback), balance so the loop is tense but fair for a first-timer.' },
  { id: 'audio', files: 'src/audio.js', focus: 'procedural sound design: night ambience (wind, crickets, distant howls), day birds, fire crackle by distance, footsteps, axe thunks, tree fall, flashlight click, bear growls with distance/direction, Deer stinger, heartbeat when stalked. Critic cannot hear: verify via code + runtime state (AudioContext running, nodes active, spatial gain changes via __game or window.__audio debug).' },
  { id: 'ui', files: 'src/ui.js (and index.html styles)', focus: 'HUD and screens: clean Roblox-style bars, hotbar, night counter/clock, fire fuel, context prompts, damage vignette, NIGHT N title card, title screen with clear controls, death & win screens, first-time clarity (a new player understands what to do within 10 seconds).' },
]

function builderPrompt(p, round, gap) {
  return `${CONTEXT}
${DESIGN}
You are the BUILDER for one piece of the game: "${p.id}" — ${p.focus}
You own: ${p.files}. Reference spec of the real game: ${REF} (read the relevant section).
${gap ? `A harsh critic compared our game blind against the real 99 Nights and OURS LOST. The single biggest gap they named:\n>>> ${gap}\nFix that gap first and completely, then improve anything else in your piece that still falls short.` : `First pass: make this piece feel as good as or better than the real 99 Nights. Play the game with the harness first to see its current state.`}
Verify your changes in the running game with the harness (screenshots, eval of __game.state(), zero console errors). Update ${ROOT}/forest/progress/${p.id}.json at start (status "building", round ${round}) and at end (note + a screenshot). Work fast (~8 minutes). Return ONLY a one-line list of what changed (the critic will not see it).`
}

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    observation: { type: 'string', description: 'Neutral, concrete, sensory description of how this piece looks/behaves/feels in OUR running game, written as if describing an unnamed game; 8-15 sentences; no verdicts, no mention of which game it is.' },
    broken: { type: 'array', items: { type: 'string' }, description: 'Outright bugs or errors observed' },
    shot: { type: 'string', description: 'best screenshot path relative to forest/' },
  },
  required: ['observation', 'broken', 'shot'],
}

function criticPrompt(p, round) {
  return `${CONTEXT}
You are a HARSH, fresh-eyed CRITIC for the piece "${p.id}": ${p.focus}
Rules: judge ONLY the actual running game via the harness (python3 forest/tools/play.py) — play it, drive it with keys and the __game debug API, take several screenshots (day, dusk, night, near fire, in the dark, during the relevant action) and LOOK at them with the Read tool. Do NOT read builder notes or progress files; you may grep source only to find debug hooks or (for audio) to confirm what actually runs. Be ruthless: anything ugly, confusing, janky, unreadable, missing, or not scary counts.
First set ${ROOT}/forest/progress/${p.id}.json status to "judging" (round ${round}, keep existing history).
Return: a neutral sensory observation of how this piece looks/feels (written anonymously — it will be compared blind against a description of the real game), the list of broken things, and your best screenshot path.`
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    better: { type: 'string', enum: ['A', 'B'] },
    wowed: { type: 'boolean', description: 'true only if the winner would genuinely wow a player who loves 99 Nights' },
    reasoning: { type: 'string' },
    biggest_gap_of_loser: { type: 'string', description: 'the single biggest, most concrete, actionable thing the losing game must fix in this piece' },
  },
  required: ['better', 'wowed', 'reasoning', 'biggest_gap_of_loser'],
}

async function judge(p, obs, round, idx) {
  const refText = await agent(`Read ${REF} and return ONLY a neutral, concrete, sensory 8-15 sentence description of how the "${p.id}" aspect (${p.focus}) looks/behaves/feels in that game, written anonymously (do not name the game, Roblox, or any brand). No verdicts.`, { label: `ref:${p.id}:r${round}`, phase: 'Pieces', effort: 'low' })
  const oursIsA = (round + idx) % 2 === 0
  const A = oursIsA ? obs.observation + (obs.broken.length ? ' Observed bugs: ' + obs.broken.join('; ') : '') : refText
  const B = oursIsA ? refText : obs.observation + (obs.broken.length ? ' Observed bugs: ' + obs.broken.join('; ') : '')
  const v = await agent(`You are a harsh blind judge of game feel. Two games' "${p.id}" aspect (${p.focus}) are described below as A and B. You do not know which game is which. Pick which one is BETTER for a tense, approachable night-in-the-forest survival game. Be demanding: ties go to the one with fewer bugs and more atmosphere. Then name the single biggest concrete gap of the LOSER.\n\n=== A ===\n${A}\n\n=== B ===\n${B}`, { label: `blind-judge:${p.id}:r${round}`, phase: 'Pieces', schema: JUDGE_SCHEMA })
  const oursWon = (v.better === 'A') === oursIsA
  return { oursWon, wowed: v.wowed, gap: v.biggest_gap_of_loser, reasoning: v.reasoning }
}

phase('Pieces')
const results = await pipeline(PIECES, async (p, _o, idx) => {
  let gap = ''
  const hist = []
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    await agent(builderPrompt(p, round, gap), { label: `build:${p.id}:r${round}`, phase: 'Pieces' })
    const obs = await agent(criticPrompt(p, round), { label: `critic:${p.id}:r${round}`, phase: 'Pieces', schema: CRITIC_SCHEMA })
    if (!obs) break
    const v = await judge(p, obs, round, idx)
    const won = v.oursWon && v.wowed && obs.broken.length === 0
    hist.push(`r${round}: ${v.oursWon ? 'OURS WON' : 'ours lost'}${v.wowed ? ' (wowed)' : ''} — ${won ? 'bar met' : 'gap: ' + (v.oursWon ? (obs.broken[0] || 'not wowed; ' + v.reasoning.slice(0, 160)) : v.gap)}`)
    gap = v.oursWon ? (obs.broken.length ? 'Bugs: ' + obs.broken.join('; ') : 'Won but judge was not wowed: ' + v.reasoning) : v.gap
    await agent(`Update ${ROOT}/forest/progress/${p.id}.json: read it, keep existing fields and history, set "status":"${won ? 'won' : 'lost'}", "round":${round}, "shot":${JSON.stringify(obs.shot)}, "gap":${JSON.stringify(won ? '' : gap.slice(0, 300))}, and append this history line: ${JSON.stringify(hist[hist.length - 1].slice(0, 300))}. Write valid JSON. Return "ok".`, { label: `progress:${p.id}:r${round}`, phase: 'Pieces', effort: 'low', model: 'haiku' })
    log(`${p.id} r${round}: ${hist[hist.length - 1].slice(0, 160)}`)
    if (won) return { id: p.id, won: true, rounds: round, hist }
  }
  // final builder pass on the last gap so the last critique is acted on
  await agent(builderPrompt(p, MAX_ROUNDS + 1, gap), { label: `build:${p.id}:final`, phase: 'Pieces' })
  return { id: p.id, won: false, rounds: MAX_ROUNDS, lastGap: gap, hist }
})

phase('Integration')
const integ = await agent(`${CONTEXT}
${DESIGN}
You are a FRESH integrator with no prior context. Nine specialists just improved separate pieces of this game in parallel. Your job: PLAY THE WHOLE GAME end to end with the harness (title -> day 1 chopping/feeding fire/eating -> night 1 with flashlight, Deer and bear -> dawn -> skip ahead through nights -> win; also a death -> restart) and smooth everything into ONE coherent game: fix integration bugs, console errors, conflicting lighting/fog/exposure between pieces, HUD overlaps, inconsistent art style or color palette, broken hooks between modules, difficulty balance for a first-time player, and anything that feels disjointed. Also make sure the title screen and first 10 seconds instantly teach the player what to do. Set ${ROOT}/forest/progress/integration.json (status building -> done, with a night screenshot and notes). Leave ${ROOT}/forest/README.md with how to run and controls. ~10 minutes. Return a concise list of what you fixed and anything still weak.`, { label: 'integrator', phase: 'Integration' })

return { results, integ }
