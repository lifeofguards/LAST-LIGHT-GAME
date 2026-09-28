# Reference spec: "99 Nights in the Forest" (Roblox, Grandma's Favourite Games, 2025)

This is the baseline critics compare LAST LIGHT against. Each section gives: **what the original does** (from wikis, guides, and gameplay knowledge), then **what "good" looks like for LAST LIGHT**, a one-level, single-player browser version. Numbers marked (wiki) are sourced. Numbers marked (obs) come from gameplay knowledge and are approximate. Numbers marked (target) are suggested values for our game.

---

## 0. The pitch in one breath
You wake up in a dark forest next to a campfire. By day you walk out from camp, chop trees, and haul logs and food back. By night the light shrinks and the forest fills with glowing eyes. A tall antlered thing called **the Deer** hunts you, and the only things it fears are **light**: your flashlight beam and the campfire's ring. Keep the fire alive, keep yourself fed, and make it to morning. Every run follows the same loop: **go out, gather, rush back before dark, hold the ring.**

---

## 1. Day/night cycle, atmosphere, fog, lighting
**Original**
- Day is about **3 min** and night about **1 min 30 s** of real time, so a full cycle is about 4.5 min (wiki/guides). The night *feels* longer because you are pinned to camp.
- A banner shows the day count ("Day 1", "Night 3"). Nightfall gets a short title card, and special nights announce themselves (e.g. **"The Deer is Hungry Tonight"**, wiki).
- **Day:** a warm, low-saturation Roblox look. You get soft sun, long tree shadows, and light-grey haze that hides the distant trees. You can see about 60–100 studs, so the forest never ends and the camp's clearing is readable.
- **Dusk (about the last 20–30 s of day):** the sky shifts through orange and purple, shadows lengthen, and fog thickens and darkens. Players read dusk as **"go home now"**. That rush back to camp is a signature beat.
- **Night:** nearly black. The fog turns deep navy/black and visibility without light drops to **about 10–20 studs** (obs). The sky is dark blue with faint stars. Tree trunks are only silhouettes against slightly lighter fog. The only warm color in the world is the campfire's orange ring and your flashlight's yellow cone.
- Morning comes as a quick lightening of the fog and sky. Monsters retreat and the Deer flees "as morning approaches" (wiki). You feel relief, and a day-survived tick shows up.

**LAST LIGHT target**
- Cycle about 150–240 s total with night about 35–40% of it, compressible for demos. Expose `timeOfDay` 0..1.
- Four readable phases (day / dusk / night / dawn) that lerp **fog color, fog density, sky color, hemisphere/ambient intensity and sun intensity and angle**. Night ambient should be low enough that the flashlight and fire visibly *make* the scene. Nothing should be pure black, though: keep a dim blue moonlight so shapes read.
- Put a dusk warning on the HUD ("It's getting dark…") plus an audio cue.

---

## 2. The campfire (the heart of the game)
**Original**
- It sits in the center of the starting clearing with a few log benches around it (benches appear at Level 2, wiki). There are chunky low-poly logs and bright orange/yellow flame parts that flicker, sparks and embers rise, and a warm point light lights the ground in a wide circle.
- **Fuel constantly depletes** (wiki). A **fuel bar/meter hangs above the fire** (a billboard GUI) so you can read it from a distance.
- **Feeding:** you carry logs (or coal, fuel canisters, and so on) and **drop or throw them into the fire**. The flames flare, the fuel bar jumps, and a crackle/whoosh plays. Logs are the bread-and-butter fuel.
- **Levels 1–6** (wiki): enough fuel levels the fire up. Each level extends the **safe radius**, lasts longer, and expands the explorable map. Visuals grow per level: benches (L2), a ring of 6 rocks (L3), then 12 rocks (L4), then a stone base (L5 and L6).
- **Safe zone:** a visible **ring/boundary on the ground** marks it. Monsters "automatically stop at the edge of the Campfire and don't enter inside the marked radius" (wiki). Wolves and bears disengage when you get near a lit fire. Standing close **regenerates health**, and "standing on top of the fire" heals fast (wiki). It also recharges your flashlight battery (wiki).
- **If it goes out:** the fire icon vanishes and **the Deer spawns right next to the campfire, hungry, and charges** (wiki). This is the worst thing that can happen and players know it.

