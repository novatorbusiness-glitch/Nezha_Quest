export function renderQuestScreen({
  questGroups,
  isDojoClosed,
  isPenaltyClosed,
  getStatus
}) {
  const sectionMap = [
    { key: "dailies", title: "ДЕЛА НА КАЖДЫЙ ДЕНЬ", icon: "✦" },
    { key: "physical", title: "ДЕЛА ПО ДОМУ И ТРЕНИРОВКЕ", icon: "✦" },
    { key: "epic", title: "БОЛЬШИЕ ЦЕЛИ", icon: "✦" }
  ];

  const fallbackValueByGroup = {
    dailies: "Ответственность",
    physical: "Трудолюбие",
    epic: "Сила духа"
  };

  const getQuestValue = (quest) => {
    const value = typeof quest.value === "string" ? quest.value.trim() : "";
    if (value.length > 0) return value;
    return fallbackValueByGroup[quest.groupKey] || "";
  };

  const getSectionValues = (quests) => {
    const seen = new Set();
    quests.forEach((quest) => {
      const value = getQuestValue(quest);
      if (value) seen.add(value);
    });
    return Array.from(seen);
  };

  const renderCard = (quest) => {
      const status = getStatus(quest.id);
      const isPending = status === "pending";
      const isApproved = status === "approved";
      const isRejected = status === "rejected";
      const isDisabled = isPending || isApproved || isDojoClosed || isPenaltyClosed;

      const xpReward = Number(quest.xpReward || 0);
      const crystalReward = Number(quest.crystalReward || 0);
      const crystalOnly = crystalReward > 0 && xpReward === 0;
      const hasEpicReward = typeof quest.rewardLabel === "string" && quest.rewardLabel.length > 0;
      const hasTime = typeof quest.timeLabel === "string" && quest.timeLabel.length > 0;
      const hasDetail = typeof quest.detail === "string" && quest.detail.length > 0;
      const questValue = getQuestValue(quest);
      const hasValue = questValue.length > 0;

      let rewardText = `+${xpReward} XP`;
      let actionText = "Отправить на проверку";

      if (hasEpicReward) {
        rewardText = `Награда: ${quest.rewardLabel}`;
      } else if (crystalOnly) {
        rewardText = `+${crystalReward} 💎`;
      } else if (xpReward > 0 && crystalReward > 0) {
        rewardText = `+${xpReward} XP • +${crystalReward} 💎`;
      }

      if (isPending) {
        rewardText = "На проверке у мастера";
        actionText = "Ждет подтверждения";
      } else if (isApproved) {
        rewardText = "Подтверждено";
        actionText = "Подтверждено";
      } else if (isRejected) {
        rewardText = "Отклонено, нужно переделать";
        actionText = "Отправить снова на проверку";
      } else if (isPenaltyClosed) {
        actionText = "Сначала последствие";
      } else if (isDojoClosed) {
        actionText = "Додзё закрыто";
      }

      return `
        <div class="quest-card ${status}">
          <div class="quest-info">
            <h4>${quest.title}</h4>
            ${
              hasTime || hasDetail
                ? `
                  <div class="quest-meta-row">
                    ${hasTime ? `<span class="quest-meta-chip">⏱ ${quest.timeLabel}</span>` : ""}
                    ${hasDetail ? `<span class="quest-meta-chip">ℹ ${quest.detail}</span>` : ""}
                    ${hasValue ? `<span class="quest-meta-chip value">${questValue.toUpperCase()}</span>` : ""}
                  </div>
                `
                : ""
            }
            <span class="quest-reward ${crystalOnly ? "crystal" : ""}">${rewardText}</span>
          </div>

          <button class="btn-action btn-confirm" ${isDisabled ? "disabled" : ""} onclick="submitQuest(${quest.id})">
            ${actionText}
          </button>
        </div>
      `;
  };

  return sectionMap
    .map((section) => {
      const quests = Array.isArray(questGroups?.[section.key]) ? questGroups[section.key] : [];
      if (!quests.length) {
        return "";
      }

      const sectionValues = getSectionValues(quests);

      return `
        <div class="quest-section">
          <div class="quest-section-head">
            <h4 class="quest-section-title orbitron">${section.icon} ${section.title}</h4>
            <span class="quest-section-value">${quests.length} ЗАДАНИЙ</span>
          </div>
          <div class="quest-values-cloud">
            ${sectionValues.map((value) => `<span class="quest-value-badge">${value.toUpperCase()}</span>`).join("")}
          </div>
          <div class="quest-section-list">
            ${quests.map((quest) => renderCard(quest)).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}
