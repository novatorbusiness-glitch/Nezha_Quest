export function addXp(state, amount) {
  state.xp += Math.max(0, Number(amount) || 0);
  return state;
}

export function addCrystals(state, amount) {
  state.crystals += Math.max(0, Number(amount) || 0);
  return state;
}

export function spendCrystals(state, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (state.crystals < value) return false;
  state.crystals -= value;
  return true;
}

export function applyLevelUps(state, xpPerLevel = 1000) {
  let levelUps = 0;
  while (state.xp >= xpPerLevel) {
    state.level += 1;
    state.xp -= xpPerLevel;
    levelUps += 1;
  }
  return levelUps;
}
