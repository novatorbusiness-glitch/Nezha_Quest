export function renderDashboard(state) {
  const heroName = document.getElementById("hero-name");
  const levelTxt = document.getElementById("level-txt");
  if (heroName) heroName.textContent = state.hero.name;
  if (levelTxt) levelTxt.textContent = `УРОВЕНЬ ${state.hero.level}`;
}
