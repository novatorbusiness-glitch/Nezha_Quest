export function renderHud(state) {
  const hpTxt = document.getElementById("hp-txt");
  const xpTxt = document.getElementById("xp-txt");
  const crystalTxt = document.getElementById("crystal-txt");

  if (hpTxt) hpTxt.textContent = `${state.hero.hp}/${state.hero.maxHp}`;
  if (xpTxt) xpTxt.textContent = `${state.hero.xp}/${state.hero.level * 1000}`;
  if (crystalTxt) crystalTxt.textContent = String(state.hero.crystals);
}
