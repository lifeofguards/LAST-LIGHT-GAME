// Debug API (window.__game) used by critics/harness, and ?play=1 to skip the title screen.
export function installDebug(G) {
  const r2 = (v) => Math.round(v * 100) / 100;
  const api = {
    G,
    state() {
      const dn = G.daynight, c = G.controls, s = G.survival;
      return {
        mode: G.mode, phase: dn.phase, night: dn.night, day: dn.day, timeOfDay: r2(dn.t), clock: dn.clock(), timeLeftInPhase: r2(dn.timeLeft()),
        player: { pos: { x: r2(c.pos.x), y: r2(c.pos.y), z: r2(c.pos.z) }, yaw: r2(c.yaw), pitch: r2(c.pitch), health: r2(s.stats.health), hunger: r2(s.stats.hunger), stamina: r2(s.stats.stamina), sprinting: c.sprinting, inFireLight: G.campfire.inLight(c.pos) },
        inventory: { ...s.inventory }, equipped: s.equipped,
        fireFuel: r2(G.campfire.fuel), fire: { fuel: r2(G.campfire.fuel), lightRadius: r2(G.campfire.lightRadius()) },
        flashlight: { on: G.flashlight.on, battery: r2(G.flashlight.battery) },
        monsters: [G.deer.snapshot(), G.bear.snapshot()],
        interaction: G.interaction ? G.interaction.label : null,
        treesStanding: G.world.trees.filter(t => t.alive).length, logsOnGround: G.world.logs.length,
        threat: r2(G.threat || 0), god: s.god, gameOver: G.mode === 'dead', won: G.mode === 'won', fps: Math.round(G.fps || 0),
      };
    },
    setTime(t) { if (G.mode === 'title') G.startGame(); G.daynight.setTime(t); return api.state().phase; },
    skipToNight() { if (G.mode === 'title') G.startGame(); G.daynight.skipToNight(); return true; },
    teleport(x, z) { G.controls.teleport(x, z); return api.state().player.pos; },
    give(item, count = 1) { G.survival.give(item, count); return { ...G.survival.inventory }; },
    god(on = true) { G.survival.god = !!on; return G.survival.god; },
    lookAt(x, z) { G.controls.lookAt(x, z); return true; },
    equip(name) { G.survival.equip(name); return G.survival.equipped; },
    flashlight(on = true) { G.flashlight.setOn(!!on); return G.flashlight.on; },
    setFuel(v) { G.campfire.fuel = Math.max(0, Math.min(100, v)); return G.campfire.fuel; },
    // jump to the start of night n (1..5); the normal phase transition fires nightStart
    setNight(n = 1) { if (G.mode === 'title') G.startGame(); const dn = G.daynight; dn.night = n - 1; dn.day = n; dn.phase = 'day'; dn.skipToNight(); return n; },
    start() { G.startGame(); return G.mode; },
    spawnDeer(dist = 20) { G.deer.spawn(dist); return G.deer.snapshot(); },
    kill() { G.survival.damage(9999, 'debug'); return G.mode; },
  };
  window.__game = api;
  const params = new URLSearchParams(location.search);
  if (params.get('play') === '1') G.startGame();
  return api;
}
