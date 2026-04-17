/* NEON_STRIKE: Core Logic Engine
   Разработчик: Система Мастеров (Илья & Аня)
   Для Героя: Артем
*/

import { PENALTIES } from './data/penalties.js';
import { QUESTS } from './data/quests.js';
import { SHOP_ITEMS } from './data/shop.js';
import { isMasterPinValid } from './modules/auth.js';
import { setActiveRoute } from './modules/router.js';
import {
    addXp,
    addCrystals,
    spendCrystals,
    applyLevelUps
} from './modules/economy.js';
import {
    getQuestStatus as getQuestStatusFromModule,
    setQuestStatus as setQuestStatusInModule,
    submitQuest as submitQuestState,
    approveQuest as approveQuestState,
    rejectQuest as rejectQuestState
} from './modules/quests.js';
import {
    isNightModeActive as isNightModeFromTimers,
    getCountdownToBedtime as getCountdownFromTimers
} from './modules/timers.js';
import { spinWheel } from './modules/wheel.js';
import { renderAvatar } from './modules/ui/avatar.js';
import { renderHud } from './modules/ui/hud.js';
import { showToast } from './modules/ui/toast.js';
import { renderDashboard } from './modules/ui/screens/dashboard.js';
import { renderQuestScreen } from './modules/ui/screens/quests.js';
import { renderAdminScreen } from './modules/ui/screens/admin.js';

// --- 1. КОНСТАНТЫ И НАСТРОЙКИ ---
const DEBUG_MODE = false;
const STORAGE_KEY = 'neon_strike_state';
const MAX_EVENT_LOG = 500;
const MASTER_PIN = '4851';
const CRYSTAL_DAILY_LIMIT = 140;
const BONUS_WHEEL_COST = 100;
const MAX_TX_LOCK_MS = 15 * 1000;
const BONUS_SPIN_COOLDOWN_MS = 20 * 60 * 1000;
const BONUS_SPINS_PER_DAY_LIMIT = 6;
const LEVEL_XP_STEP = 1000;
const LEVEL_CRYSTAL_REWARD = 25;
const LEVEL_HP_RECOVERY = 12;
const LEVEL_SHIELD_EVERY = 4;
const HONESTY_LEVELS = ['light', 'medium', 'hard'];
const HONESTY_LOCK_STORE_AND_QUESTS = true;
const GLOBAL_DOJO_MODES = ['open', 'closed'];
const TRANSFORMATION_MAX_LEVEL = 20;
const TRANSFORMATION_STAGES = ['chaos', 'awakening', 'control', 'mastery'];
const CORE_VALUES_ORDER = [
    'Честность',
    'Трудолюбие',
    'Сила духа',
    'Забота',
    'Любовь к себе',
    'Доброта',
    'Ответственность'
];

// Список бонусов для светлой рулетки
const BONUSES = [
    { label: "+250 ОПЫТА", kind: 'xp', value: 250 },
    { label: "+150 ОПЫТА", kind: 'xp', value: 150 },
    { label: "+80 ОПЫТА", kind: 'xp', value: 80 },
    { label: "+50 КРИСТАЛЛОВ", kind: 'crystals', value: 50 },
    { label: "+40 КРИСТАЛЛОВ", kind: 'crystals', value: 40 },
    { label: "+25 КРИСТАЛЛОВ", kind: 'crystals', value: 25 },
    { label: "1 ЩИТ", kind: 'shield', value: 1 },
    { label: "2 ЩИТА", kind: 'shield', value: 2 },
    { label: "+1 ЧАС PS", kind: 'ticket', value: '+1 ЧАС PLAYSTATION' },
    { label: "+2 ЧАСА PS", kind: 'ticket', value: '+2 ЧАСА PLAYSTATION' },
    { label: "СНЕК БЕЗ ШОКОЛАДА", kind: 'ticket', value: 'СНЕК (БЕЗ ШОКОЛАДА)' },
    { label: "ВЫБОР ФИЛЬМА", kind: 'ticket', value: 'ВЫБОР ФИЛЬМА НА ВЕЧЕР' },
    { label: "ПОЗДНИЙ СОН +1Ч", kind: 'ticket', value: 'ПОЗДНИЙ ОТБОЙ +1 ЧАС' },
    { label: "ЛЮБИМЫЙ УЖИН", kind: 'ticket', value: 'ЛЮБИМАЯ ЕДА НА УЖИН' },
    { label: "ОТМЕНА 1 ДЕЛА", kind: 'ticket', value: 'ПРОПУСК ОДНОГО ДЕЛА' },
    { label: "ПЛАН НА ВЫХОДНОЙ", kind: 'ticket', value: 'ПРАВО ВЫБРАТЬ АКТИВНОСТЬ' }
];

const QUEST_GROUPS = (() => {
    let idCounter = 1;
    const mapQuest = (quest, groupKey) => ({
        id: idCounter++,
        sourceId: quest.id,
        groupKey,
        title: quest.title,
        timeLabel: typeof quest.time === 'string' ? quest.time : '',
        detail: typeof quest.note === 'string' ? quest.note : '',
        value: typeof quest.value === 'string' ? quest.value : '',
        xpReward: Number(quest.xp || 0),
        crystalReward: Number(quest.crystals || 0),
        rewardLabel: typeof quest.reward === 'string' ? quest.reward : ''
    });

    return {
        dailies: (QUESTS.dailies || []).map((quest) => mapQuest(quest, 'dailies')),
        physical: (QUESTS.physical || []).map((quest) => mapQuest(quest, 'physical')),
        epic: (QUESTS.epic || []).map((quest) => mapQuest(quest, 'epic'))
    };
})();

const QUEST_DATA = [
    ...QUEST_GROUPS.dailies,
    ...QUEST_GROUPS.physical,
    ...QUEST_GROUPS.epic
];

const SHOP_DATA = (SHOP_ITEMS || []).map((item) => ({
    id: item.id,
    category: item.category || 'small',
    title: item.title,
    note: item.note || 'награда от мастеров',
    price: Number(item.price || 0)
}));

const SHOP_SECTIONS = [
    { key: 'small', title: '✦ БЫСТРЫЕ ПРИЗЫ' },
    { key: 'medium', title: '◇ КРУТЫЕ ПРИЗЫ' },
    { key: 'epic', title: '❀ СУПЕР-ПРИЗЫ' }
];

// --- 2. ИНИЦИАЛИЗАЦИЯ СОСТОЯНИЯ ---
const DEFAULT_STATE = {
    hp: 100,
    xp: 0,
    crystals: 100,
    level: 1,
    pending: [], // ID квестов, ожидающих проверки
    questStatus: {}, // статус квестов: todo | pending | approved | rejected
    rewardQueue: [], // покупки и призы, ожидающие выдачи мастером
    consequenceQueue: [], // последствия к подтверждению в админке
    shields: 0,
    crystalFlow: {
        dayStamp: '',
        earnedToday: 0
    },
    bonusWheel: {
        dayStamp: '',
        spinsToday: 0,
        lastSpinAt: 0
    },
    txLockUntil: 0,
    penaltyMode: 'wheel', // wheel | fixed
    penaltyCategory: 'light', // light | medium | hard
    fixedPenalty: '',
    activePenaltyResult: '',
    events: [],
    isSpinning: false,
    honesty: {
        selectedLevel: 'light',
        selectedConsequenceByLevel: {
            light: '',
            medium: '',
            hard: ''
        },
        requests: []
    },
    transformation: {
        habitsDefeated: 0,
        setbacks: 0
    },
    settings: {
        masterPin: MASTER_PIN,
        bedtimeHour: 21,
        bedtimeMinute: 0
    }
};

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (!saved) return structuredClone(DEFAULT_STATE);

        const now = Date.now();
        const rawTxLockUntil = Number.isFinite(saved.txLockUntil) ? saved.txLockUntil : 0;
        const rawBonusSpinsToday = Number.isFinite(saved?.bonusWheel?.spinsToday) ? saved.bonusWheel.spinsToday : 0;
        const rawLastSpinAt = Number.isFinite(saved?.bonusWheel?.lastSpinAt) ? saved.bonusWheel.lastSpinAt : 0;
        const safeBonusSpinsToday = Math.max(0, Math.min(BONUS_SPINS_PER_DAY_LIMIT, Math.floor(rawBonusSpinsToday)));
        const safeLastSpinAt = rawLastSpinAt > (now + 60 * 1000) ? 0 : Math.max(0, rawLastSpinAt);

        return {
            ...structuredClone(DEFAULT_STATE),
            ...saved,
            pending: Array.isArray(saved.pending) ? saved.pending : [],
            rewardQueue: Array.isArray(saved.rewardQueue) ? saved.rewardQueue : [],
            consequenceQueue: Array.isArray(saved.consequenceQueue) ? saved.consequenceQueue : [],
            shields: Number.isFinite(saved.shields) ? saved.shields : 0,
            crystalFlow: {
                ...DEFAULT_STATE.crystalFlow,
                ...(saved.crystalFlow || {}),
                dayStamp: typeof saved?.crystalFlow?.dayStamp === 'string' ? saved.crystalFlow.dayStamp : '',
                earnedToday: Number.isFinite(saved?.crystalFlow?.earnedToday) ? saved.crystalFlow.earnedToday : 0
            },
            bonusWheel: {
                ...DEFAULT_STATE.bonusWheel,
                ...(saved.bonusWheel || {}),
                dayStamp: typeof saved?.bonusWheel?.dayStamp === 'string' ? saved.bonusWheel.dayStamp : '',
                spinsToday: safeBonusSpinsToday,
                lastSpinAt: safeLastSpinAt
            },
            txLockUntil: rawTxLockUntil > now ? Math.min(rawTxLockUntil, now + MAX_TX_LOCK_MS) : 0,
            penaltyMode: saved.penaltyMode || DEFAULT_STATE.penaltyMode,
            penaltyCategory: saved.penaltyCategory || DEFAULT_STATE.penaltyCategory,
            fixedPenalty: saved.fixedPenalty || DEFAULT_STATE.fixedPenalty,
            activePenaltyResult: saved.activePenaltyResult || DEFAULT_STATE.activePenaltyResult,
            events: Array.isArray(saved.events) ? saved.events : [],
            isSpinning: false,
            honesty: {
                ...structuredClone(DEFAULT_STATE.honesty),
                ...(saved.honesty || {}),
                selectedLevel: HONESTY_LEVELS.includes(saved?.honesty?.selectedLevel)
                    ? saved.honesty.selectedLevel
                    : 'light',
                selectedConsequenceByLevel: {
                    ...structuredClone(DEFAULT_STATE.honesty.selectedConsequenceByLevel),
                    ...(saved?.honesty?.selectedConsequenceByLevel || {})
                },
                requests: Array.isArray(saved?.honesty?.requests) ? saved.honesty.requests : []
            },
            transformation: {
                habitsDefeated: Number.isFinite(saved?.transformation?.habitsDefeated)
                    ? Math.max(0, Math.floor(saved.transformation.habitsDefeated))
                    : Math.max(0, Math.min(TRANSFORMATION_MAX_LEVEL, Math.floor(Number(saved?.level || 1) - 1))),
                setbacks: Number.isFinite(saved?.transformation?.setbacks)
                    ? Math.max(0, Math.floor(saved.transformation.setbacks))
                    : 0
            },
            questStatus: {
                ...DEFAULT_STATE.questStatus,
                ...(saved.questStatus || {})
            },
            settings: {
                ...DEFAULT_STATE.settings,
                ...(saved.settings || {}),
                masterPin: MASTER_PIN
            }
        };
    } catch (error) {
        return structuredClone(DEFAULT_STATE);
    }
}

