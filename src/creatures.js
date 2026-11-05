// Creatures: wolf packs at the caves, gray bears and the gray Alpha, and passive
// wildlife. See docs/EXPANSION.md for the contract.
export function createCreatures(G) {
  const cr = { list: [] };
  cr.getInteraction = () => null;
  cr.threatAt = () => 0;
  cr.update = () => {};
  return cr;
}
