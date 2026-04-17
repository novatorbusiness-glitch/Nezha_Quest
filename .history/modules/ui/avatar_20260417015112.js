const AVATAR_CANDIDATES = [
  "./images/аватар.png",
  "./images/avatar.png",
  "./images/%D0%B0%D0%B2%D0%B0%D1%82%D0%B0%D1%80.png"
];

const STAGE_BADGES = {
  chaos: "🔥",
  awakening: "🛡️",
  control: "👤",
  mastery: "👑"
};

const STAGE_FALLBACK_SYMBOLS = {
  chaos: "火",
  awakening: "焱",
  control: "人",
  mastery: "龍"
};

function normalizeStage(stage = "chaos") {
  const known = ["chaos", "awakening", "control", "mastery"];
  return known.includes(stage) ? stage : "chaos";
}

export function renderAvatar(containerId = "hero-avatar", options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const src = options.src || AVATAR_CANDIDATES[0];
  const mood = options.mood || "charged";
  const formStage = normalizeStage(options.formStage || "chaos");
  const candidates = options.src ? [src] : AVATAR_CANDIDATES;
  let currentIndex = 0;

  container.innerHTML = `
    <img class="hero-avatar-image mood-${mood} form-${formStage}" src="${src}" alt="Аватар Нэчжа" loading="eager" decoding="async">
    <span class="hero-avatar-stage-badge stage-${formStage}" aria-hidden="true">${STAGE_BADGES[formStage]}</span>
  `;

  const image = container.querySelector("img");
  if (!image) return;

  image.addEventListener("error", () => {
    currentIndex += 1;
    if (currentIndex < candidates.length) {
      image.src = candidates[currentIndex];
      return;
    }

    container.innerHTML = `
      <div class="hero-avatar-fallback form-${formStage}" aria-label="Аватар недоступен" role="img">${STAGE_FALLBACK_SYMBOLS[formStage]}</div>
      <span class="hero-avatar-stage-badge stage-${formStage}" aria-hidden="true">${STAGE_BADGES[formStage]}</span>
    `;
  });
}