let state = loadState();
let lastNightMode = null;
let celebrationCleanupTimer = 0;
let masterBypassLockdown = false;

function trackEvent(type, payload = {}) {
    if (!Array.isArray(state.events)) {
        state.events = [];
    }

    state.events.push({
        ts: Date.now(),
        type,
        ...payload
    });

    if (state.events.length > MAX_EVENT_LOG) {
        state.events = state.events.slice(state.events.length - MAX_EVENT_LOG);
    }
}

function toggleDojoOverride() {
    const states = ['auto', 'open', 'closed'];
    const current = state.settings?.forceDojoState || 'auto';
    const next = states[(states.indexOf(current) + 1) % states.length];

    if (!state.settings) {
        state.settings = {};
    }

    state.settings.forceDojoState = next === 'auto' ? null : next;
    saveState();
    alert(`Режим Додзё: ${next.toUpperCase()}\n(auto = по времени, open = всегда открыто, closed = закрыто)`);
    updateScheduleWidgets();
}

function getGlobalDojoMode() {
    const mode = state.settings?.globalDojoMode;
    return GLOBAL_DOJO_MODES.includes(mode) ? mode : 'open';
}

function isGlobalDojoClosed() {
    return getGlobalDojoMode() === 'closed';
}

function renderDojoModeLog() {
    const target = document.getElementById('dojo-mode-log');
    if (!target) return;

    const events = (state.events || [])
        .filter((entry) => entry.type === 'dojo_mode_switched')
        .slice(-8)
        .reverse();

    if (!events.length) {
        target.innerHTML = '<p class="dojo-mode-log-empty">Событий пока нет.</p>';
        return;
    }

    target.innerHTML = events.map((entry) => {
        const modeText = entry.mode === 'closed' ? 'ЗАКРЫТО' : 'ОТКРЫТО';
        const modeClass = entry.mode === 'closed' ? 'closed' : 'open';
        const stamp = new Date(Number(entry.ts || Date.now())).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `<div class="dojo-mode-log-row ${modeClass}"><span class="dojo-mode-log-badge">${modeText}</span><span class="dojo-mode-log-time">${stamp}</span></div>`;
    }).join('');
}

function renderGlobalDojoMode() {
    const mode = getGlobalDojoMode();
    const isClosed = mode === 'closed';
    const lockVisible = isClosed && !masterBypassLockdown;

    const overlay = document.getElementById('dojo-lockdown-overlay');
    const stateText = document.getElementById('dojo-lockdown-state');
    const caption = document.getElementById('dojo-mode-caption');
    const toggleBtn = document.getElementById('dojo-mode-toggle-btn');
    const allNavItems = document.querySelectorAll('.nav-item');

    if (overlay) {
        overlay.classList.toggle('active', lockVisible);
    }

    document.body.classList.toggle('dojo-lockdown', isClosed);

    allNavItems.forEach((node) => {
        node.classList.toggle('locked', isClosed);
    });

    if (stateText) {
        stateText.textContent = isClosed ? 'РЕЖИМ ТИШИНЫ' : 'РЕЖИМ РАБОТЫ';
    }

    if (caption) {
        caption.textContent = isClosed
            ? 'Закрытый режим: интерфейс героя заблокирован до открытия Мастером.'
            : 'Активный режим: доступны База, Квесты, Магазин и Протокол честности.';
    }

    if (toggleBtn) {
        toggleBtn.classList.toggle('open', !isClosed);
        toggleBtn.classList.toggle('closed', isClosed);
        toggleBtn.textContent = isClosed ? 'ЗАКРЫТО' : 'ОТКРЫТО';
    }

    renderDojoModeLog();
}

function setGlobalDojoMode(mode, source = 'master') {
    const nextMode = GLOBAL_DOJO_MODES.includes(mode) ? mode : 'open';
    const prevMode = getGlobalDojoMode();

    if (!state.settings) {
        state.settings = {};
    }

    state.settings.globalDojoMode = nextMode;

    if (prevMode !== nextMode) {
        trackEvent('dojo_mode_switched', { mode: nextMode, source });
    }

    if (nextMode === 'open') {
        masterBypassLockdown = false;
    }

    saveState();
}

function toggleGlobalDojoMode() {
    const next = isGlobalDojoClosed() ? 'open' : 'closed';
    setGlobalDojoMode(next, 'master');
}

function getStartOfDay(time = Date.now()) {
    const d = new Date(time);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function renderAdminAnalytics() {
    const pendingEl = document.getElementById('admin-stat-pending');
    const approvedEl = document.getElementById('admin-stat-approved');
    const rejectedEl = document.getElementById('admin-stat-rejected');
    const issuedEl = document.getElementById('admin-stat-issued');
    const hardEl = document.getElementById('admin-stat-hard');
    const xp7El = document.getElementById('admin-stat-xp7');
    const honestyTotalEl = document.getElementById('admin-stat-honesty-total');
    const honestyLightEl = document.getElementById('admin-stat-honesty-light');
    const honestyMediumEl = document.getElementById('admin-stat-honesty-medium');
    const honestyHardEl = document.getElementById('admin-stat-honesty-hard');

    if (!pendingEl || !approvedEl || !rejectedEl || !issuedEl || !hardEl || !xp7El) {
        return;
    }

    const statuses = Object.values(state.questStatus || {});
    const approvedCount = statuses.filter((s) => s === 'approved').length;
    const rejectedCount = statuses.filter((s) => s === 'rejected').length;
    const pendingCount = statuses.filter((s) => s === 'pending').length;
    const issuedRewards = (state.rewardQueue || []).filter((r) => r.status === 'issued').length;

    const hardPenalties = (state.events || []).filter(
        (e) => e.type === 'penalty_triggered' && e.category === 'hard'
    ).length;

    const now = Date.now();
    const from = now - 7 * 86400000;
    const xp7 = (state.events || [])
        .filter((e) => e.ts >= from && typeof e.xpDelta === 'number')
        .reduce((sum, e) => sum + Math.max(0, e.xpDelta), 0);

    ensureHonestyState();
    const requests = state.honesty.requests || [];
    const honestyTotal = requests.length;
    const honestyLight = requests.filter((request) => request.level === 'light').length;
    const honestyMedium = requests.filter((request) => request.level === 'medium').length;
    const honestyHard = requests.filter((request) => request.level === 'hard').length;

    pendingEl.textContent = String(pendingCount);
    approvedEl.textContent = String(approvedCount);
    rejectedEl.textContent = String(rejectedCount);
    issuedEl.textContent = String(issuedRewards);
    hardEl.textContent = String(hardPenalties);
    xp7El.textContent = String(xp7);
    if (honestyTotalEl) honestyTotalEl.textContent = String(honestyTotal);
    if (honestyLightEl) honestyLightEl.textContent = String(honestyLight);
    if (honestyMediumEl) honestyMediumEl.textContent = String(honestyMedium);
    if (honestyHardEl) honestyHardEl.textContent = String(honestyHard);

    // Добавляем статистику подтвержденных задач
    const completedTasks = state.events.filter(e => e.type === "quest_approved").reduce((acc, curr) => {
        acc[curr.title] = (acc[curr.title] || 0) + 1;
        return acc;
    }, {});
    const sortedTasks = Object.entries(completedTasks).sort((a,b)=>b[1]-a[1]).slice(0, 5);
    
    let statsDiv = document.getElementById("admin-top-tasks");
    const adminAnalytics = document.querySelector('.admin-analytics-section');
    if (adminAnalytics && !statsDiv) {
        statsDiv = document.createElement("div");
        statsDiv.id = "admin-top-tasks";
        statsDiv.style.marginTop = "20px";
        statsDiv.style.padding = "10px";
        statsDiv.style.background = "rgba(0,0,0,0.3)";
        adminAnalytics.appendChild(statsDiv);
    }
    if (statsDiv) {
        if (sortedTasks.length) {
            statsDiv.innerHTML = "<h4 class='orbitron' style='color:#7ce4ff;'>ЧАСТЫЕ ДЕЛА:</h4><ul style='font-size:12px; line-height:1.6; margin-top:8px; padding-left:20px;'>" + sortedTasks.map(t=>`<li>${t[0]} — <b>${t[1]} раз</b></li>`).join("") + "</ul>";
        } else {
            statsDiv.innerHTML = "<p>Пока нет подтвержденных дел.</p>";
        }
    }

    drawAdminChart();
}

function drawAdminChart() {
    const canvas = document.getElementById('admin-stats-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 640;
    const cssHeight = canvas.clientHeight || 220;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const days = 7;
    const labels = [];
    const xpSeries = [];
    const penaltiesSeries = [];
    const base = getStartOfDay(Date.now() - (days - 1) * 86400000);

    for (let i = 0; i < days; i++) {
        const dayStart = base + i * 86400000;
        const dayEnd = dayStart + 86400000;
        const day = new Date(dayStart);

        labels.push(`${day.getDate()}.${day.getMonth() + 1}`);

        const xp = (state.events || [])
            .filter((e) => e.ts >= dayStart && e.ts < dayEnd && typeof e.xpDelta === 'number')
            .reduce((sum, e) => sum + Math.max(0, e.xpDelta), 0);

        const penalties = (state.events || []).filter(
            (e) => e.ts >= dayStart && e.ts < dayEnd && e.type === 'penalty_triggered'
        ).length;

        xpSeries.push(xp);
        penaltiesSeries.push(penalties);
    }

    const maxXp = Math.max(10, ...xpSeries);
    const maxPen = Math.max(1, ...penaltiesSeries);
    const pad = { left: 34, right: 12, top: 14, bottom: 28 };
    const plotW = cssWidth - pad.left - pad.right;
    const plotH = cssHeight - pad.top - pad.bottom;

    // Grid
    ctx.strokeStyle = 'rgba(125, 167, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
    }

    // XP bars
    const stepX = plotW / days;
    const barW = Math.min(24, stepX * 0.46);
    xpSeries.forEach((value, i) => {
        const h = (value / maxXp) * plotH;
        const x = pad.left + i * stepX + (stepX - barW) / 2;
        const y = pad.top + plotH - h;
        const grad = ctx.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, 'rgba(0,255,204,0.95)');
        grad.addColorStop(1, 'rgba(0,183,255,0.65)');
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, h);
    });

    // Penalty line
    ctx.strokeStyle = 'rgba(255, 42, 85, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    penaltiesSeries.forEach((value, i) => {
        const x = pad.left + i * stepX + stepX / 2;
        const y = pad.top + plotH - (value / maxPen) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 42, 85, 0.95)';
    penaltiesSeries.forEach((value, i) => {
        const x = pad.left + i * stepX + stepX / 2;
        const y = pad.top + plotH - (value / maxPen) * plotH;
        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
        ctx.fill();
    });

    // Labels
    ctx.fillStyle = 'rgba(185, 206, 255, 0.8)';
    ctx.font = '10px "Russo One"';
    labels.forEach((label, i) => {
        const x = pad.left + i * stepX + stepX / 2;
        ctx.fillText(label, x - 12, cssHeight - 10);
    });

    // Legend
    ctx.fillStyle = 'rgba(0, 255, 204, 0.9)';
    ctx.fillRect(pad.left, 4, 10, 6);
    ctx.fillStyle = 'rgba(184, 210, 255, 0.85)';
    ctx.fillText('XP', pad.left + 14, 10);
    ctx.fillStyle = 'rgba(255, 42, 85, 0.95)';
    ctx.fillRect(pad.left + 48, 4, 10, 6);
    ctx.fillStyle = 'rgba(184, 210, 255, 0.85)';
    ctx.fillText('Штрафы', pad.left + 62, 10);
}

