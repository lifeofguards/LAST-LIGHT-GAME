// LAST LIGHT — bootstrap, main loop and wiring. Each subsystem lives in its own module.
import * as THREE from '../vendor/three.module.js';
import { createInput } from './input.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createControls } from './controls.js';
import { createDayNight } from './daynight.js';
import { createCampfire } from './campfire.js';
import { createFlashlight } from './flashlight.js';
import { createDeer } from './monsters/deer.js';
import { createBear } from './monsters/bear.js';
import { createSurvival } from './survival.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { installDebug } from './debug.js';

// tiny event bus shared by all modules
const listeners = {};
const events = {
  on(n, fn) { (listeners[n] ||= []).push(fn); },
  emit(n, d) { for (const fn of listeners[n] || []) { try { fn(d); } catch (e) { console.error(e); } } },
};

const G = { THREE, events, mode: 'title', time: 0, threat: 0, interaction: null };
window.__G = G;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 600);
Object.assign(G, { renderer, scene, camera });

G.input = createInput(G);
G.world = createWorld(G);
G.player = createPlayer(G);
G.controls = createControls(G);
G.survival = createSurvival(G);
G.daynight = createDayNight(G);
G.campfire = createCampfire(G);
G.flashlight = createFlashlight(G);
G.deer = createDeer(G);
G.bear = createBear(G);
G.audio = createAudio(G);
G.ui = createUI(G);

G.startGame = () => {
  if (G.mode !== 'title') return;
  G.mode = 'playing';
  G.ui.startPlaying();
  G.input.requestLock();
  G.controls.teleport(0, 7); G.controls.lookAt(0, 30);
  G.ui.showCard('DAY 1', 'Gather logs. Keep the fire alive.', 'day');
  G.events.emit('gameStart');
};
events.on('nightStart', (n) => G.ui.showCard(`NIGHT ${n}`, n === 5 ? 'The last night. Hold on.' : 'Stay in the light.', 'night'));
events.on('dayStart', (n) => G.ui.showCard(`DAY ${n}`, `You survived night ${n - 1}.`, 'day'));
events.on('death', ({ cause }) => {
  if (G.mode !== 'playing') return;
  G.mode = 'dead'; G.input.exitLock();
  const dn = G.daynight, survived = dn.phase === 'night' ? dn.night - 1 : dn.day - 1;
  setTimeout(() => G.ui.showDeath(survived, cause), 900);
});
events.on('win', () => { if (G.mode !== 'playing') return; G.mode = 'won'; G.input.exitLock(); G.ui.showWin(); });

function updateInteraction() {
  G.interaction = null;
  if (G.mode !== 'playing') return;
  const p = G.controls.pos;
  const cands = [G.campfire.getInteraction(p), G.world.getInteraction(p)].filter(Boolean);
  cands.sort((a, b) => a.dist - b.dist);
  G.interaction = cands[0] || null;
  if (G.interaction && !G.interaction.disabled && G.input.pressed('KeyE')) G.interaction.action();
}

function updateThreat() {
  const p = G.controls.pos; let th = 0;
  const d = G.deer, b = G.bear;
  if (['stalk', 'approach', 'windup', 'lunge', 'frozen', 'stunned'].includes(d.state)) { const dist = Math.hypot(d.pos.x - p.x, d.pos.z - p.z); th = Math.max(th, (1 - dist / 26) * (d.state === 'stalk' ? 0.7 : 1)); }
  if (['stalk', 'notice', 'rear', 'charge'].includes(b.state)) { const dist = Math.hypot(b.pos.x - p.x, b.pos.z - p.z); th = Math.max(th, (1 - dist / 24) * (b.state === 'charge' ? 1.2 : 0.7)); }
  G.threat = G.mode === 'playing' ? Math.max(0, Math.min(1, th)) : 0;
}

const clock = new THREE.Clock();
let fpsAcc = 0, fpsN = 0;
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(), dt = Math.min(0.1, raw);
  G.time += dt; fpsAcc += raw; fpsN++; if (fpsAcc > 1) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  G.controls.update(dt);
  G.survival.update(dt);
  updateInteraction();
  G.world.update(dt);
  G.daynight.update(dt);
  G.campfire.update(dt);
  G.flashlight.update(dt);
  G.deer.update(dt);
  G.bear.update(dt);
  updateThreat();
  G.audio.update(dt);
  G.ui.update(dt);
  renderer.render(scene, camera);
  G.input.endFrame();
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

installDebug(G);
frame();
