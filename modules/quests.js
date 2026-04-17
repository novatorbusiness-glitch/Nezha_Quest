function ensureQuestStatus(state) {
  if (!state.questStatus || typeof state.questStatus !== "object") {
    state.questStatus = {};
  }
}

export function getQuestStatus(state, questId) {
  ensureQuestStatus(state);
  const key = String(questId);
  if (state.questStatus[key]) {
    return state.questStatus[key];
  }
  if (Array.isArray(state.pending) && state.pending.includes(questId)) {
    return "pending";
  }
  return "todo";
}

export function setQuestStatus(state, questId, status) {
  ensureQuestStatus(state);
  state.questStatus[String(questId)] = status;
  return state;
}

export function submitQuest(state, questId) {
  setQuestStatus(state, questId, "pending");
  return state;
}

export function approveQuest(state, questId, rewards = { xp: 0, crystals: 0 }) {
  state.xp += Number(rewards.xp || 0);
  state.crystals += Number(rewards.crystals || 0);
  setQuestStatus(state, questId, "approved");
  return state;
}

export function rejectQuest(state, questId) {
  setQuestStatus(state, questId, "rejected");
  return state;
}