function setTabTheme(tabId) {
    document.body.dataset.activeTab = tabId;
}

function getQuestStatus(questId) {
    return getQuestStatusFromModule(state, questId);
}

function setQuestStatus(questId, status) {
    setQuestStatusInModule(state, questId, status);
}

function migrateLegacyPendingToStatuses() {
    let changed = false;

    if (!Array.isArray(state.pending)) {
        state.pending = [];
    }

    state.pending.forEach((id) => {
        if (!state.questStatus[id]) {
            setQuestStatus(id, 'pending');
            changed = true;
        }
    });

    return changed;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

function getDayStamp(time = Date.now()) {
    const d = new Date(time);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ensureCrystalFlowState() {
    if (!state.crystalFlow || typeof state.crystalFlow !== 'object') {
        state.crystalFlow = { dayStamp: '', earnedToday: 0 };
    }

    const today = getDayStamp();
    if (state.crystalFlow.dayStamp !== today) {
        state.crystalFlow.dayStamp = today;
        state.crystalFlow.earnedToday = 0;
    }
}

function ensureBonusWheelState() {
    if (!state.bonusWheel || typeof state.bonusWheel !== 'object') {
        state.bonusWheel = { dayStamp: '', spinsToday: 0, lastSpinAt: 0 };
    }

    state.bonusWheel.spinsToday = Math.max(
        0,
        Math.min(BONUS_SPINS_PER_DAY_LIMIT, Math.floor(Number(state.bonusWheel.spinsToday) || 0))
    );

    const now = Date.now();
    const rawLastSpinAt = Number(state.bonusWheel.lastSpinAt) || 0;
    if (rawLastSpinAt > now + 60 * 1000 || rawLastSpinAt < 0) {
        state.bonusWheel.lastSpinAt = 0;
    } else {
        state.bonusWheel.lastSpinAt = rawLastSpinAt;
    }

    const today = getDayStamp();
    if (state.bonusWheel.dayStamp !== today) {
        state.bonusWheel.dayStamp = today;
        state.bonusWheel.spinsToday = 0;
    }
}

function getHonestyLevelLabel(level) {
    if (level === 'medium') return 'Средний';
    if (level === 'hard') return 'Жесткий';
    return 'Легкий';
}

function getHonestyConsequencesByLevel(level) {
    if (level === 'medium') return PENALTIES.medium || [];
    if (level === 'hard') return PENALTIES.hard || [];
    return PENALTIES.light || [];
}

function getHonestyConsequenceImpact(text, level) {
    const source = String(text || '').toLowerCase();

    let hp = 'до 0 (блокировка)';
    let xp = 'без потерь';
    let crystals = 'без потерь';

    const crystalPctMatch = source.match(/минус\s*(\d+)\s*%\s*кристалл/);
    if (crystalPctMatch) {
        crystals = `-${crystalPctMatch[1]}%`;
    } else if (/обнул.*кристалл|полное\s+обнуление\s+кристалл/.test(source)) {
        crystals = 'до 0';
    } else if (/кристалл/.test(source)) {
        crystals = 'штраф по условию';
    }

    const xpPctMatch = source.match(/минус\s*(\d+)\s*%\s*xp/);
    if (xpPctMatch) {
        xp = `-${xpPctMatch[1]}%`;
    } else if (/обнул.*xp|обнул.*опыт|xp\s*до\s*нуля/.test(source)) {
        xp = 'до 0';
    } else if (/минус\s*xp|xp/.test(source) && !/без/.test(source)) {
        xp = 'штраф по условию';
    }

    if (level === 'light' && crystals === 'без потерь' && xp === 'без потерь') {
        hp = 'до 0 (мягкий протокол)';
    }

    if (level === 'medium' && crystals === 'без потерь' && xp === 'без потерь') {
        hp = 'до 0 (средний протокол)';
    }

    return { hp, xp, crystals };
}

function ensureHonestyState() {
    if (!state.honesty || typeof state.honesty !== 'object') {
        state.honesty = structuredClone(DEFAULT_STATE.honesty);
    }

    if (!HONESTY_LEVELS.includes(state.honesty.selectedLevel)) {
        state.honesty.selectedLevel = 'light';
    }

    if (!state.honesty.selectedConsequenceByLevel || typeof state.honesty.selectedConsequenceByLevel !== 'object') {
        state.honesty.selectedConsequenceByLevel = structuredClone(DEFAULT_STATE.honesty.selectedConsequenceByLevel);
    }

    HONESTY_LEVELS.forEach((level) => {
        const list = getHonestyConsequencesByLevel(level);
        const current = String(state.honesty.selectedConsequenceByLevel[level] || '');
        state.honesty.selectedConsequenceByLevel[level] = list.includes(current) ? current : (list[0] || '');
    });

    if (!Array.isArray(state.honesty.requests)) {
        state.honesty.requests = [];
    }
}

function ensureTransformationState() {
    if (!state.transformation || typeof state.transformation !== 'object') {
        state.transformation = {
            habitsDefeated: Math.max(0, Math.min(TRANSFORMATION_MAX_LEVEL, Math.floor(Number(state.level || 1) - 1))),
            setbacks: 0
        };
    }

    state.transformation.habitsDefeated = Math.max(
        0,
        Math.floor(Number(state.transformation.habitsDefeated) || 0)
    );
    state.transformation.setbacks = Math.max(
        0,
        Math.floor(Number(state.transformation.setbacks) || 0)
    );
}

function getTransformationLevel() {
    ensureTransformationState();
    const raw = 1 + state.transformation.habitsDefeated - state.transformation.setbacks;
    return Math.max(1, Math.min(TRANSFORMATION_MAX_LEVEL, Math.floor(raw)));
}

function getTransformationStage(level = getTransformationLevel()) {
    if (level <= 5) return 'chaos';
    if (level <= 10) return 'awakening';
    if (level <= 15) return 'control';
    return 'mastery';
}

function getTransformationStageLabel(stage) {
    if (stage === 'awakening') return 'ПРОБУЖДЕНИЕ • 6-10';
    if (stage === 'control') return 'КОНТРОЛЬ • 11-15';
    if (stage === 'mastery') return 'МАСТЕРСТВО • 16-20';
    return 'БАЗА • 1-5';
}

function increaseTransformationProgress(source = 'quest', amount = 1) {
    ensureTransformationState();
    const step = Math.max(0, Math.floor(Number(amount) || 0));
    if (!step) return;

    const before = getTransformationLevel();
    state.transformation.habitsDefeated += step;
    const after = getTransformationLevel();

    if (after !== before) {
        trackEvent('transformation_step_up', { source, from: before, to: after });
    }
}

function regressTransformationProgress(source = 'honesty_break', amount = 1) {
    ensureTransformationState();
    const step = Math.max(0, Math.floor(Number(amount) || 0));
    if (!step) return;

    const before = getTransformationLevel();
    state.transformation.setbacks += step;
    const after = getTransformationLevel();

    if (after !== before) {
        trackEvent('transformation_step_down', { source, from: before, to: after });
    }
}

function renderTransformationPath() {
    ensureTransformationState();

    const panel = document.getElementById('evolution-panel');
    const fill = document.getElementById('evolution-bar-fill');
    const levelText = document.getElementById('evolution-level-text');
    const habitsText = document.getElementById('habits-defeated-text');
    const stageText = document.getElementById('evolution-stage-label');
    if (!fill || !levelText || !habitsText || !stageText) return;

    const level = getTransformationLevel();
    const stage = getTransformationStage(level);
    const progressPct = Math.max(0, Math.min(100, (level / TRANSFORMATION_MAX_LEVEL) * 100));
    const defeated = Math.max(0, Math.min(TRANSFORMATION_MAX_LEVEL, Number(state.transformation.habitsDefeated || 0)));

    fill.style.width = `${progressPct.toFixed(1)}%`;
    levelText.textContent = `Путь к Человеку: ${level}/${TRANSFORMATION_MAX_LEVEL}`;
    habitsText.textContent = `Привычек побеждено: ${defeated}/${TRANSFORMATION_MAX_LEVEL}`;
    stageText.textContent = getTransformationStageLabel(stage);

    if (panel) {
        TRANSFORMATION_STAGES.forEach((name) => panel.classList.remove(`stage-${name}`));
        panel.classList.add(`stage-${stage}`);
    }
}

function getPendingHonestyRequest() {
    ensureHonestyState();
    return state.honesty.requests.find((request) => request.status === 'pending') || null;
}

function isHonestyLockActive() {
    if (!HONESTY_LOCK_STORE_AND_QUESTS) return false;
    return Boolean(getPendingHonestyRequest());
}

function grantCrystalsWithLimit(amount, source = 'system') {
    const desired = Math.max(0, Number(amount) || 0);
    if (!desired) return 0;

    ensureCrystalFlowState();

    if (DEBUG_MODE) {
        addCrystals(state, desired);
        state.crystalFlow.earnedToday += desired;
        return desired;
    }

    const freeSpace = Math.max(0, CRYSTAL_DAILY_LIMIT - Number(state.crystalFlow.earnedToday || 0));
    const granted = Math.min(desired, freeSpace);

    if (granted > 0) {
        addCrystals(state, granted);
        state.crystalFlow.earnedToday = Number(state.crystalFlow.earnedToday || 0) + granted;
    }

    trackEvent('crystals_granted', {
        source,
        desired,
        granted,
        dailyLimit: CRYSTAL_DAILY_LIMIT,
        earnedToday: Number(state.crystalFlow.earnedToday || 0)
    });

    return granted;
}

function getBonusCooldownLeftMs() {
    ensureBonusWheelState();
    const now = Date.now();
    const safeLastSpinAt = Math.min(Number(state.bonusWheel.lastSpinAt || 0), now);
    const availableAt = safeLastSpinAt + BONUS_SPIN_COOLDOWN_MS;
    return Math.max(0, availableAt - now);
}

function canUseBonusWheel(showAlerts = false) {
    ensureBonusWheelState();

    if (state.bonusWheel.spinsToday >= BONUS_SPINS_PER_DAY_LIMIT) {
        if (showAlerts) {
            alert(`На сегодня лимит прокрутов: ${BONUS_SPINS_PER_DAY_LIMIT}. Завтра будет снова.`);
        }
        return false;
    }

    const leftMs = getBonusCooldownLeftMs();
    if (leftMs > 0) {
        if (showAlerts) {
            const totalSec = Math.ceil(leftMs / 1000);
            const min = Math.floor(totalSec / 60);
            const sec = totalSec % 60;
            alert(`Колесо отдыхает: ${min}:${pad(sec)}.`);
        }
        return false;
    }

    return true;
}

function getBonusWheelBlockReason() {
    if (state.isSpinning) {
        return { code: 'spinning', text: 'Колесо уже крутится. Подожди пару секунд.' };
    }

    if (isTxLocked()) {
        return { code: 'tx', text: 'Система обрабатывает предыдущее действие. Попробуй еще раз через секунду.' };
    }

    if (DEBUG_MODE) return null; // Отменяем проверки кристаллов и лимитов для тестов

    if (state.crystals < BONUS_WHEEL_COST) {
        return { code: 'crystals', text: `Нужно минимум ${BONUS_WHEEL_COST} 💎 для прокрутки.` };
    }

    ensureBonusWheelState();
    if (state.bonusWheel.spinsToday >= BONUS_SPINS_PER_DAY_LIMIT) {
        return { code: 'limit', text: `Сегодня лимит прокрутов: ${BONUS_SPINS_PER_DAY_LIMIT}.` };
    }

    const cooldownLeftMs = getBonusCooldownLeftMs();
    if (cooldownLeftMs > 0) {
        const sec = Math.ceil(cooldownLeftMs / 1000);
        return {
            code: 'cooldown',
            text: `Колесо отдыхает: ${Math.floor(sec / 60)}:${pad(sec % 60)}.`
        };
    }

    return null;
}

function getWheelItemLabel(item) {
    return typeof item === 'string' ? item : item.label;
}

function getWheelLegendLabel(item) {
    if (!item || typeof item === 'string') {
        return getWheelItemLabel(item);
    }

    if (item.kind === 'xp') return `⭐ ${item.label}`;
    if (item.kind === 'crystals') return `💎 ${item.label}`;
    if (item.kind === 'shield') return `🧣 ${item.label}`;
    if (item.kind === 'ticket') return `🎁 ${item.label}`;
    return getWheelItemLabel(item);
}

function splitWheelLabel(label, maxChars = 16, maxLines = 2) {
    const words = String(label || '')
        .replace(/[()]/g, '')
        .split(/\s+/)
        .filter(Boolean);

    const lines = [];
    let current = '';

    words.forEach((word) => {
        const test = current ? `${current} ${word}` : word;
        if (test.length <= maxChars) {
            current = test;
        } else {
            if (current) lines.push(current);
            current = word;
        }
    });

    if (current) lines.push(current);
    return lines.slice(0, maxLines);
}

function renderWheelLegend(targetId, items, color1, color2) {
    const target = document.getElementById(targetId);
    if (!target) return;

    target.innerHTML = items.map((item, idx) => {
        const label = getWheelLegendLabel(item);
        const color = idx % 2 === 0 ? color1 : color2;
        return `
            <div class="legend-item">
                <span class="legend-chip" style="background:${color}"></span>
                <span class="legend-text">${label}</span>
            </div>
        `;
    }).join('');
}

function isTxLocked() {
    return Date.now() < (state.txLockUntil || 0);
}

function lockTx(ms = 500) {
    const lockMs = Math.max(0, Math.min(Number(ms) || 0, MAX_TX_LOCK_MS));
    state.txLockUntil = Date.now() + lockMs;
}

function getNextWheelRotation(wheelEl, rollBaseDeg) {
    const baseDeg = Math.max(0, Number(rollBaseDeg) || 0);
    const current = Number(wheelEl?.dataset?.rotation || 0);
    const safeCurrent = Number.isFinite(current) ? current : 0;
    const target = safeCurrent + baseDeg;
    if (wheelEl) {
        wheelEl.dataset.rotation = String(target);
    }
    return target;
}

function animateWheelSpin(wheelEl, targetDeg, durationMs = 4100) {
    if (!wheelEl) return;
    wheelEl.style.transition = `transform ${durationMs}ms cubic-bezier(0.12, 0.76, 0.18, 1)`;
    requestAnimationFrame(() => {
        wheelEl.style.transform = `rotate(${targetDeg}deg)`;
    });
}

function spawnCelebrationParticles(theme = 'fire') {
    const holder = document.getElementById('celebration-particles');
    if (!holder) return;
    holder.innerHTML = '';

    const count = 28;
    for (let i = 0; i < count; i += 1) {
        const dot = document.createElement('span');
        dot.className = 'celebration-dot';
        const angle = (Math.PI * 2 * i) / count;
        const radius = 70 + Math.random() * 130;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        dot.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        dot.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        dot.style.animationDelay = `${(Math.random() * 0.18).toFixed(2)}s`;
        holder.appendChild(dot);
    }

    const overlay = document.getElementById('celebration-overlay');
    if (overlay) {
        overlay.classList.remove('fire', 'water');
        overlay.classList.add(theme === 'water' ? 'water' : 'fire');
    }
}

function showCelebration({ title, text, meta = '', theme = 'fire' }) {
    const overlay = document.getElementById('celebration-overlay');
    const titleEl = document.getElementById('celebration-title');
    const textEl = document.getElementById('celebration-text');
    const metaEl = document.getElementById('celebration-meta');

    if (!overlay || !titleEl || !textEl || !metaEl) {
        showToast(String(text || title || 'Награда получена'));
        return;
    }

    titleEl.textContent = String(title || 'ПОБЕДА!');
    textEl.textContent = String(text || 'Награда получена');
    metaEl.textContent = String(meta || 'Система зафиксировала победу героя.');

    spawnCelebrationParticles(theme);
    overlay.classList.add('active');

    if (celebrationCleanupTimer) {
        clearTimeout(celebrationCleanupTimer);
    }
    celebrationCleanupTimer = setTimeout(() => {
        closeCelebration();
    }, 3600);
}

function closeCelebration() {
    const overlay = document.getElementById('celebration-overlay');
    const holder = document.getElementById('celebration-particles');
    if (overlay) {
        overlay.classList.remove('active', 'fire', 'water');
    }
    if (holder) {
        holder.innerHTML = '';
    }
    if (celebrationCleanupTimer) {
        clearTimeout(celebrationCleanupTimer);
        celebrationCleanupTimer = 0;
    }
}

function applyLevelMotivationRewards(levelUps) {
    if (!Number.isFinite(levelUps) || levelUps <= 0) {
        return { levelUps: 0, crystals: 0, hp: 0, shields: 0 };
    }

    let crystalsReward = 0;
    let hpRecovered = 0;
    let shieldReward = 0;

    const levelStart = Number(state.level || 1) - levelUps;
    for (let step = 1; step <= levelUps; step += 1) {
        const level = levelStart + step;
        addCrystals(state, LEVEL_CRYSTAL_REWARD);
        crystalsReward += LEVEL_CRYSTAL_REWARD;

        const hpBefore = Number(state.hp || 0);
        state.hp = Math.min(100, hpBefore + LEVEL_HP_RECOVERY);
        hpRecovered += Math.max(0, state.hp - hpBefore);

        if (level % LEVEL_SHIELD_EVERY === 0) {
            state.shields += 1;
            shieldReward += 1;
        }
    }

    trackEvent('level_reward', {
        levelUps,
        crystalsReward,
        hpRecovered,
        shieldReward
    });

    return {
        levelUps,
        crystals: crystalsReward,
        hp: hpRecovered,
        shields: shieldReward
    };
}

function spendCrystalsSafe(amount) {
    if (state.isSpinning) {
        showToast('Дождись окончания прокрутки.');
        return false;
    }

    if (isTxLocked()) {
        showToast('Секунду, система обрабатывает предыдущее действие.');
        return false;
    }

    if (DEBUG_MODE) {
        // Подкидываем кристаллов для тестов, чтобы не уходить в жесткий минус
        if (state.crystals < amount) state.crystals = amount;
    }

    if (state.crystals < amount) {
        showToast('Недостаточно кристаллов.');
        return false;
    }

    lockTx();
    return spendCrystals(state, amount);
}

function addRewardTicket(title, source) {
    state.rewardQueue.push({
        id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        title,
        source,
        status: 'pending',
        createdAt: Date.now()
    });
}

function applyBonusPrize(prize) {
    const result = {
        xpDelta: 0,
        crystalDelta: 0,
        shieldDelta: 0,
        ticket: '',
        levelUps: 0,
        levelReward: { levelUps: 0, crystals: 0, hp: 0, shields: 0 }
    };

    if (!prize) return result;

    if (prize.kind === 'xp') {
        addXp(state, prize.value);
        const levelUps = applyLevelUps(state, LEVEL_XP_STEP);
        result.levelUps = levelUps;
        result.levelReward = applyLevelMotivationRewards(levelUps);
        result.xpDelta = Number(prize.value || 0);
        return result;
    }

    if (prize.kind === 'crystals') {
        result.crystalDelta = grantCrystalsWithLimit(prize.value, 'wheel');
        return result;
    }

    if (prize.kind === 'shield') {
        state.shields += prize.value;
        result.shieldDelta = Number(prize.value || 0);
        return result;
    }

    if (prize.kind === 'ticket') {
        addRewardTicket(prize.value, 'wheel');
        result.ticket = String(prize.value || '');
    }

    return result;
}

function isNightModeActive(now = new Date()) {
    if (state.settings?.forceDojoState === 'open') return false;
    if (state.settings?.forceDojoState === 'closed') return true;
    if (DEBUG_MODE) return false; // Отключаем ночной режим для тестов
    const bedtimeHour = state.settings?.bedtimeHour ?? 21;
    return isNightModeFromTimers(now, bedtimeHour);
}

function getCountdownToBedtime(now = new Date()) {
    const bedtimeHour = state.settings?.bedtimeHour ?? 21;
    const bedtimeMinute = state.settings?.bedtimeMinute ?? state.settings?.bedtimeMin ?? 0;
    const diff = getCountdownFromTimers(now, bedtimeHour, bedtimeMinute);
    return {
        h: diff.hours,
        m: diff.minutes,
        s: diff.seconds
    };
}

function updateScheduleWidgets() {
    const countdownEl = document.getElementById('bedtime-countdown');
    const statusEl = document.getElementById('night-status');
    const indicatorEl = document.getElementById('night-mode-indicator');

    const now = new Date();
    const timer = getCountdownToBedtime(now);
    const nightActive = isNightModeActive(now);

    if (countdownEl) {
        countdownEl.innerText = `${pad(timer.h)}:${pad(timer.m)}:${pad(timer.s)}`;
    }

    if (statusEl) {
        statusEl.innerText = nightActive ? 'Ночной режим активен' : 'Режим дня активен';
    }

    document.body.classList.toggle('night-mode', nightActive);
    if (indicatorEl) {
        indicatorEl.classList.toggle('active', nightActive);
    }

    if (lastNightMode !== nightActive) {
        lastNightMode = nightActive;
        renderQuests();
    }
}

function getPenaltyPalette(category) {
    if (category === 'medium') {
        return ["#2c1208", "#4a1f10"];
    }

    if (category === 'hard') {
        return ["#2a0303", "#4b0505"];
    }

    return ["#1a050a", "#330a14"];
}

function updatePenaltySelector() {
    const select = document.getElementById('hard-penalty-select');
    if (!select) return;

    const hardPenalties = PENALTIES.hard;
    if (!select.options.length) {
        select.innerHTML = hardPenalties
            .map((text, idx) => `<option value="${idx}">${idx + 1}. ${text}</option>`)
            .join('');
    }

    const current = hardPenalties.indexOf(state.fixedPenalty);
    if (current >= 0) {
        select.value = String(current);
    }
}

function syncPenaltyOverlayUI() {
    const titleEl = document.getElementById('penalty-title');
    const descEl = document.getElementById('penalty-desc');
    const spinBtn = document.getElementById('spin-penalty-btn');
    const resultEl = document.getElementById('penalty-result');
    const resolveBtn = document.getElementById('resolve-btn');
    const cancelBtn = document.getElementById('cancel-penalty-btn');
    const wheel = document.getElementById('penalty-wheel');

    const isFixed = state.penaltyMode === 'fixed';
    const [color1, color2] = getPenaltyPalette(state.penaltyCategory);
    const categoryLabel = state.penaltyCategory === 'medium'
        ? 'СРЕДНИЙ ПРОТОКОЛ'
        : (state.penaltyCategory === 'hard' ? 'ЖЕСТКИЙ ПРОТОКОЛ' : 'ЛЕГКИЙ ПРОТОКОЛ');

    if (titleEl) {
        titleEl.innerText = isFixed ? 'КОДЕКС НАРУШЕН: ЛОЖЬ' : `АКТИВИРОВАН ${categoryLabel}`;
    }

    if (descEl) {
        descEl.innerHTML = isFixed
            ? 'ЗА ЛОЖЬ ПРИМЕНЕН ФИКСИРОВАННЫЙ ШТРАФ БЕЗ РАНДОМА.<br>ПРИНЯТИЕ ПОСЛЕДСТВИЯ ОБЯЗАТЕЛЬНО.'
            : 'СИСТЕМА ЗАПУСТИЛА РУЛЕТКУ ПОСЛЕДСТВИЙ.<br>ПОСЛЕ ВЫПАДЕНИЯ ШТРАФА НУЖНО ПРИНЯТЬ ЕГО.';
    }

    if (spinBtn) {
        spinBtn.style.display = isFixed ? 'none' : 'inline-block';
        spinBtn.disabled = state.isSpinning;
    }

    if (resolveBtn) {
        resolveBtn.style.display = state.activePenaltyResult ? 'inline-block' : 'none';
    }

    if (cancelBtn) {
        cancelBtn.style.display = state.activePenaltyResult ? 'none' : 'inline-block';
        cancelBtn.disabled = state.isSpinning;
    }

    if (resultEl) {
        if (state.activePenaltyResult) {
            resultEl.innerText = `ШТРАФ: ${state.activePenaltyResult}`;
        } else {
            resultEl.innerText = '';
        }
    }

    if (wheel) {
        wheel.style.opacity = isFixed ? '0.18' : '1';
    }

    if (isFixed) {
        const target = document.getElementById('penalty-legend');
        if (target) {
            target.innerHTML = state.activePenaltyResult
                ? `<div class="legend-item"><span class="legend-chip" style="background:${color2}"></span><span class="legend-text">${state.activePenaltyResult}</span></div>`
                : '';
        }
    } else {
        const pool = PENALTIES[state.penaltyCategory] || PENALTIES.light;
        renderWheelLegend('penalty-legend', pool, color1, color2);
    }
}

// --- 3. ЯДРО СИСТЕМЫ ---

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateUI();
}

function updateUI() {
    const uiState = {
        hero: {
            name: state.settings?.heroName || 'АРТЕМ',
            level: state.level,
            hp: state.hp,
            maxHp: 100,
            xp: state.xp,
            crystals: state.crystals
        }
    };

    const activeTab = document.body.dataset.activeTab || 'tab-dashboard';

    renderHud(uiState);
    ensureCrystalFlowState();
    ensureBonusWheelState();
    ensureHonestyState();
    ensureTransformationState();
    renderGlobalDojoMode();

    // Обновление шкал
    document.getElementById('hp-fill').style.width = `${Math.max(0, Math.min(100, state.hp))}%`;
    document.getElementById('xp-fill').style.width = `${Math.max(0, Math.min(100, state.xp / 10))}%`;
    const crystalFillEl = document.getElementById('crystal-fill');
    if (crystalFillEl) {
        const earned = state.crystalFlow?.earnedToday || 0;
        crystalFillEl.style.width = `${Math.max(0, Math.min(100, earned / CRYSTAL_DAILY_LIMIT * 100))}%`;
    }
    renderHeroAvatar();

    // Рендерим только активный таб
    if (activeTab === 'tab-dashboard') {
        renderDashboard(uiState);
        renderTransformationPath();
    } else if (activeTab === 'tab-quests') {
        renderQuests();
    } else if (activeTab === 'tab-store') {
        renderShop();
    } else if (activeTab === 'tab-honesty') {
        renderHonestyProtocol();
    } else if (activeTab === 'tab-admin') {
        renderAdmin();
        renderAdminConsequences();
        renderAdminAnalytics();
    }

    const spinBtn = document.getElementById('spin-bonus-btn');
    const spinHint = document.getElementById('bonus-wheel-hint');
    if (spinBtn) {
        const blockReason = getBonusWheelBlockReason();
        const strictLock = blockReason?.code === 'spinning' || blockReason?.code === 'tx';
        spinBtn.disabled = strictLock;

        if (blockReason?.code === 'spinning') {
            spinBtn.innerText = 'Кручу...';
        } else if (blockReason?.code === 'crystals') {
            spinBtn.innerText = `Нужно ${BONUS_WHEEL_COST} 💎`;
        } else if (blockReason?.code === 'limit') {
            spinBtn.innerText = 'Лимит на сегодня';
        } else if (blockReason?.code === 'cooldown') {
            spinBtn.innerText = blockReason.text.replace('Колесо отдыхает: ', 'Пауза ');
        } else if (blockReason?.code === 'tx') {
            spinBtn.innerText = 'Обработка...';
        } else {
            spinBtn.innerText = `Крутить колесо (${BONUS_WHEEL_COST} 💎)`;
        }
    }

    // Проверка состояния блокировки (HP=0)
    const overlay = document.getElementById('penalty-overlay');
    if (state.hp <= 0) {
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }

    updatePenaltySelector();
    syncPenaltyOverlayUI();

    updateScheduleWidgets();

    renderQuests();
    renderShop();
    renderHonestyProtocol();
    renderAdmin();
    renderAdminConsequences();
    const adminTab = document.getElementById('tab-admin');
    if (adminTab?.classList.contains('active')) {
        renderAdminAnalytics();
    }

    const dailyQuestProgress = document.getElementById('daily-quest-progress');
    const dailyCrystalProgress = document.getElementById('daily-crystal-progress');
    if (dailyQuestProgress || dailyCrystalProgress) {
        const dailyQuestIds = QUEST_GROUPS.dailies.map((q) => q.id);
        const doneDaily = dailyQuestIds.filter((id) => getQuestStatus(id) === 'approved').length;

        if (dailyQuestProgress) {
            dailyQuestProgress.textContent = `Дела сегодня: ${doneDaily}/${dailyQuestIds.length}`;
        }

        if (dailyCrystalProgress) {
            const earned = Number(state.crystalFlow?.earnedToday || 0);
            dailyCrystalProgress.textContent = `Кристаллы сегодня: ${earned}/${CRYSTAL_DAILY_LIMIT}`;
        }
    }

    const navQuests = document.querySelector(".nav-item[onclick*=\"tab-quests\"]");
    const navStore = document.querySelector(".nav-item[onclick*=\"tab-store\"]");
    const isLockedByHonesty = isHonestyLockActive() && !isGlobalDojoClosed();
    if (navQuests) navQuests.classList.toggle('locked', isLockedByHonesty);
    if (navStore) navStore.classList.toggle('locked', isLockedByHonesty);

    renderValuesProgress();
    renderMotivationSystem();
}

function renderValuesProgress() {
    const container = document.getElementById('values-progress');
    if (!container) return;

    const stats = new Map();
    CORE_VALUES_ORDER.forEach((value) => {
        stats.set(value, { total: 0, done: 0 });
    });

    QUEST_DATA.forEach((quest) => {
        const value = typeof quest.value === 'string' ? quest.value.trim() : '';
        if (!value || !stats.has(value)) return;

        const entry = stats.get(value);
        entry.total += 1;
        if (getQuestStatus(quest.id) === 'approved') {
            entry.done += 1;
        }
    });

    container.innerHTML = CORE_VALUES_ORDER
        .filter((value) => (stats.get(value)?.total || 0) > 0)
        .map((value) => {
            const entry = stats.get(value);
            const percent = entry.total > 0 ? Math.round((entry.done / entry.total) * 100) : 0;

            return `
                <div class="value-track-item">
                    <div class="value-track-head">
                        <span>${value}</span>
                        <span class="orbitron">${entry.done}/${entry.total}</span>
                    </div>
                    <div class="value-track-bar">
                        <span class="value-track-fill" style="width:${percent}%"></span>
                    </div>
                </div>
            `;
        })
        .join('');
}

function renderMotivationSystem() {
    const levelEl = document.getElementById('motivation-level');
    const nextEl = document.getElementById('motivation-next-level');
    const hpEl = document.getElementById('motivation-hp-state');
    const penaltyEl = document.getElementById('motivation-penalty');

    if (!levelEl || !nextEl || !hpEl || !penaltyEl) return;

    const level = Number(state.level || 1);
    const hp = Number(state.hp || 0);
    const nextShieldLevel = level + (LEVEL_SHIELD_EVERY - (level % LEVEL_SHIELD_EVERY || LEVEL_SHIELD_EVERY));
    const hpState = hp > 70
        ? 'Стабильный режим: можно брать сложные квесты'
        : (hp > 40 ? 'Внимание: лучше закрыть 1-2 задания на восстановление' : 'Риск-режим: сначала восстанови HP, потом рулетка');

    levelEl.textContent = `УРОВЕНЬ ${level}`;
    nextEl.textContent = `За новый уровень: +${LEVEL_CRYSTAL_REWARD} 💎, +${LEVEL_HP_RECOVERY} HP. Щит на уровне ${nextShieldLevel}.`;
    hpEl.textContent = hpState;
    penaltyEl.textContent = 'Легкий -> Средний -> Жесткий. Невыполнение фиксируется в админке.';
}

// --- 4. РЕНДЕРИНГ КОНТЕНТА ---

function renderQuests() {
    const container = document.getElementById('quest-container');
    if (!container) return;

    const isNight = isNightModeActive();
    container.innerHTML = renderQuestScreen({
        questGroups: QUEST_GROUPS,
        isNight,
        getStatus: getQuestStatus
    });
}

function renderShop() {
    const container = document.getElementById('shop-container');
    if (!container) return;

    const overview = `
        <div class="shop-overview-card">
            <div class="shop-overview-head">
                <span class="shop-overview-title orbitron">МАГАЗИН ПРИЗОВ</span>
                <span class="shop-overview-balance orbitron">${state.crystals} 💎</span>
            </div>
            <div class="shop-overview-tags">
                <span class="shop-overview-tag fire">✦ Огонь Нэчжа</span>
                <span class="shop-overview-tag water">◇ Сила воды</span>
                <span class="shop-overview-tag lotus">❀ Лотос удачи</span>
            </div>
            <p class="shop-overview-desc">Делай задания, копи кристаллы и меняй их на призы. В день можно заработать до ${CRYSTAL_DAILY_LIMIT} 💎, а колесо крутится с паузой.</p>
        </div>
    `;

    container.innerHTML = overview + SHOP_SECTIONS.map((section) => {
        const items = SHOP_DATA.filter((item) => item.category === section.key);
        if (!items.length) return '';

        const spiritBadge = section.key === 'small'
            ? '<span class="shop-spirit-icon nezha" title="Нэчжа">✦</span>'
            : (section.key === 'medium'
                ? '<span class="shop-spirit-icon aobing" title="Ао Бин">◇</span>'
                : '<span class="shop-spirit-icon duo" title="Нэчжа и Ао Бин"><span>✦</span><span>◇</span></span>');

        return `
            <section class="shop-section shop-section-${section.key}">
                <div class="shop-section-head">
                    <h4 class="shop-section-title orbitron">${section.title}</h4>
                    <div class="shop-section-icons">${spiritBadge}</div>
                </div>
                <div class="shop-section-grid">
                    ${items.map((item) => {
                        const isSystemLocked = state.isSpinning || isTxLocked();
                        const noMoney = state.crystals < item.price;
                        const btnClass = noMoney ? 'btn-buy btn-no-money' : (isSystemLocked ? 'btn-buy btn-locked' : 'btn-buy');
                        const tierLabel = section.key === 'small' ? 'ЛЕГКО' : (section.key === 'medium' ? 'КРУТО' : 'ВАУ');
                        return `
                            <div class="shop-card shop-card-${section.key}">
                                <div class="shop-card-top">
                                    <span class="shop-tier-badge">${tierLabel}</span>
                                    <span class="shop-price-tag orbitron">${item.price} 💎</span>
                                </div>
                                <h5>${item.title}</h5>
                                <p class="shop-meta">${item.note || ''}</p>
                                <button class="${btnClass}" onclick="buyItem('${item.id}')">ХОЧУ ЭТОТ ПРИЗ</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    }).join('');
}

function renderHonestyProtocol() {
    const listEl = document.getElementById('honesty-consequence-list');
    const statusEl = document.getElementById('honesty-request-status');
    const submitBtn = document.getElementById('honesty-submit-btn');

    if (!listEl || !statusEl || !submitBtn) return;

    ensureHonestyState();

    const level = state.honesty.selectedLevel;
    const consequences = getHonestyConsequencesByLevel(level);
    const selected = state.honesty.selectedConsequenceByLevel[level] || '';
    const pendingRequest = getPendingHonestyRequest();
    const latestRequest = [...state.honesty.requests].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0] || null;

    document.querySelectorAll('.honesty-level-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.level === level);
    });

    document.querySelectorAll('.honesty-risk-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.level === level);
    });

    const levelLabel = getHonestyLevelLabel(level);

    listEl.innerHTML = consequences.map((text, index) => {
        const active = text === selected ? 'active' : '';
        const flash = active ? 'flash-select' : '';
        const impact = getHonestyConsequenceImpact(text, level);
        const delayMs = index * 120;
        return `
            <button class="honesty-consequence-item level-${level} ${active} ${flash}" style="--reveal-delay:${delayMs}ms" onclick="selectHonestyConsequence(${index})">
                <span class="honesty-consequence-head">
                    <span class="honesty-consequence-index">#${index + 1}</span>
                    <span class="honesty-consequence-level">${levelLabel} протокол</span>
                </span>
                <span class="honesty-consequence-text">${text}</span>
                <span class="honesty-impact-row">
                    <span class="honesty-impact-chip hp">ЗДОРОВЬЕ: ${impact.hp}</span>
                    <span class="honesty-impact-chip xp">ОПЫТ: ${impact.xp}</span>
                    <span class="honesty-impact-chip crystals">КРИСТАЛЛЫ: ${impact.crystals}</span>
                </span>
            </button>
        `;
    }).join('');

    if (pendingRequest) {
        statusEl.textContent = 'Ожидание подтверждения Мастера';
        statusEl.classList.add('waiting');
        statusEl.classList.remove('resolved');
        submitBtn.disabled = true;
        submitBtn.textContent = 'ОЖИДАНИЕ РЕШЕНИЯ';
        submitBtn.classList.remove('ready');
        return;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'ОТПРАВИТЬ НА ПРИЗНАНИЕ';
    submitBtn.classList.toggle('ready', !!selected);

    if (latestRequest?.status === 'approved') {
        statusEl.textContent = `Признание подтверждено: ${getHonestyLevelLabel(latestRequest.level)} протокол.`;
        statusEl.classList.remove('waiting');
        statusEl.classList.add('resolved');
        return;
    }

    if (latestRequest?.status === 'rejected') {
        statusEl.textContent = 'Признание отклонено мастером. При необходимости отправьте снова.';
        statusEl.classList.remove('waiting');
        statusEl.classList.add('resolved');
        return;
    }

    statusEl.textContent = 'Выберите уровень и последствие.';
    statusEl.classList.remove('waiting', 'resolved');
}