**LAST LIGHT target**
- One fire with visible flicker (animated flame meshes or sprites plus a PointLight whose intensity jitters around 0.8–1.2x at about 8–12 Hz with smoothing), rising embers, and a warm light pool about 12–18 m radius at full fuel.
- The **light radius and safe radius scale with fuel**: as fuel drops, the ring visibly shrinks and the light dims. Players should *see* the danger growing.
- Fuel drains continuously, roughly 1 full bar per about 1.5–2 cycles with no feeding, faster at night if we want tension. Each log adds a big, satisfying chunk (flare, spark burst, crackle sound). Show a clear fuel bar (world billboard or HUD).
- Health regenerates inside the ring and the flashlight recharges inside the ring.
- A monster at the ring edge stops, paces, and glares; it does not enter. If the fire hits zero, the Deer gets the player: a big, fair, telegraphed fail state.
- Optional: one "upgrade" moment (fuel over a threshold grows a rock ring or bigger fire) so feeding feels like progress.

---

## 3. Flashlight / torch
**Original**
- You **start with the Old Flashlight** (the Strong Flashlight is a later upgrade). It is worn, small and long, with a small lens that throws a **yellowish light** (guides). You hold it in the right hand in third person, and it is equipped from the hotbar.
- The beam is a **narrow-to-medium cone spotlight** with a soft falloff and a bright center. It lights tree trunks and the ground in a warm oval, and it is visible from other angles as the only lit area in black fog.
- **Battery:** it has a limited charge that drains while on. It **recharges at the Campfire or by touching Fireflies** (wiki). About 6 firefly pickups fully charge the Old Flashlight (guides). A dead flashlight = you're blind.
- **Shining it at the Deer stuns it briefly.** The Deer freezes and recoils, and you run. **Each successive stun is shorter and the Deer gets faster** afterwards (wiki), so the flashlight buys time and is not a win button. It also stuns the Owl and the Ram, and it aggravates the Owl (wiki).

