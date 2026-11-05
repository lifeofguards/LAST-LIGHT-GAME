// Progression: campfire levels 1-4 that push back the edge of the playable land,
// the four caves (3 wolf caves + 1 gray-bear cave), their locks and keys, and the
// Mountain region unlocked by the final key. See docs/EXPANSION.md for the contract.
export function createProgression(G) {
  const prog = { fireLevel: 1, limitR: 60, caves: [], keys: [] };
  prog.getInteraction = () => null;
  prog.update = () => {};
  return prog;
}