function renderAdmin() {
    const container = document.getElementById('admin-pending');
    if (!container) return;

    ensureHonestyState();
    const pendingQuests = QUEST_DATA.filter((q) => getQuestStatus(q.id) === 'pending');
    const rejectedQuests = QUEST_DATA.filter((q) => getQuestStatus(q.id) === 'rejected');
    const pendingRewards = (state.rewardQueue || []).filter((r) => r.status === 'pending');
    const pendingHonestyRequests = (state.honesty.requests || []).filter((request) => request.status === 'pending');
    container.innerHTML = renderAdminScreen({
        pendingQuests,
        rejectedQuests,
        pendingRewards,
        pendingHonestyRequests
    });
}

function queueConsequence(text, category, source = 'wheel') {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    if (!Array.isArray(state.consequenceQueue)) {
        state.consequenceQueue = [];
    }

    state.consequenceQueue.unshift({
        id: `cons_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        text: cleanText,
        category: String(category || 'light'),
        source,
        status: 'pending',
        createdAt: Date.now(),
        resolvedAt: 0
    });

    if (state.consequenceQueue.length > 40) {
        state.consequenceQueue = state.consequenceQueue.slice(0, 40);
    }
}

function renderAdminConsequences() {
    const container = document.getElementById('admin-consequences');
    if (!container) return;

    const queue = Array.isArray(state.consequenceQueue) ? state.consequenceQueue : [];
    const sorted = [...queue].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

    if (!sorted.length) {
        container.innerHTML = `
            <div class="admin-empty">
                <h4>Последствий пока нет</h4>
                <p>После запуска протокола здесь появятся карточки подтверждения. Для каждой выберите: сделал или не сделал.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = sorted.map((entry) => {
        const status = String(entry.status || 'pending');
        const statusLabel = status === 'done' ? 'Сделано' : (status === 'failed' ? 'Не выполнено' : 'Ожидает');
        const statusClass = status === 'done' ? 'done' : (status === 'failed' ? 'failed' : 'pending');
        const categoryLabel = entry.category === 'hard' ? 'Жесткий' : (entry.category === 'medium' ? 'Средний' : 'Легкий');

        return `
            <article class="admin-consequence-card ${statusClass}">
                <div class="admin-consequence-head">
                    <span class="admin-consequence-type">${categoryLabel} протокол</span>
                    <span class="admin-consequence-status ${statusClass}">${statusLabel}</span>
                </div>
                <p class="admin-consequence-text">${entry.text}</p>
                ${status === 'pending'
                    ? `<div class="admin-actions"><button class="btn-action btn-confirm" onclick="markConsequenceDone('${entry.id}')">Сделал</button><button class="btn-action btn-reject" onclick="markConsequenceFailed('${entry.id}')">Не сделал</button></div>`
                    : ''}
            </article>
        `;
    }).join('');
}

// --- 5. ЛОГИКА ДЕЙСТВИЙ ---

function switchHonestyLevel(level) {
    ensureHonestyState();
    if (!HONESTY_LEVELS.includes(level)) return;
    state.honesty.selectedLevel = level;
    renderHonestyProtocol();
}

function selectHonestyConsequence(index) {
    ensureHonestyState();
    const level = state.honesty.selectedLevel;
    const consequences = getHonestyConsequencesByLevel(level);
    const selected = consequences[Number(index)] || consequences[0] || '';
    state.honesty.selectedConsequenceByLevel[level] = selected;
    renderHonestyProtocol();
}

function submitHonestyRequest() {
    ensureHonestyState();

    if (getPendingHonestyRequest()) {
        showToast('Ожидание подтверждения Мастера');
        renderHonestyProtocol();
        return;
    }

    const level = state.honesty.selectedLevel;
    const consequences = getHonestyConsequencesByLevel(level);
    const consequence = state.honesty.selectedConsequenceByLevel[level] || consequences[0] || '';
    if (!consequence) {
        showToast('Сначала выбери последствие.');
        return;
    }

    const request = {
        id: `honesty_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        level,
        consequence,
        status: 'pending',
        createdAt: Date.now(),
        reviewedAt: 0
    };

    state.honesty.requests.unshift(request);
    if (state.honesty.requests.length > 80) {
        state.honesty.requests = state.honesty.requests.slice(0, 80);
    }

    trackEvent('honesty_submitted', { level, consequence });
    saveState();
    showToast('Ожидание подтверждения Мастера');
}

function approveHonestyRequest(requestId) {
    ensureHonestyState();
    const request = (state.honesty.requests || []).find((item) => item.id === requestId);
    if (!request || request.status !== 'pending') return;

    request.status = 'approved';
    request.reviewedAt = Date.now();
    trackEvent('honesty_approved', { level: request.level, consequence: request.consequence });

    triggerPenaltyProtocol(request.level, request.consequence, { bypassShield: true, source: 'honesty' });
}

function rejectHonestyRequest(requestId) {
    ensureHonestyState();
    const request = (state.honesty.requests || []).find((item) => item.id === requestId);
    if (!request || request.status !== 'pending') return;

    request.status = 'rejected';
    request.reviewedAt = Date.now();
    trackEvent('honesty_rejected', { level: request.level, consequence: request.consequence });
    saveState();
}

function submitQuest(id) {
    if (isHonestyLockActive()) {
        alert('Квесты временно заблокированы: сначала дождись решения мастера по признанию.');
        return;
    }

    if (isNightModeActive()) {
        alert('После 21:00 задания отправлять нельзя. Завтра новый цикл.');
        return;
    }

    if (getQuestStatus(id) === 'approved') return;

    // Анти-мухлеж: проверяем последние события
    const now = Date.now();
    const recentSubmits = state.events.filter(e => e.type === 'quest_submitted' && now - e.ts < 60000);
    if (recentSubmits.length >= 4) {
        alert('Слишком много заданий! Магистр подозревает спам. Подожди 1 минуту.');
        return;
    }
    
    // Проверка повторной отправки одного и того же
    const lastSameQuest = [...state.events].reverse().find((event) => event.type === 'quest_submitted' && event.questId === id);
    if (lastSameQuest && now - lastSameQuest.ts < 120000) {
        alert('Ты уже отправил это задание только что. Подожди 2 минуты перед повторной отправкой.');
        return;
    }

    submitQuestState(state, id);
    trackEvent('quest_submitted', { questId: id });
    saveState();
}

function approveQuest(id) {
    if (getQuestStatus(id) !== 'pending') return;

    const q = QUEST_DATA.find((x) => x.id === id);
    if (!q) return;

    const xpDelta = Number(q.xpReward || 0);
    const crystalRaw = Number(q.crystalReward || 0);
    const levelBefore = Number(state.level || 1);

    approveQuestState(state, id, { xp: xpDelta, crystals: 0 });
    const crystalDelta = grantCrystalsWithLimit(crystalRaw, 'quest');
    trackEvent('quest_approved', { questId: id, xpDelta, crystalDelta, crystalRaw });

    if (crystalRaw > crystalDelta) {
        alert(`Лимит кристаллов на сегодня достигнут. Выдано ${crystalDelta} из ${crystalRaw} 💎.`);
    }

    const levelUps = applyLevelUps(state, LEVEL_XP_STEP);
    const levelReward = applyLevelMotivationRewards(levelUps);
    increaseTransformationProgress('quest', 1);

    saveState();

    const bonusMeta = [
        `+${xpDelta} XP`,
        `+${crystalDelta} 💎`
    ];
    if (levelUps > 0) {
        bonusMeta.push(`Уровень: ${levelBefore} -> ${state.level}`);
        bonusMeta.push(`Бонус уровня: +${levelReward.crystals} 💎, +${levelReward.hp} HP${levelReward.shields ? `, +${levelReward.shields} 🛡️` : ''}`);
    }

    showCelebration({
        title: 'КВЕСТ ПОДТВЕРЖДЕН!',
        text: q.title,
        meta: bonusMeta.join(' | '),
        theme: 'water'
    });
}

function rejectQuest(id) {
    if (getQuestStatus(id) !== 'pending') return;
    rejectQuestState(state, id);
    trackEvent('quest_rejected', { questId: id });
    saveState();
}

function buyItem(itemId) {
    if (isHonestyLockActive()) {
        showToast('Магазин временно заблокирован: дождись решения мастера по признанию.');
        return;
    }

    const item = SHOP_DATA.find((x) => x.id === itemId);
    if (!item) return;

    if (state.isSpinning) {
        showToast('Подожди: колесо сейчас крутится.');
        return;
    }

    if (isTxLocked()) {
        showToast('Секунду, система обрабатывает прошлый клик.');
        return;
    }

    if (state.crystals < item.price) {
        showToast(`Не хватает кристаллов: нужно ${item.price} 💎, у тебя ${state.crystals} 💎.`);
        return;
    }

    if (!spendCrystalsSafe(item.price)) {
        return;
    }

    addRewardTicket(item.title, 'shop');
    trackEvent('shop_buy', { itemId, crystalDelta: -item.price });
    saveState();
    showToast(`Запрос отправлен: ${item.title}`);
}

function markRewardIssued(rewardId) {
    const reward = state.rewardQueue.find((r) => r.id === rewardId);
    if (!reward) return;
    reward.status = 'issued';
    reward.issuedAt = Date.now();
    trackEvent('reward_issued', { rewardId });
    saveState();
}

function markConsequenceDone(entryId) {
    const entry = (state.consequenceQueue || []).find((item) => item.id === entryId);
    if (!entry || entry.status !== 'pending') return;

    entry.status = 'done';
    entry.resolvedAt = Date.now();
    increaseTransformationProgress('discipline', 1);
    trackEvent('consequence_done', { entryId, category: entry.category });
    saveState();
    showToast('Отмечено: сделал.');
}

function markConsequenceFailed(entryId) {
    const entry = (state.consequenceQueue || []).find((item) => item.id === entryId);
    if (!entry || entry.status !== 'pending') return;

    entry.status = 'failed';
    entry.resolvedAt = Date.now();
    state.hp = 0;
    state.penaltyMode = 'fixed';
    state.penaltyCategory = entry.category || 'light';
    state.fixedPenalty = entry.text;
    state.activePenaltyResult = entry.text;
    regressTransformationProgress('honesty_fail', 1);
    trackEvent('consequence_failed', { entryId, category: entry.category, hpDelta: -100 });
    saveState();
    showToast('Отмечено: не сделал. Протокол активирован повторно.');
}

function triggerLyingPenalty() {
    const select = document.getElementById('hard-penalty-select');
    const selectedIdx = Number(select?.value || 0);
    const fixed = PENALTIES.hard[selectedIdx] || PENALTIES.hard[0];

    triggerPenaltyProtocol('hard', fixed);
}

function triggerPenaltyProtocol(category, fixedPenaltyText = '', options = {}) {
    if (!PENALTIES[category]) return;

    const bypassShield = Boolean(options?.bypassShield);
    const source = String(options?.source || 'admin');

    if (!bypassShield && category === 'light' && state.shields > 0) {
        state.shields -= 1;
        alert('Щит поглотил легкий штраф. HP не снижен.');
        saveState();
        closeAdmin();
        return;
    }

    state.hp = 0;
    state.penaltyCategory = category;
    state.penaltyMode = category === 'hard' ? 'fixed' : 'wheel';
    state.fixedPenalty = category === 'hard' ? (fixedPenaltyText || PENALTIES.hard[0]) : '';
    state.activePenaltyResult = category === 'hard' ? state.fixedPenalty : '';

    if (category === 'hard' && state.fixedPenalty) {
        queueConsequence(state.fixedPenalty, category, 'fixed');
    }

    trackEvent('penalty_triggered', { category, mode: state.penaltyMode, hpDelta: -100, source });

    if (category !== 'hard') {
        const [color1, color2] = getPenaltyPalette(category);
        drawWheel('penalty-wheel', PENALTIES[category], color1, color2);
    }

    saveState();
    closeAdmin();
}

function cancelPenaltyProtocol() {
    if (state.isSpinning) {
        alert('Сначала дождись окончания прокрутки.');
        return;
    }

    if (state.activePenaltyResult) {
        alert('Штраф уже назначен. После выполнения нажми "Я ВЫПОЛНИЛ ШТРАФ".');
        return;
    }

    state.hp = 100;
    state.fixedPenalty = '';
    state.activePenaltyResult = '';
    state.penaltyMode = 'wheel';
    state.penaltyCategory = 'light';

    drawWheel('penalty-wheel', PENALTIES.light, '#1a050a', '#330a14');
    saveState();
}

function resolvePenalty() {
    if (!state.activePenaltyResult) {
        alert('Сначала нужно получить штраф от системы.');
        return;
    }

    state.hp = 100;
    document.getElementById('resolve-btn').style.display = 'none';
    document.getElementById('penalty-result').innerText = '';
    state.activePenaltyResult = '';
    state.fixedPenalty = '';
    state.penaltyMode = 'wheel';
    state.penaltyCategory = 'light';
    trackEvent('penalty_resolved', { hpDelta: 100 });

    drawWheel('penalty-wheel', PENALTIES.light, "#1a050a", "#330a14");
    saveState();
}

// --- 6. РУЛЕТКИ (CANVAS) ---

function drawWheel(canvasId, items, color1, color2) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const slices = items.length;
    const sliceDeg = 360 / slices;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 5;

    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < slices; i++) {
        const start = (i * sliceDeg) * Math.PI / 180;
        const end = ((i + 1) * sliceDeg) * Math.PI / 180;
        const midDeg = i * sliceDeg + sliceDeg / 2;
        const midRad = midDeg * Math.PI / 180;

        ctx.beginPath();
        const isBonusWheel = canvasId === 'bonus-wheel';
        const mineralColors = [
            'rgba(18, 56, 48, 0.95)',
            'rgba(22, 38, 78, 0.95)',
            'rgba(16, 16, 24, 0.95)',
            'rgba(28, 58, 52, 0.92)',
            'rgba(14, 28, 62, 0.92)',
            'rgba(22, 22, 32, 0.92)',
            'rgba(20, 50, 44, 0.94)',
            'rgba(18, 32, 70, 0.94)'
        ];
        const base = isBonusWheel ? mineralColors[i % mineralColors.length] : (i % 2 === 0 ? color1 : color2);
        const sliceGradient = ctx.createLinearGradient(center, center - radius, center, center + radius);
        sliceGradient.addColorStop(0, `${base}`);
        sliceGradient.addColorStop(1, 'rgba(4, 8, 20, 0.92)');
        ctx.fillStyle = sliceGradient;
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, start, end);
        ctx.fill();

        ctx.strokeStyle = 'rgba(170, 210, 255, 0.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.save();
        ctx.translate(center, center);

        let textRadius = radius * 0.58;
        let rotation = midRad;
        if (midDeg > 90 && midDeg < 270) {
            rotation += Math.PI;
            textRadius = -textRadius;
        }

        ctx.rotate(rotation);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f7fbff';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.font = '700 11px "Russo One"';

        const lines = splitWheelLabel(getWheelItemLabel(items[i]), 12, 3);
        lines.forEach((line, idx) => {
            const y = (idx - (lines.length - 1) / 2) * 11;
            ctx.strokeText(line, textRadius, y);
            ctx.fillText(line, textRadius, y);
        });

        ctx.restore();
    }

    // Наружный светящийся обод
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(148, 198, 255, 0.52)';
    ctx.lineWidth = 5;
    ctx.arc(center, center, radius - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Центральная ступица — сапфировый кристалл
    ctx.beginPath();
    const core = ctx.createRadialGradient(center, center, 1, center, center, radius * 0.22);
    core.addColorStop(0, 'rgba(0, 200, 255, 0.95)');
    core.addColorStop(0.35, 'rgba(0, 100, 220, 0.9)');
    core.addColorStop(0.7, 'rgba(0, 55, 140, 0.85)');
    core.addColorStop(1, 'rgba(4, 12, 30, 0.95)');
    ctx.fillStyle = core;
    ctx.arc(center, center, radius * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, radius * 0.18, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.6)';
    ctx.stroke();

    // Sapphire glow ring
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.18, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 180, 255, 0.15)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(200, 240, 255, 0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 15px "Russo One"';
    ctx.fillText(canvasId === 'bonus-wheel' ? '◆' : '⚠', center, center + 1);

    if (canvasId === 'bonus-wheel') {
        renderWheelLegend('bonus-legend', items, color1, color2);
    }
}

function spinPenaltyWheel() {
    if (state.penaltyMode === 'fixed') return;
    if (state.isSpinning) return;

    const pool = PENALTIES[state.penaltyCategory] || PENALTIES.light;
    state.isSpinning = true;
    const wheel = document.getElementById('penalty-wheel');
    if (!wheel) {
        state.isSpinning = false;
        saveState();
        alert('Не удалось найти колесо штрафов. Обнови страницу.');
        return;
    }

    const roll = spinWheel(pool);
    const deg = getNextWheelRotation(wheel, roll.rotation);
    animateWheelSpin(wheel, deg, 4100);
    
    setTimeout(() => {
        state.isSpinning = false;
        const idx = roll.index;
        state.activePenaltyResult = pool[idx];
        queueConsequence(state.activePenaltyResult, state.penaltyCategory, 'wheel');
        document.getElementById('penalty-result').innerText = "ШТРАФ: " + state.activePenaltyResult;
        document.getElementById('resolve-btn').style.display = 'inline-block';
        trackEvent('penalty_result', { category: state.penaltyCategory, result: state.activePenaltyResult });
        saveState();
    }, 4100);
}

function spinBonusWheel() {
    const blockReason = getBonusWheelBlockReason();
    if (blockReason) {
        showToast(blockReason.text);
        return;
    }
    if (!spendCrystalsSafe(BONUS_WHEEL_COST)) return;

    ensureBonusWheelState();
    state.bonusWheel.lastSpinAt = Date.now();
    state.bonusWheel.spinsToday += 1;

    state.isSpinning = true;
    saveState();
    
    const wheel = document.getElementById('bonus-wheel');
    const wheelWrap = document.getElementById('bonus-wheel-wrap');
    if (!wheel) {
        state.isSpinning = false;
        saveState();
        alert('Не удалось найти колесо. Обнови страницу.');
        return;
    }

    if (wheelWrap) {
        wheelWrap.classList.remove('show-fire', 'show-water');
        // Force reflow so repeated animation triggers consistently.
        void wheelWrap.offsetWidth;
        wheelWrap.classList.add('is-spinning');
    }

    const roll = spinWheel(BONUSES);
    const deg = getNextWheelRotation(wheel, roll.rotation);
    animateWheelSpin(wheel, deg, 4100);
    
    setTimeout(() => {
        state.isSpinning = false;
        const prize = BONUSES[roll.index];
        const prizeLabel = getWheelItemLabel(prize);

        const applied = applyBonusPrize(prize);
        if (wheelWrap) {
            wheelWrap.classList.remove('is-spinning');
            const burstClass = prize.kind === 'crystals' || prize.kind === 'shield' ? 'show-water' : 'show-fire';
            wheelWrap.classList.add(burstClass);
            setTimeout(() => {
                wheelWrap.classList.remove('show-fire', 'show-water');
            }, 900);
        }

        const metaParts = [`Приз: ${prizeLabel}`];

        if (prize.kind === 'crystals') {
            metaParts.push(`+${applied.crystalDelta} 💎`);
            if (Number(prize.value || 0) > applied.crystalDelta) {
                metaParts.push('Сработал дневной лимит кристаллов');
            }
        }

        if (prize.kind === 'xp') {
            metaParts.push(`+${applied.xpDelta} XP`);
            if (applied.levelUps > 0) {
                metaParts.push(`Уровень +${applied.levelUps}`);
                metaParts.push(`Бонус уровня: +${applied.levelReward.crystals} 💎, +${applied.levelReward.hp} HP${applied.levelReward.shields ? `, +${applied.levelReward.shields} 🛡️` : ''}`);
            }
        }

        if (prize.kind === 'shield') {
            metaParts.push(`+${applied.shieldDelta} 🛡️`);
        }

        if (prize.kind === 'ticket' && applied.ticket) {
            metaParts.push(`Запрос в админку: ${applied.ticket}`);
        }

        if (prize.kind === 'xp') {
            trackEvent('bonus_spin', { prize: prize.label, xpDelta: applied.xpDelta, crystalDelta: -50 });
        } else if (prize.kind === 'crystals') {
            trackEvent('bonus_spin', {
                prize: prize.label,
                crystalDelta: applied.crystalDelta - 50,
                crystalRaw: Number(prize.value || 0),
                crystalGranted: applied.crystalDelta
            });
        } else {
            trackEvent('bonus_spin', { prize: prize.label, crystalDelta: -50 });
        }
        saveState();

        showCelebration({
            title: 'ПОБЕДНЫЙ ПРОКРУТ!',
            text: prizeLabel,
            meta: metaParts.join(' | '),
            theme: prize.kind === 'crystals' || prize.kind === 'shield' ? 'water' : 'fire'
        });
    }, 4100);
}

// --- 7. UI И НАВИГАЦИЯ ---

function switchTab(tabId, el, options = {}) {
    const route = String(tabId || '').replace('tab-', '');
    const bypassDojoLock = Boolean(options?.bypassDojoLock);

    if (isGlobalDojoClosed() && !bypassDojoLock && !masterBypassLockdown) {
        showToast('Додзё закрыто: время концентрации и отдыха.');
        return;
    }

    if (isHonestyLockActive() && (route === 'quests' || route === 'store')) {
        alert('Раздел временно ограничен: ожидание подтверждения Мастера по признанию.');
        return;
    }

    setActiveRoute(route);
    if(route === "admin") { setTimeout(renderAdminAnalytics, 100); }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    }
    setTabTheme(tabId);
}

function openAdmin() {
    const pinScreen = document.getElementById('pin-screen');
    const pinField = document.getElementById('pin-field');
    const pinError = document.getElementById('pin-error');
    const pinBox = document.querySelector('.pin-box');

    if (pinScreen) {
        pinScreen.style.display = 'flex';
    }

    if (pinField) {
        pinField.value = '';
        pinField.focus();
    }

    if (pinError) {
        pinError.innerText = '';
    }

    pinBox?.classList.remove('shake');
}

function closeAdmin() {
    const pinScreen = document.getElementById('pin-screen');
    const pinField = document.getElementById('pin-field');
    const pinError = document.getElementById('pin-error');
    const pinBox = document.querySelector('.pin-box');

    if (pinScreen) {
        pinScreen.style.display = 'none';
    }

    if (pinField) {
        pinField.value = '';
    }

    if (pinError) {
        pinError.innerText = '';
    }

    pinBox?.classList.remove('shake');
}

function checkPIN() {
    const pinField = document.getElementById('pin-field');
    const pinError = document.getElementById('pin-error');
    const pinBox = document.querySelector('.pin-box');
    const enteredPin = pinField?.value || '';

    if (pinError && enteredPin.length < 4) {
        pinError.innerText = '';
        pinError.classList.remove('active');
    }

    if (isMasterPinValid(enteredPin, { settings: { masterPin: state.settings.masterPin } })) {
        if (isGlobalDojoClosed()) {
            masterBypassLockdown = true;
        }
        closeAdmin();
        switchTab('tab-admin', document.querySelector('.nav-admin'), { bypassDojoLock: true });
        renderGlobalDojoMode();
        return;
    }

    if (enteredPin.length >= 4) {
        if (pinError) {
            pinError.innerText = 'Неверный PIN. Попробуй еще раз.';
            pinError.classList.add('active');
        }

        if (pinField) {
            pinField.value = '';
            pinField.focus();
        }

        if (pinBox) {
            pinBox.classList.remove('shake');
            void pinBox.offsetWidth;
            pinBox.classList.add('shake');
        }
    }
}

function resetAccountToZero() {
    const confirmed = window.confirm('Сбросить аккаунт героя до нуля?\nXP, кристаллы, квесты и награды будут очищены.');
    if (!confirmed) {
        return;
    }

    const currentSettings = {
        ...state.settings
    };

    state = {
        ...structuredClone(DEFAULT_STATE),
        crystals: 0,
        settings: {
            ...structuredClone(DEFAULT_STATE.settings),
            ...currentSettings
        }
    };

    trackEvent('account_reset_zero', { by: 'master' });
    saveState();
    alert('Аккаунт сброшен до нуля.');
}

// Отрисовка динамического аватара Нэчжа
function renderHeroAvatar() {
    const hp = Math.max(0, Math.min(100, Number(state.hp || 0)));
    const mood = hp <= 0 ? 'fallen' : hp < 35 ? 'critical' : hp < 70 ? 'worn' : 'charged';
    const transformationLevel = getTransformationLevel();
    const formStage = getTransformationStage(transformationLevel);

    const avatarRing = document.querySelector('.avatar-ring');
    const avatarContainer = document.getElementById('hero-avatar');
    if (avatarRing) {
        TRANSFORMATION_STAGES.forEach((name) => avatarRing.classList.remove(`stage-${name}`));
        avatarRing.classList.add(`stage-${formStage}`);
    }
    if (avatarContainer) {
        TRANSFORMATION_STAGES.forEach((name) => avatarContainer.classList.remove(`stage-${name}`));
        avatarContainer.classList.add(`stage-${formStage}`);
    }

    renderAvatar('hero-avatar', {
        mood,
        formStage,
        evolutionLevel: transformationLevel
    });
}

Object.assign(window, {
    switchTab,
    switchHonestyLevel,
    selectHonestyConsequence,
    submitHonestyRequest,
    approveHonestyRequest,
    rejectHonestyRequest,
    openAdmin,
    closeAdmin,
    checkPIN,
    toggleGlobalDojoMode,
    toggleDojoOverride,
    submitQuest,
    approveQuest,
    rejectQuest,
    buyItem,
    markRewardIssued,
    markConsequenceDone,
    markConsequenceFailed,
    triggerPenaltyProtocol,
    triggerLyingPenalty,
    cancelPenaltyProtocol,
    closeCelebration,
    spinPenaltyWheel,
    resolvePenalty,
    spinBonusWheel,
    resetAccountToZero
});

// Запуск
function initApp() {
    const migrated = migrateLegacyPendingToStatuses();
    if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    ensureCrystalFlowState();
    ensureBonusWheelState();
    ensureTransformationState();
    if (!state.settings) state.settings = {};
    state.settings.globalDojoMode = GLOBAL_DOJO_MODES.includes(state.settings.globalDojoMode)
        ? state.settings.globalDojoMode
        : 'open';

    renderHeroAvatar();
    updatePenaltySelector();
    closeCelebration();
    drawWheel('penalty-wheel', PENALTIES.light, "#1a050a", "#330a14");
    drawWheel('bonus-wheel', BONUSES, "#ff7a45", "#32d8ff");
    state.isSpinning = false;
    state.txLockUntil = 0;
    setTabTheme('tab-dashboard');

    updateUI();
    window.setInterval(updateScheduleWidgets, 1000);
}

window.addEventListener('load', initApp);