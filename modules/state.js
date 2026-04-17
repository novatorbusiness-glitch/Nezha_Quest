// Legacy compatibility helper. The runtime app state lives in script.js.
const STORAGE_KEY = "neon_strike_state";

const defaultState = {
  hero: {
    name: "ARTEM",
    level: 1,
    xp: 0,
    hp: 100,
    maxHp: 100,
    crystals: 0,
    streakDays: 0,
    longestStreak: 0
  },
  pending: [],
  rejected: [],
  penalty: {
    active: false,
    category: null,
    spun: false,
    result: null
  },
  settings: {
    masterPin: "4851",
    bedtimeHour: 21,
    bedtimeMin: 0,
    globalDojoMode: "open"
  }
};

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    return { ...structuredClone(defaultState), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
  return structuredClone(defaultState);
}
