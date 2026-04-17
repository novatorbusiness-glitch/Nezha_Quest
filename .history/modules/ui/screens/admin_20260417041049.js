export function renderAdminScreen({
  pendingQuests,
  rejectedQuests,
  pendingRewards,
  pendingHonestyRequests = []
}) {
  if (!pendingQuests.length && !rejectedQuests.length && !pendingRewards.length && !pendingHonestyRequests.length) {
    return `
      <div class="admin-empty">
        <h4>Все спокойно</h4>
        <p>Новых заявок пока нет. Когда герой отправит задания, призы или признание по честности, они появятся здесь.</p>
      </div>
    `;
  }

  const levelLabelMap = {
    light: "Легкий",
    medium: "Средний",
    hard: "Жесткий"
  };

  const honestyMarkup = pendingHonestyRequests
    .map((request) => {
      const levelLabel = levelLabelMap[request.level] || "Легкий";
      const headline = request.level === "hard"
        ? `Артем признал: ${levelLabel} протокол (Вранье)`
        : `Артем признал: ${levelLabel} протокол`;
      return `
        <div class="quest-card pending admin-request-card admin-request-honesty">
          <div class="quest-info">
            <h4 class="admin-request-headline"><span class="admin-request-glyph" aria-hidden="true"></span>${headline}</h4>
            <span class="quest-reward">Последствие: ${request.consequence}</span>
            <span class="quest-reward">Ожидает решения мастера</span>
          </div>

          <div class="admin-actions">
            <button class="btn-action btn-confirm btn-master-approve" onclick="approveHonestyRequest('${request.id}')">ОДОБРИТЬ</button>
            <button class="btn-action btn-reject btn-master-reject" onclick="rejectHonestyRequest('${request.id}')">ОТКЛОНИТЬ</button>
          </div>
        </div>
      `;
    })
    .join("");

  const pendingMarkup = pendingQuests
    .map((quest) => {
      return `
        <div class="quest-card pending admin-request-card admin-request-quest">
          <div class="quest-info">
            <h4 class="admin-request-headline"><span class="admin-request-glyph" aria-hidden="true"></span>${quest.title}</h4>
            <span class="quest-reward">Ожидает проверки</span>
          </div>

          <div class="admin-actions">
            <button class="btn-action btn-confirm btn-master-approve" onclick="approveQuest(${quest.id})">ОДОБРИТЬ</button>
            <button class="btn-action btn-reject btn-master-reject" onclick="rejectQuest(${quest.id})">ОТКЛОНИТЬ</button>
          </div>
        </div>
      `;
    })
    .join("");

  const rejectedMarkup = rejectedQuests
    .map(
      (quest) => `
        <div class="quest-card rejected admin-request-card admin-request-quest is-rejected">
          <div class="quest-info">
            <h4 class="admin-request-headline"><span class="admin-request-glyph" aria-hidden="true"></span>${quest.title}</h4>
            <span class="quest-reward">Отклонено, ожидаем повторную отправку</span>
          </div>
        </div>
      `
    )
    .join("");

  const rewardsMarkup = pendingRewards
    .map(
      (reward) => `
        <div class="quest-card approved admin-request-card admin-request-reward">
          <div class="quest-info">
            <h4 class="admin-request-headline"><span class="admin-request-glyph" aria-hidden="true"></span>${reward.title}</h4>
            <span class="quest-reward">Награда к выдаче (${reward.source === "wheel" ? "колесо" : "магазин"})</span>
          </div>
          <div class="admin-actions">
            <button class="btn-action btn-confirm btn-master-approve" onclick="markRewardIssued('${reward.id}')">ОДОБРИТЬ ВЫДАЧУ</button>
          </div>
        </div>
      `
    )
    .join("");

  const blocks = [
    {
      title: "Алтарь суда: Признания",
      count: pendingHonestyRequests.length,
      className: "honesty",
      markup: honestyMarkup
    },
    {
      title: "Алтарь суда: Квесты",
      count: pendingQuests.length,
      className: "pending",
      markup: pendingMarkup
    },
    {
      title: "Отклоненные",
      count: rejectedQuests.length,
      className: "rejected",
      markup: rejectedMarkup
    },
    {
      title: "Награды к выдаче",
      count: pendingRewards.length,
      className: "rewards",
      markup: rewardsMarkup
    }
  ].filter((block) => block.count > 0);

  return blocks
    .map(
      (block) => `
        <section class="admin-feed-block ${block.className}">
          <div class="admin-feed-head">
            <p class="admin-block-title">${block.title}</p>
            <span class="admin-feed-count orbitron">${block.count}</span>
          </div>
          <div class="admin-feed-list">
            ${block.markup}
          </div>
        </section>
      `
    )
    .join("");
}