**LAST LIGHT target**
- F toggles it (or the equip key), with a physical **click** sound on and off.
- Use a SpotLight at about 25–35° cone, penumbra 0.4–0.6, range about 25–35 m, warm white/yellow (#ffe9b0-ish). Add a faint volumetric cone or dust motes for readability, a small visible flashlight mesh in hand or at the camera, and slight sway or lag when turning.
- The battery drains while on (about 60–90 s of continuous use per full charge) and recharges near the fire. **Low battery flicker**: below about 20% the beam stutters and dims randomly. That is a key tension detail.
- **Beam on the Deer**: while the Deer is inside the cone and within range, it stuns for about 1.5–3 s (it staggers, screeches, and covers its face), with diminishing duration per stun. Give clear feedback: a sound sting and the Deer's eyes flaring.

---

## 4. The Deer (primary night threat)
**Original** (wiki)
- It is a **tall, wide, deer-like creature** with a large head and an **outstretched, gaping jaw**, big dark antlers, and **clawed forelegs**. It is brown and fades to black at the hooves, antlers, and claws. It is a *facultative biped*: it **stands upright on two legs** when idle or stalking and **drops to all fours to sprint**.
- Its **eyes have white sclera**. When it is **Hungry they glow bright red**. In the dark, the eyes are often the first thing you see.
- It is **invulnerable**, and weapons do nothing. It is only stunned by light and fears the campfire.
- It becomes active at night and **targets the nearest player**. It starts **slower than a sprinting player but accelerates the longer the chase lasts**. Its pathfinding is poor, so it can be blocked by big trees or buildings. It **will not enter the campfire zone** unless the fire is out, and it flees at dawn.
- A Hungry night brings more speed and damage and more resistance to light.
- Feel: it doesn't sprint at you from the start. It **appears at the edge of your light, standing still, watching**, then closes in. Players describe the dread of turning the flashlight and finding it already standing there.

**LAST LIGHT target**
- A tall silhouette (about 2.5–3 m standing) with antlers, a long jaw, and thin limbs, dark enough to read as a silhouette against the fog, plus **two emissive eyes** visible *beyond* the light radius.
- States: `dormant` (day), `stalk` (keeps about 15–25 m from the player, lurks at the edge of vision, freezes when looked at or lit), `chase` (drops to all fours, accelerating from about 0.8x to about 1.2x the player's sprint), `stunned` (by the flashlight), `repelled` (paces at the ring edge), `flee` (at dawn).
- Telegraph an attack with a sound (a guttural bellow or wet breathing that rises in volume). Contact does heavy damage (about 35–50) with a knockback and screen flash, then a short retreat. It should never feel cheap: the player must always have a warning.

---

## 5. Wolves and the Bear
**Original** (wiki)
- **Wolves** have sharp teeth, long ears, short legs, and a small tail. They are grey-brown and low-poly. They **spawn at night** (anywhere), **despawn at daylight**, and come in **packs/hordes**. They wander until you enter their detection radius or hit them, then pursue and bite. They **retreat when you leave their radius or approach a lit campfire**. They drop Morsels (2–3), a Steak (1), and sometimes a Pelt. At night, their **eyes glow** in the fog, and you hear howls in the distance before you see them.
- **Bear:** a brown bear with a **tan muzzle and underbelly**. It is big, with high HP and damage and a large attack reach. It wanders until you enter its detection radius, then **charges**, and it disengages when you leave the radius or reach a lit fire. It drops 6 Morsels and 3–4 Steaks. It can get stuck on terrain.

**LAST LIGHT target (keep it small)**
- 2–4 wolves at night. They circle the edge of the light with glowing eyes, dart in for a bite (about 10 damage), and back off from the flashlight and fire. A distant **howl** at nightfall announces them.
- Optional: one bear that wanders a zone by day and night. It gives a low **growl** when it notices you, then a charge that hits hard (about 30), and it gives up when you outrun it or reach the fire.
- Every monster reports `{type,pos,state}` in `__game.state().monsters`.

---

## 6. The forest and chopping trees
**Original**
- The map is a dense, square-ish forest of **stylized low-poly trees**: tall pines, blocky trunks, and green cone or sphere foliage. There is a grassy green ground, scattered rocks, bushes, berry bushes, and carrot patches, plus a few structures further out (cabins, caves, a fence that the campfire level unlocks). Fog hides the map edges.
- **Chopping:** you equip the **Old Axe** (the starting tool) and click a tree. Each hit plays a **wood "thock"** sound, wood chips fly, and the tree shakes. After several hits the tree **falls and breaks into Logs** (chunky brown cylinders) lying on the ground. Small trees give 1 log, and bigger trees give more and need a better axe. Stumps remain.
- Logs are physical objects. You **pick them up** (into the sack or carried) and **haul them back to the fire**. The walk back carrying logs is the core day activity.

**LAST LIGHT target**
- Randomized but hand-tuned tree placement (a few hundred trees) with a **clear clearing around the fire** (radius about 12–15 m) and denser forest further out. The farthest trees fade into fog.
- About 4–6 axe hits per tree, each with a sound, chip particles, a small trunk shake or tilt, and a hit crosshair feedback. The tree topples with a creak and a thud, leaves 1–3 logs and a stump, and the tree is removed.
- Walk-over or E pickup of logs, visible log count in the HUD, and dropping a log at the fire adds fuel (E near the fire = "Add log").
- Food is scattered around: berry bushes and carrots near camp.

---

## 7. Movement and camera
**Original** (standard Roblox)
- A **third-person over-the-shoulder/orbit camera**: right-drag (or shift-lock) rotates it and the scroll wheel zooms from close to first-person out to about 15 studs. Many players play with shift-lock, where the character faces the camera direction.
- **WASD** walking at about 16 studs/s (Roblox default). **Shift sprint** is common in survival games (this game's sprint is limited by a stamina bar that drains while running and recovers when walking). **Space** jumps.
- The blocky Roblox avatar with simple walk and run animations. The movement is snappy and responsive with no inertia, which makes it easy for anyone.
- Mobile support means everything is doable with a few big buttons, so the control scheme is minimal.

**LAST LIGHT target**
- Third-person or first-person with pointer-lock mouse look (either is acceptable; third-person reads closer to the original). The camera should be smooth, with no jitter and slight lag on follow, and it collides with trees and does not clip.
- WASD at about 4.5–5 m/s, Shift sprint at about 7.5–8 m/s draining stamina (about 6–8 s of sprinting, recovering in about 4 s), Space jump. Instant response, footstep sounds by surface, and gentle head/camera bob when walking.
- Controls shown on the title screen and in a first-seconds hint.

---

## 8. Hunger, food, inventory, sack
**Original**
- There are **health and hunger bars** in the HUD. Hunger drains over time, and at zero you start losing health.
- Food (wiki): **Carrot 1, Berry 1** hunger unit (raw, from the forest near camp). Morsel and Steak are **cooked at the campfire** for 2, while raw meat damages you. Corn is 2, and Pumpkin and Stew are 4 ("half of a player's hunger", so max about 8 units).
- **Sack:** the Old Sack holds **5 items**, the Good Sack 15, and the Giant Sack 25. Items come out **in the order they were put in** (FIFO) (wiki). You fill it with logs, food, and scrap, and empty it at camp.
- A **hotbar** of tools (Old Axe, Old Flashlight, Old Sack, and so on) is selected with number keys 1–n and shown as simple rounded icon slots along the bottom.

**LAST LIGHT target**
- Hunger drains about 1 bar per 1.5–2 cycles, and at zero, health drains slowly. Eating shows an animation or sound (crunch) and a bar tick up.
- Show a sack with a visible capacity (e.g. "Logs 3/5") and a hotbar with 1 Axe, 2 Flashlight, 3 Food, with the active slot highlighted. Keep it minimal and readable.

---

## 9. Sound design
**Original / genre expectations**
- **Day:** light birdsong, wind in the leaves, soft footsteps on grass, and the axe thock. There is a gentle, calm background.
- **Campfire:** a continuous **crackle loop** that gets louder with proximity, with a whoosh or flare when fuel is added. It is the "safe" sound.
- **Dusk to night transition:** the birds stop and a **low drone/wind** takes over. You hear crickets and occasional twig snaps in the distance.
- **Night:** **wolf howls** far off, rustling in the bushes behind you, and the Deer's **deep, distorted bellow/scream**. A **chase stinger** comes in as a rising heartbeat plus a tense music loop when the Deer is close. The flashlight **click** is audible.
- **Hit/death:** a thud, a player grunt, and a heavy sting on death.
- Sound direction matters: players locate threats by ear in the dark.

**LAST LIGHT target**
- WebAudio (synthesized is fine): positional crackle at the fire, ambience that crossfades day to night, an axe hit, a log thud, a flashlight click, footsteps, a wolf howl, a Deer bellow, a heartbeat rising with proximity to monsters, and a dawn relief chime. The audio starts after the first user gesture. Include a master volume or mute.

---

## 10. HUD, title, death, and win screens
**Original**
- **HUD:** bottom-center hotbar slots, bars for health (red/green), hunger (orange), and stamina, the day counter at the top ("Day 3"), and a campfire fuel indicator (the billboard above the fire, with a fire icon that disappears when it's out). It uses big, chunky Roblox UI with a rounded font (Gotham/Fredoka-like) and a white text stroke.
- **Title/lobby:** a lobby with a truck that takes you to the forest, the logo "99 NIGHTS IN THE FOREST" in hand-drawn/grungy lettering over a dark forest, and a big **Play** button.
- **Nightfall banner:** a centered, fade-in "Night 2" type card. There are special-night announcements.
- **Death:** a "You died" screen with **"You survived X days"** and options to respawn or return to the lobby. The emphasis is on the number of days survived.
- **Win:** reaching night 99 (for our one-level version: surviving the night or N nights) gives a celebratory ending.

**LAST LIGHT target**
- The title screen shows the game name over a moody forest render with a campfire glow, Play and Controls, and a one-line premise ("Keep the fire alive. Survive the night.").
- In play: health, hunger, and stamina bars; flashlight battery; fire fuel; a day/night indicator and clock; inventory counts; and context prompts ("E: Chop", "E: Add log", "F: Flashlight").
- **Night banner**, **Dawn banner** ("You survived Night 1"), a **Death screen** with the cause and nights survived plus a Retry button, and a **Win screen**.
- A clean, readable font, subtle drop shadows, no clutter, and the HUD fades slightly during the day and sharpens at night.

---

## 11. The moment-to-moment tension loop
1. **Morning relief:** the fog lifts, the monsters are gone, and the fire is low. "I need wood."
2. **Venture out:** walk out from the ring, chop, and gather food. The further you go, the better the trees, but the longer the walk back.
3. **The dusk clock:** the sky turns orange and you have about 20–30 s. Greed vs. safety: one more tree?
4. **The run home:** sprint back with a full sack as the light fades, and hear the first howl.
5. **Holding the ring:** feed the fire and watch the fuel bar. Eyes appear between the trunks. The Deer stands at the edge, and the flashlight catches it. You need to step out for one more log...
6. **The chase (when it goes wrong):** you get caught out or the fire runs low. Heartbeat, bellow, flashlight stun, sprint for the light.
7. **Dawn:** the sting of relief, the day counter ticks, and the loop repeats with slightly higher stakes.

The whole game is **"safety is a shrinking circle of light that you must pay for with trips into the dark."**

---

## 12. What makes it approachable
- There are only a few verbs: **walk, sprint, chop, pick up, drop into fire, eat, flashlight.** No crafting menus are needed to survive night 1.
- A clear goal (keep the fire lit, survive), readable UI, and **a visible safe zone**, so you always know where "home" is.
- Forgiving early game: the first night is gentle, and the monsters telegraph clearly.
- Each system gives instant feedback (the fire flares when fed, the bars move, the tree shakes).
- Its bright, toy-like low-poly look by day makes it non-threatening to start.

## 13. What makes nights scary
- **Darkness is real.** Visibility collapses to your own flashlight cone and the fire ring. You can't see threats until they're close, but you **hear** them first.
- **Eyes in the dark:** glowing pairs at the edge of light, watching and not attacking yet.
- **The Deer's uncanny stillness:** it stands upright and watches, then drops to all fours and charges. The flashlight stun is a desperate, limited counterplay with diminishing returns.
- **Resource anxiety:** the flashlight battery flickers, the fire fuel bar sinks, and the ring shrinks. You *have* to leave the light.
- **Audio dread:** the birdsong stops, and silence is broken by howls, snapping twigs, and a rising heartbeat.
- **Contrast:** the warm orange campfire vs. the cold blue-black forest. Stepping out of the ring should *feel* like stepping into danger.

---

## 14. Critic checklist (quick pass/fail)
- [ ] The day to dusk to night shift is obvious and gradual. Night is dark enough that the flashlight and fire matter, and it is not pure black.
- [ ] The fire flickers, lights the ground, has a visible fuel read, grows or flares when fed, and its safe radius and light shrink as fuel drops.
- [ ] Monsters stop at the ring edge, and fire-out leads to the Deer.
- [ ] The flashlight has a yellow cone, click sound, battery, low-battery flicker, recharge at the fire, and stuns the Deer with feedback and diminishing returns.
- [ ] The Deer is a tall antlered silhouette with visible eyes in the dark. It stalks, then chases, and is telegraphed, fair, and scary.
- [ ] Wolves have glowing eyes, howls, and circle and dart, and they fear light.
- [ ] Chopping: several hits with a sound, particles, a shake, a fall, and logs. Logs are carried and fed to the fire.
- [ ] Movement is responsive with sprint plus stamina, and the camera is smooth with no clipping.
- [ ] Hunger drains, food is findable, and eating is satisfying.
- [ ] Ambience changes day and night, with crackle, footsteps, chop, monster sounds, and a heartbeat.
- [ ] Title, night banner, dawn banner, death ("survived N nights"), win: all present and polished.
- [ ] There are no console errors and `window.__game` is complete.

---

### Sources
- 99 Nights in the Forest Wiki (Miraheze): Campfire, The Deer, Flashlights, Wolf, Bear, Hunger, Sacks. https://99nightsintheforestroblox.miraheze.org/
- Fandom wiki (search excerpts): https://99-nights-in-the-forest.fandom.com/
- Day/night length: https://playgama.com/blog/game-faqs/how-long-is-one-night-in-99-nights-in-the-forest/ and https://www.99nights-intheforest.net/content/How-long-is-a-day-in-99-Nights-in-the-Forest
- Flashlight guides: https://www.99nightsintheforest.net/20251124update/article/material/Flashlight.html
