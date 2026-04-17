export function incrementStreak(state) {
  state.hero.streakDays += 1;
  if (state.hero.streakDays > state.hero.longestStreak) {
    state.hero.longestStreak = state.hero.streakDays;
  }
  return state;
}

export function resetStreak(state) {
  state.hero.streakDays = 0;
  return state;
}
