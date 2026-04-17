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
import { initFirebase, pushStateToCloud, loadStateFromCloud, subscribeToCloudState } from './modules/firebase.js';

// --- 1. КОНСТАНТЫ И НАСТРОЙКИ ---
const DEBUG_MODE = false;
const STORAGE_KEY = 'neon_strike_state';
const MAX_EVENT_LOG = 500;
const MASTER_PIN = '4851';
const CRYSTAL_DAILY_LIMIT = 110;
const BONUS_WHEEL_COST = 150;
const MAX_TX_LOCK_MS = 15 * 1000;
const BONUS_SPIN_COOLDOWN_MS = 20 * 60 * 1000;
const BONUS_SPINS_PER_DAY_LIMIT = 1;
const WHEEL_SPIN_DURATION_MS = 4100;
const NIGHT_MODE_START_HOUR = 22;
const NIGHT_MODE_START_MINUTE = 0;
const NIGHT_MODE_END_HOUR = 6;
const NIGHT_MODE_END_MINUTE = 30;
const LEVEL_XP_STEP = 1000;
const LEVEL_CRYSTAL_REWARD_BASE = 50;
const LEVEL_CRYSTAL_REWARD_STEP = 10;
const LEVEL_HP_RECOVERY_BASE = 30;
const LEVEL_HP_RECOVERY_STEP = 5;
const LEVEL_SHIELD_EVERY = 4;
const PHYSICAL_RESET_PERIOD_DAYS = 3;
const MANUAL_CRYSTAL_GRANT_MIN = 5;
const MANUAL_CRYSTAL_GRANT_MAX = 25;
const MANUAL_CRYSTAL_GRANT_DAILY_LIMIT = 1;
const MANUAL_CRYSTAL_GRANT_WEEKLY_LIMIT = 60;
const MANUAL_CRYSTAL_GRANT_REASON_MIN = 4;
const SHOP_WEEKLY_LIMITS = {
    m4: 1
};
const HONESTY_LEVELS = ['light', 'medium', 'hard'];
const HONESTY_LOCK_STORE_AND_QUESTS = true;
const GLOBAL_DOJO_MODES = ['open', 'closed'];
const HERO_LOCK_TEXT = {
    penalty: 'Сначала выполни активное последствие и восстанови HP.',
    dojoActions: 'Додзё закрыто: функции героя временно отключены.',
    dojoTab: 'Додзё закрыто: время концентрации и отдыха.',
    dojoWheel: 'Додзё закрыто: колесо недоступно.'
};
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
    questCycles: {
        dailyStamp: '',
        physicalCycleKey: ''
    },
    shopWeeklyPurchases: {},
    masterCrystalGrant: {
        dayStamp: '',
        weekStamp: '',
        grantsToday: 0,
        grantedThisWeek: 0
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
        bedtimeMinute: 0,
        globalDojoMode: 'open',
        dojoLogExpanded: false
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
            questCycles: {
                ...DEFAULT_STATE.questCycles,
                ...(saved.questCycles || {}),
                dailyStamp: typeof saved?.questCycles?.dailyStamp === 'string' ? saved.questCycles.dailyStamp : '',
                physicalCycleKey: typeof saved?.questCycles?.physicalCycleKey === 'string' ? saved.questCycles.physicalCycleKey : ''
            },
            shopWeeklyPurchases: saved?.shopWeeklyPurchases && typeof saved.shopWeeklyPurchases === 'object'
                ? saved.shopWeeklyPurchases
                : {},
            masterCrystalGrant: {
                ...DEFAULT_STATE.masterCrystalGrant,
                ...(saved.masterCrystalGrant || {}),
                dayStamp: typeof saved?.masterCrystalGrant?.dayStamp === 'string' ? saved.masterCrystalGrant.dayStamp : '',
                weekStamp: typeof saved?.masterCrystalGrant?.weekStamp === 'string' ? saved.masterCrystalGrant.weekStamp : '',
                grantsToday: Number.isFinite(saved?.masterCrystalGrant?.grantsToday) ? Math.max(0, Math.floor(saved.masterCrystalGrant.grantsToday)) : 0,
                grantedThisWeek: Number.isFinite(saved?.masterCrystalGrant?.grantedThisWeek) ? Math.max(0, Math.floor(saved.masterCrystalGrant.grantedThisWeek)) : 0
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
let lastScheduleRenderKey = '';
let celebrationCleanupTimer = 0;
let masterBypassLockdown = false;
let isBonusWheelDrawn = false;
let isPenaltyWheelDrawn = false;
let honestyDelegationBound = false;

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
        .slice(-30)
        .reverse();

    if (!events.length) {
        target.innerHTML = '<p class="dojo-mode-log-empty">Событий пока нет.</p>';
        return;
    }

    if (!state.settings || typeof state.settings !== 'object') {
        state.settings = {};
    }

    const collapsedLimit = 3;
    const expanded = Boolean(state.settings.dojoLogExpanded);
    const visible = expanded ? events : events.slice(0, collapsedLimit);
    const hiddenCount = Math.max(0, events.length - visible.length);

    const rows = visible.map((entry) => {
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

    const toggle = (hiddenCount > 0 || expanded)
        ? `<button class="btn-action dojo-mode-log-toggle" onclick="toggleDojoLogHistory()">${expanded ? 'СКРЫТЬ ПРОШЛЫЕ ЗАПИСИ' : `ПОКАЗАТЬ ПРОШЛЫЕ ЗАПИСИ (+${hiddenCount})`}</button>`
        : '';

    target.innerHTML = `${rows}${toggle}`;
}

function toggleDojoLogHistory() {
    if (!state.settings || typeof state.settings !== 'object') {
        state.settings = {};
    }

    state.settings.dojoLogExpanded = !Boolean(state.settings.dojoLogExpanded);
    saveState();
    renderDojoModeLog();
}

function renderGlobalDojoMode() {
    const mode = getGlobalDojoMode();
    const isClosed = mode === 'closed';
    const lockVisible = isClosed && !masterBypassLockdown;

    const overlay = document.getElementById('dojo-lockdown-overlay');
    const stateText = document.getElementById('dojo-lockdown-state');
    const caption = document.getElementById('dojo-mode-caption');
    const toggleBtn = document.getElementById('dojo-mode-toggle-btn');
    const navQuests = document.querySelector(".nav-item[onclick*=\"tab-quests\"]");
    const navStore = document.querySelector(".nav-item[onclick*=\"tab-store\"]");

    if (overlay) {
        overlay.classList.toggle('active', lockVisible);
    }

    document.body.classList.toggle('dojo-lockdown', isClosed);
    if (navQuests) navQuests.classList.toggle('locked', isClosed);
    if (navStore) navStore.classList.toggle('locked', isClosed);

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
    renderGlobalDojoMode();
    updateUI();
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
        const taskTitle = curr.title || QUEST_DATA.find((quest) => quest.id === curr.questId)?.title || 'Квест';
        acc[taskTitle] = (acc[taskTitle] || 0) + 1;
        return acc;
    }, {});
    const sortedTasks = Object.entries(completedTasks).sort((a,b)=>b[1]-a[1]).slice(0, 5);
    
    let statsDiv = document.getElementById("admin-top-tasks");
    const adminAnalytics = document.querySelector('.admin-analytics-section');
    if (adminAnalytics && !statsDiv) {
        statsDiv = document.createElement("div");
        statsDiv.id = "admin-top-tasks";
        statsDiv.className = 'admin-top-tasks';
        adminAnalytics.appendChild(statsDiv);
    }
    if (statsDiv) {
        if (sortedTasks.length) {
            statsDiv.innerHTML = `<h4 class="orbitron admin-top-tasks-title">ЧАСТЫЕ ДЕЛА</h4><ul class="admin-top-tasks-list">${sortedTasks.map((task) => `<li>${task[0]} — <b>${task[1]} раз</b></li>`).join('')}</ul>`;
        } else {
            statsDiv.innerHTML = '<p class="admin-top-tasks-empty">Пока нет подтвержденных дел.</p>';
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

    // Energy flow line
    const lineGradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    lineGradient.addColorStop(0, 'rgba(128, 245, 255, 0.96)');
    lineGradient.addColorStop(1, 'rgba(62, 138, 255, 0.82)');
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 2.6;
    ctx.shadowColor = 'rgba(110, 230, 255, 0.48)';
    ctx.shadowBlur = 9;
    ctx.beginPath();
    penaltiesSeries.forEach((value, i) => {
        const x = pad.left + i * stepX + stepX / 2;
        const y = pad.top + plotH - (value / maxPen) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Crystal points
    penaltiesSeries.forEach((value, i) => {
        const x = pad.left + i * stepX + stepX / 2;
        const y = pad.top + plotH - (value / maxPen) * plotH;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        const crystalSize = 4.2;
        const pointGradient = ctx.createLinearGradient(-crystalSize, -crystalSize, crystalSize, crystalSize);
        pointGradient.addColorStop(0, 'rgba(214, 252, 255, 1)');
        pointGradient.addColorStop(1, 'rgba(74, 169, 255, 0.95)');
        ctx.fillStyle = pointGradient;
        ctx.shadowColor = 'rgba(132, 233, 255, 0.54)';
        ctx.shadowBlur = 7;
        ctx.fillRect(-crystalSize / 2, -crystalSize / 2, crystalSize, crystalSize);
        ctx.restore();
    });
    ctx.shadowBlur = 0;

    // Labels
    ctx.fillStyle = 'rgba(185, 206, 255, 0.8)';
    ctx.font = '700 10px "Orbitron"';
    labels.forEach((label, i) => {
        const x = pad.left + i * stepX + stepX / 2;
        ctx.fillText(label, x - 12, cssHeight - 10);
    });

    // Legend
    ctx.fillStyle = 'rgba(0, 255, 204, 0.88)';
    ctx.fillRect(pad.left, 4, 10, 6);
    ctx.fillStyle = 'rgba(184, 210, 255, 0.85)';
    ctx.font = '700 9px "Orbitron"';
    ctx.fillText('XP', pad.left + 14, 10);
    ctx.fillStyle = 'rgba(112, 226, 255, 0.95)';
    ctx.fillRect(pad.left + 48, 4, 10, 6);
    ctx.fillStyle = 'rgba(184, 210, 255, 0.85)';
    ctx.fillText('Поток', pad.left + 62, 10);
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

function getWeekStamp(time = Date.now()) {
    const d = new Date(time);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day + 3);
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    const firstDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
    const weekNumber = 1 + Math.round((d - firstThursday) / (7 * 86400000));
    return `${d.getFullYear()}-W${pad(weekNumber)}`;
}

function getEpochDay(time = Date.now()) {
    return Math.floor(getStartOfDay(time) / 86400000);
}

function getPhysicalCycleKey(time = Date.now()) {
    return String(Math.floor(getEpochDay(time) / PHYSICAL_RESET_PERIOD_DAYS));
}

function getLevelCrystalReward(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return LEVEL_CRYSTAL_REWARD_BASE + (safeLevel - 1) * LEVEL_CRYSTAL_REWARD_STEP;
}

function getLevelHpRecovery(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return LEVEL_HP_RECOVERY_BASE + (safeLevel - 1) * LEVEL_HP_RECOVERY_STEP;
}

function ensureQuestCycleState() {
    if (!state.questCycles || typeof state.questCycles !== 'object') {
        state.questCycles = { dailyStamp: '', physicalCycleKey: '' };
    }

    if (typeof state.questCycles.dailyStamp !== 'string') {
        state.questCycles.dailyStamp = '';
    }

    if (typeof state.questCycles.physicalCycleKey !== 'string') {
        state.questCycles.physicalCycleKey = '';
    }

    if (!state.questCycles.dailyStamp) {
        state.questCycles.dailyStamp = getDayStamp();
    }

    if (!state.questCycles.physicalCycleKey) {
        state.questCycles.physicalCycleKey = getPhysicalCycleKey();
    }
}

function ensureShopWeeklyPurchasesState() {
    if (!state.shopWeeklyPurchases || typeof state.shopWeeklyPurchases !== 'object') {
        state.shopWeeklyPurchases = {};
    }
}

function ensureMasterCrystalGrantState() {
    if (!state.masterCrystalGrant || typeof state.masterCrystalGrant !== 'object') {
        state.masterCrystalGrant = {
            dayStamp: '',
            weekStamp: '',
            grantsToday: 0,
            grantedThisWeek: 0
        };
    }

    const today = getDayStamp();
    const week = getWeekStamp();

    if (state.masterCrystalGrant.dayStamp !== today) {
        state.masterCrystalGrant.dayStamp = today;
        state.masterCrystalGrant.grantsToday = 0;
    }

    if (state.masterCrystalGrant.weekStamp !== week) {
        state.masterCrystalGrant.weekStamp = week;
        state.masterCrystalGrant.grantedThisWeek = 0;
    }

    state.masterCrystalGrant.grantsToday = Math.max(0, Math.floor(Number(state.masterCrystalGrant.grantsToday) || 0));
    state.masterCrystalGrant.grantedThisWeek = Math.max(0, Math.floor(Number(state.masterCrystalGrant.grantedThisWeek) || 0));
}

function resetQuestStatusesForGroup(groupKey) {
    const ids = QUEST_DATA.filter((quest) => quest.groupKey === groupKey).map((quest) => quest.id);
    if (!ids.length) return false;

    let changed = false;
    ids.forEach((id) => {
        const status = getQuestStatus(id);
        if (status !== 'todo') {
            setQuestStatus(id, 'todo');
            changed = true;
        }
    });

    const pendingBefore = Array.isArray(state.pending) ? state.pending.length : 0;
    state.pending = (state.pending || []).filter((id) => !ids.includes(id));
    if ((state.pending || []).length !== pendingBefore) {
        changed = true;
    }

    return changed;
}

function applyQuestCycleResets() {
    ensureQuestCycleState();

    let changed = false;
    const today = getDayStamp();
    if (state.questCycles.dailyStamp !== today) {
        changed = resetQuestStatusesForGroup('dailies') || changed;
        state.questCycles.dailyStamp = today;
    }

    const physicalCycleKey = getPhysicalCycleKey();
    if (state.questCycles.physicalCycleKey !== physicalCycleKey) {
        changed = resetQuestStatusesForGroup('physical') || changed;
        state.questCycles.physicalCycleKey = physicalCycleKey;
    }

    return changed;
}

function getShopWeeklyLockReason(itemId) {
    ensureShopWeeklyPurchasesState();

    const weeklyLimit = Number(SHOP_WEEKLY_LIMITS[itemId] || 0);
    if (!weeklyLimit) return '';

    const weekStamp = getWeekStamp();
    const entry = state.shopWeeklyPurchases[itemId] || {};
    const count = entry.weekStamp === weekStamp ? Number(entry.count || 0) : 0;
    if (count < weeklyLimit) return '';

    return 'Доступно только 1 раз в неделю';
}

function registerShopWeeklyPurchase(itemId) {
    const weeklyLimit = Number(SHOP_WEEKLY_LIMITS[itemId] || 0);
    if (!weeklyLimit) return;

    ensureShopWeeklyPurchasesState();
    const weekStamp = getWeekStamp();
    const current = state.shopWeeklyPurchases[itemId] || {};
    const currentCount = current.weekStamp === weekStamp ? Number(current.count || 0) : 0;
    state.shopWeeklyPurchases[itemId] = {
        weekStamp,
        count: currentCount + 1
    };
}

function getHonestyResourcePenalty(level) {
    if (level === 'hard') {
        return { crystalPercent: 100, xpPercent: 100, label: 'Обнуление 💎 и XP' };
    }
    if (level === 'medium') {
        return { crystalPercent: 30, xpPercent: 20, label: '-30% 💎 и -20% XP' };
    }
    return { crystalPercent: 10, xpPercent: 0, label: '-10% 💎' };
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
    if (level === 'hard') {
        return { hp: 'до 0 (жесткий протокол)', xp: 'до 0', crystals: 'до 0' };
    }

    if (level === 'medium') {
        return { hp: 'до 0 (средний протокол)', xp: '-20%', crystals: '-30%' };
    }

    return { hp: 'до 0 (мягкий протокол)', xp: 'без потерь', crystals: '-10%' };
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
        return;
    }

    state.honesty.requests = state.honesty.requests.map((request) => ({
        ...request,
        resourcePenaltyApplied: Boolean(request?.resourcePenaltyApplied),
        resourcePenaltyAppliedAt: Number(request?.resourcePenaltyAppliedAt || 0)
    }));
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
    levelText.textContent = `Путь от хаоса к порядку: ${level}/${TRANSFORMATION_MAX_LEVEL}`;
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

function getHeroInteractionLockReason() {
    if (Number(state.hp || 0) <= 0) {
        return { code: 'penalty', text: HERO_LOCK_TEXT.penalty };
    }

    if (isGlobalDojoClosed()) {
        return { code: 'dojo', text: HERO_LOCK_TEXT.dojoActions };
    }

    return null;
}

function isDojoActionsLocked(notify = true) {
    const reason = getHeroInteractionLockReason();
    if (!reason) return false;
    if (notify) {
        showToast(reason.text);
    }
    return true;
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

    if (Number(state.hp || 0) <= 0) {
        return { code: 'penalty', text: HERO_LOCK_TEXT.penalty };
    }

    if (isGlobalDojoClosed()) {
        return { code: 'dojo', text: HERO_LOCK_TEXT.dojoWheel };
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

function ensureBonusWheelDrawn() {
    if (isBonusWheelDrawn) return;
    drawWheel('bonus-wheel', BONUSES, '#ff7a45', '#32d8ff');
    isBonusWheelDrawn = true;
}

function ensurePenaltyWheelDrawn(items = PENALTIES.light, color1 = '#1a050a', color2 = '#330a14') {
    if (isPenaltyWheelDrawn) return;
    drawWheel('penalty-wheel', items, color1, color2);
    isPenaltyWheelDrawn = true;
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

function animateWheelSpin(wheelEl, targetDeg, durationMs = WHEEL_SPIN_DURATION_MS) {
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
        const crystalRewardForLevel = getLevelCrystalReward(level);
        const hpRewardForLevel = getLevelHpRecovery(level);

        addCrystals(state, crystalRewardForLevel);
        crystalsReward += crystalRewardForLevel;

        const hpBefore = Number(state.hp || 0);
        state.hp = Math.min(100, hpBefore + hpRewardForLevel);
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
    const safeAmount = Number(amount);
    if (!Number.isFinite(safeAmount) || safeAmount <= 0 || !Number.isInteger(safeAmount)) {
        showToast('Некорректная сумма списания.');
        return false;
    }

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
        if (state.crystals < safeAmount) state.crystals = safeAmount;
    }

    if (state.crystals < safeAmount) {
        showToast('Недостаточно кристаллов.');
        return false;
    }

    lockTx();
    return spendCrystals(state, safeAmount);
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
    if (DEBUG_MODE) return false; // Отключаем ночной режим для тестов
    const bedtimeHour = state.settings?.bedtimeHour ?? NIGHT_MODE_START_HOUR;
    const bedtimeMinute = state.settings?.bedtimeMinute ?? state.settings?.bedtimeMin ?? NIGHT_MODE_START_MINUTE;
    const wakeHour = state.settings?.wakeHour ?? NIGHT_MODE_END_HOUR;
    const wakeMinute = state.settings?.wakeMinute ?? NIGHT_MODE_END_MINUTE;
    return isNightModeFromTimers(now, bedtimeHour, bedtimeMinute, wakeHour, wakeMinute);
}

function getCountdownToBedtime(now = new Date()) {
    const bedtimeHour = state.settings?.bedtimeHour ?? NIGHT_MODE_START_HOUR;
    const bedtimeMinute = state.settings?.bedtimeMinute ?? state.settings?.bedtimeMin ?? NIGHT_MODE_START_MINUTE;
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
    const clockText = `${pad(timer.h)}:${pad(timer.m)}:${pad(timer.s)}`;
    const activeTab = document.body.dataset.activeTab || 'tab-dashboard';
    const timerKey = activeTab === 'tab-dashboard' ? clockText : '';
    const renderKey = `${activeTab}|${timerKey}|${nightActive ? '1' : '0'}`;

    if (lastScheduleRenderKey === renderKey) return;
    lastScheduleRenderKey = renderKey;

    if (activeTab === 'tab-dashboard' && countdownEl) {
        countdownEl.innerText = clockText;
    }

    if (activeTab === 'tab-dashboard' && statusEl) {
        statusEl.innerText = nightActive
            ? 'Ночной режим активен (22:00-06:30)'
            : 'Режим дня активен (до 22:00)';
    }

    if (indicatorEl) {
        indicatorEl.innerText = nightActive
            ? 'НОЧНОЙ РЕЖИМ 22:00-06:30'
            : 'РЕЖИМ ДНЯ ДО 22:00';
    }

    if (lastNightMode !== nightActive) {
        lastNightMode = nightActive;
        document.body.classList.toggle('night-mode', nightActive);
        if (indicatorEl) {
            indicatorEl.classList.toggle('active', nightActive);
        }
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
    const isOverlayActive = state.hp <= 0;
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

    if (!isOverlayActive) {
        return;
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
        ensurePenaltyWheelDrawn(pool, color1, color2);
        renderWheelLegend('penalty-legend', pool, color1, color2);
    }
}

// --- 3. ЯДРО СИСТЕМЫ ---

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    pushStateToCloud(state);
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

    renderHud(uiState);
    ensureCrystalFlowState();
    ensureBonusWheelState();
    ensureHonestyState();
    ensureTransformationState();
    ensureShopWeeklyPurchasesState();
    ensureMasterCrystalGrantState();
    const cycleChanged = applyQuestCycleResets();
    if (cycleChanged) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
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

    // Рендерим только активный таб + dashboard HUD всегда
    renderDashboard(uiState);
    renderTransformationPath();
    
    const activeTab = document.body.dataset.activeTab || 'tab-dashboard';
    if (activeTab === 'tab-quests') {
        renderQuests();
    } else if (activeTab === 'tab-store') {
        renderShop();
    } else if (activeTab === 'tab-honesty') {
        renderHonestyProtocol();
    } else if (activeTab === 'tab-admin') {
        renderAdmin();
        renderAdminConsequences();
        renderAdminAnalytics();
        renderAdminMasterControls();
    }

    const spinBtn = document.getElementById('spin-bonus-btn');
    if (spinBtn) {
        const blockReason = getBonusWheelBlockReason();
        const strictLock = blockReason?.code === 'spinning' || blockReason?.code === 'tx' || blockReason?.code === 'dojo' || blockReason?.code === 'penalty';
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
        } else if (blockReason?.code === 'penalty') {
            spinBtn.innerText = 'Сначала последствие';
        } else if (blockReason?.code === 'dojo') {
            spinBtn.innerText = 'Додзё закрыто';
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
    const isDojoLockedForHero = isGlobalDojoClosed();
    if (navQuests) navQuests.classList.toggle('locked', isDojoLockedForHero);
    if (navStore) navStore.classList.toggle('locked', isDojoLockedForHero);

    if (activeTab === 'tab-dashboard') {
        renderValuesProgress();
        renderMotivationSystem();
    }
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
    const upcomingLevel = level + 1;
    const upcomingCrystalReward = getLevelCrystalReward(upcomingLevel);
    const upcomingHpReward = getLevelHpRecovery(upcomingLevel);
    const hpState = hp > 70
        ? 'Сильная форма: можно брать сложные задания и физические квесты'
        : (hp > 40 ? 'Нужно восстановление: закрой 1-2 базовых дела подряд' : 'Критический режим: сначала подними HP, потом берись за риск');

    levelEl.textContent = `УРОВЕНЬ ${level}`;
    nextEl.textContent = `Уровень ${upcomingLevel}: +${upcomingCrystalReward} 💎, +${upcomingHpReward} HP. Щит на уровне ${nextShieldLevel}.`;
    hpEl.textContent = hpState;
    penaltyEl.textContent = 'Light: -10% 💎 | Medium: -30% 💎 и -20% XP | Hard: обнуление 💎 и XP.';
}

// --- 4. РЕНДЕРИНГ КОНТЕНТА ---

function renderQuests() {
    const container = document.getElementById('quest-container');
    if (!container) return;

    const isDojoClosed = isGlobalDojoClosed();
    const isPenaltyClosed = Number(state.hp || 0) <= 0;
    const statusKey = QUEST_DATA
        .map((quest) => `${quest.id}:${getQuestStatus(quest.id)}`)
        .join('|');
    const nextRenderKey = `${isDojoClosed ? 1 : 0}|${isPenaltyClosed ? 1 : 0}|${Number(state.level || 1)}|${statusKey}`;

    if (container.dataset.renderKey === nextRenderKey) {
        return;
    }

    container.dataset.renderKey = nextRenderKey;
    container.innerHTML = renderQuestScreen({
        questGroups: QUEST_GROUPS,
        isDojoClosed,
        isPenaltyClosed,
        getStatus: getQuestStatus
    });
}

function renderShop() {
    const container = document.getElementById('shop-container');
    if (!container) return;

    ensureBonusWheelDrawn();
    const isDojoClosed = isGlobalDojoClosed();
    const isPenaltyClosed = Number(state.hp || 0) <= 0;

    const nextRenderKey = `${state.crystals}|${state.isSpinning ? 1 : 0}|${isTxLocked() ? 1 : 0}|${getWeekStamp()}|${isDojoClosed ? 1 : 0}|${isPenaltyClosed ? 1 : 0}`;
    if (container.dataset.renderKey === nextRenderKey) {
        return;
    }
    container.dataset.renderKey = nextRenderKey;

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
                        const weeklyLockText = getShopWeeklyLockReason(item.id);
                        const weeklyLocked = Boolean(weeklyLockText);
                        const isSystemLocked = state.isSpinning || isTxLocked() || weeklyLocked || isDojoClosed || isPenaltyClosed;
                        const noMoney = state.crystals < item.price;
                        const btnClass = noMoney ? 'btn-buy btn-no-money' : (isSystemLocked ? 'btn-buy btn-locked' : 'btn-buy');
                        const btnText = isPenaltyClosed
                            ? 'СНАЧАЛА ПОСЛЕДСТВИЕ'
                            : (isDojoClosed
                                ? 'ДОДЗЁ ЗАКРЫТО'
                                : (weeklyLocked ? 'ДОСТУПНО РАЗ В НЕДЕЛЮ' : 'ХОЧУ ЭТОТ ПРИЗ'));
                        const tierLabel = section.key === 'small' ? 'ЛЕГКО' : (section.key === 'medium' ? 'КРУТО' : 'ВАУ');
                        return `
                            <div class="shop-card shop-card-${section.key}">
                                <div class="shop-card-top">
                                    <span class="shop-tier-badge">${tierLabel}</span>
                                    <span class="shop-price-tag orbitron">${item.price} 💎</span>
                                </div>
                                <h5>${item.title}</h5>
                                <p class="shop-meta">${item.note || ''}</p>
                                ${weeklyLockText ? `<span class="shop-lock-note">${weeklyLockText}</span>` : ''}
                                <button class="${btnClass}" ${isSystemLocked ? 'disabled' : ''} onclick="buyItem('${item.id}')">${btnText}</button>
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

    if (!listEl) return;

    ensureHonestyState();

    const level = state.honesty.selectedLevel;
    const isDojoClosed = isGlobalDojoClosed();
    const isPenaltyClosed = Number(state.hp || 0) <= 0;
    const isInteractionLocked = isDojoClosed || isPenaltyClosed;
    const consequences = getHonestyConsequencesByLevel(level);
    const selected = state.honesty.selectedConsequenceByLevel[level] || '';
    const pendingRequests = (state.honesty.requests || []).filter((request) => request.status === 'pending');
    const pendingKeySet = new Set(pendingRequests.map((request) => `${request.level}|${request.consequence}`));
    const latestRequest = state.honesty.requests[0] || null;
    const honestyKey = `${level}|${isDojoClosed ? 1 : 0}|${isPenaltyClosed ? 1 : 0}|${pendingRequests.length}|${latestRequest ? `${latestRequest.id}:${latestRequest.status}` : ''}|${state.honesty.requests.length}`;

    bindHonestyDelegation();

    if (listEl.dataset.renderKey === honestyKey) {
        return;
    }
    listEl.dataset.renderKey = honestyKey;

    document.querySelectorAll('.honesty-level-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.level === level);
        btn.disabled = isInteractionLocked;
    });

    document.querySelectorAll('.honesty-risk-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.level === level);
    });

    const levelLabel = getHonestyLevelLabel(level);

    // Anti-flash: lock container height during DOM swap
    const prevHeight = listEl.offsetHeight;
    if (prevHeight > 0) {
        listEl.style.minHeight = prevHeight + 'px';
    }

    listEl.innerHTML = consequences.map((text, index) => {
        const active = text === selected ? 'active' : '';
        const impact = getHonestyConsequenceImpact(text, level);
        const pendingForCard = pendingKeySet.has(`${level}|${text}`);
        const cardLocked = isInteractionLocked || pendingForCard;
        const submitLocked = isInteractionLocked || pendingForCard;
        const submitLabel = pendingForCard ? 'ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ' : 'ОТПРАВИТЬ НА ПРИЗНАНИЕ';
        return `
            <article class="honesty-consequence-item level-${level} ${active} ${pendingForCard ? 'is-pending' : ''} ${cardLocked ? 'is-disabled' : ''}" data-consequence-index="${index}">
                <span class="honesty-consequence-head">
                    <span class="honesty-consequence-tags">
                        <span class="honesty-consequence-index">#${index + 1}</span>
                        <span class="honesty-consequence-level">${levelLabel} протокол</span>
                    </span>
                    <button class="btn-action honesty-card-submit ${pendingForCard ? 'sent' : ''}" ${submitLocked ? 'disabled' : ''} data-submit-index="${index}">${submitLabel}</button>
                </span>
                <span class="honesty-consequence-text">${text}</span>
                <span class="honesty-impact-row">
                    <span class="honesty-impact-chip hp">ЗДОРОВЬЕ: ${impact.hp}</span>
                    <span class="honesty-impact-chip xp">ОПЫТ: ${impact.xp}</span>
                    <span class="honesty-impact-chip crystals">КРИСТАЛЛЫ: ${impact.crystals}</span>
                </span>
            </article>
        `;
    }).join('');

    // Release height lock after browser paints new content
    requestAnimationFrame(() => { listEl.style.minHeight = ''; });

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'ОТПРАВКА ЧЕРЕЗ КАРТОЧКИ';
        submitBtn.classList.remove('ready', 'waiting');
    }

    if (isPenaltyClosed) {
        if (statusEl) {
            statusEl.textContent = HERO_LOCK_TEXT.penalty;
            statusEl.classList.remove('waiting', 'resolved');
        }
        return;
    }

    if (isDojoClosed) {
        if (statusEl) {
            statusEl.textContent = 'Додзё закрыто: протокол честности временно недоступен.';
            statusEl.classList.remove('waiting', 'resolved');
        }
        return;
    }

    if (pendingRequests.length > 0) {
        if (statusEl) {
            statusEl.textContent = `На проверке у Мастера: ${pendingRequests.length}`;
            statusEl.classList.add('waiting');
            statusEl.classList.remove('resolved');
        }
        return;
    }

    if (latestRequest?.status === 'approved') {
        if (statusEl) {
            statusEl.textContent = latestRequest.resourcePenaltyApplied
                ? `Признание подтверждено: ${getHonestyLevelLabel(latestRequest.level)} протокол, списание применено.`
                : `Признание подтверждено: ${getHonestyLevelLabel(latestRequest.level)} протокол. Ожидает списания в панели Мастера.`;
            statusEl.classList.remove('waiting');
            statusEl.classList.add('resolved');
        }
        return;
    }

    if (latestRequest?.status === 'rejected') {
        if (statusEl) {
            statusEl.textContent = 'Признание отклонено мастером. При необходимости отправьте снова.';
            statusEl.classList.remove('waiting');
            statusEl.classList.add('resolved');
        }
        return;
    }

    if (statusEl) {
        statusEl.textContent = 'Выберите уровень и последствие.';
        statusEl.classList.remove('waiting', 'resolved');
    }
}

function syncHonestySelectedCard(level, selectedText) {
    const listEl = document.getElementById('honesty-consequence-list');
    if (!listEl) return;

    const consequences = getHonestyConsequencesByLevel(level);
    const selected = String(selectedText || '');
    if (!consequences.length) return;

    const selectedIndex = consequences.indexOf(selected);
    if (selectedIndex < 0) {
        renderHonestyProtocol();
        return;
    }

    listEl.querySelectorAll('.honesty-consequence-item').forEach((card, idx) => {
        const match = Number(card.dataset.consequenceIndex || idx) === selectedIndex;
        card.classList.toggle('active', match);
    });
}

function renderAdmin() {
    const container = document.getElementById('admin-pending');
    if (!container) return;

    ensureHonestyState();
    const pendingQuests = QUEST_DATA.filter((q) => getQuestStatus(q.id) === 'pending');
    const rejectedQuests = QUEST_DATA.filter((q) => getQuestStatus(q.id) === 'rejected');
    const pendingRewards = (state.rewardQueue || []).filter((r) => r.status === 'pending');
    const pendingHonestyRequests = (state.honesty.requests || []).filter((request) => request.status === 'pending');
    const approvedHonestyRequests = (state.honesty.requests || []).filter(
        (request) => request.status === 'approved' && !request.resourcePenaltyApplied
    );
    container.innerHTML = renderAdminScreen({
        pendingQuests,
        rejectedQuests,
        pendingRewards,
        pendingHonestyRequests,
        approvedHonestyRequests
    });
}

function getManualCrystalGrantBlockReason() {
    ensureMasterCrystalGrantState();

    if (state.masterCrystalGrant.grantsToday >= MANUAL_CRYSTAL_GRANT_DAILY_LIMIT) {
        return `Лимит на сегодня: ${MANUAL_CRYSTAL_GRANT_DAILY_LIMIT} выдача.`;
    }

    if (state.masterCrystalGrant.grantedThisWeek >= MANUAL_CRYSTAL_GRANT_WEEKLY_LIMIT) {
        return `Лимит на неделю: ${MANUAL_CRYSTAL_GRANT_WEEKLY_LIMIT} 💎.`;
    }

    return '';
}

function renderAdminMasterControls() {
    const statusEl = document.getElementById('admin-crystal-grant-status');
    const actionBtn = document.getElementById('admin-crystal-grant-btn');
    if (!statusEl || !actionBtn) return;

    const blockReason = getManualCrystalGrantBlockReason();
    if (blockReason) {
        statusEl.textContent = blockReason;
        actionBtn.disabled = true;
    } else {
        statusEl.textContent = `Лимит: ${MANUAL_CRYSTAL_GRANT_DAILY_LIMIT} выдача в день, до ${MANUAL_CRYSTAL_GRANT_WEEKLY_LIMIT} 💎 в неделю.`;
        actionBtn.disabled = false;
    }
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
    if (isDojoActionsLocked()) return;
    ensureHonestyState();
    if (!HONESTY_LEVELS.includes(level)) return;
    state.honesty.selectedLevel = level;
    renderHonestyProtocol();
}

function bindHonestyDelegation() {
    if (honestyDelegationBound) return;
    const listEl = document.getElementById('honesty-consequence-list');
    if (!listEl) return;

    listEl.addEventListener('click', (e) => {
        const submitBtn = e.target.closest('.honesty-card-submit');
        if (submitBtn) {
            e.preventDefault();
            e.stopPropagation();
            const index = Number(submitBtn.dataset.submitIndex);
            if (Number.isFinite(index)) {
                submitHonestyRequestFromCard(e, index);
            }
            return;
        }

        const card = e.target.closest('.honesty-consequence-item');
        if (card && !card.classList.contains('is-disabled')) {
            const index = Number(card.dataset.consequenceIndex);
            if (Number.isFinite(index)) {
                selectHonestyConsequence(index);
            }
        }
    });

    honestyDelegationBound = true;
}

function selectHonestyConsequence(index) {
    if (isDojoActionsLocked()) return;
    ensureHonestyState();
    const level = state.honesty.selectedLevel;
    const consequences = getHonestyConsequencesByLevel(level);
    const selected = consequences[Number(index)] || consequences[0] || '';
    state.honesty.selectedConsequenceByLevel[level] = selected;
    syncHonestySelectedCard(level, selected);
}

function submitHonestyRequestFromCard(event, index) {
    if (event?.preventDefault) {
        event.preventDefault();
    }
    if (event?.stopPropagation) {
        event.stopPropagation();
    }

    if (isDojoActionsLocked()) return;
    ensureHonestyState();

    const level = state.honesty.selectedLevel;
    const consequences = getHonestyConsequencesByLevel(level);
    const selected = consequences[Number(index)] || '';
    if (!selected) return;

    state.honesty.selectedConsequenceByLevel[level] = selected;
    submitHonestyRequest(selected);
}

function submitHonestyRequest(consequenceOverride = '') {
    if (isDojoActionsLocked()) return;
    ensureHonestyState();

    const level = state.honesty.selectedLevel;
    const consequences = getHonestyConsequencesByLevel(level);
    const consequence = String(consequenceOverride || state.honesty.selectedConsequenceByLevel[level] || consequences[0] || '').trim();
    if (!consequence) {
        showToast('Сначала выбери последствие.');
        return;
    }

    const samePendingExists = (state.honesty.requests || []).some(
        (request) => request.status === 'pending' && request.level === level && request.consequence === consequence
    );
    if (samePendingExists) {
        showToast('Это последствие уже ожидает подтверждения Мастера.');
        renderHonestyProtocol();
        return;
    }

    state.honesty.selectedConsequenceByLevel[level] = consequence;

    const request = {
        id: `honesty_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        level,
        consequence,
        status: 'pending',
        createdAt: Date.now(),
        reviewedAt: 0,
        resourcePenaltyApplied: false,
        resourcePenaltyAppliedAt: 0
    };

    state.honesty.requests.unshift(request);
    if (state.honesty.requests.length > 80) {
        state.honesty.requests = state.honesty.requests.slice(0, 80);
    }

    trackEvent('honesty_submitted', { level, consequence });
    saveState();
    showToast('Запрос отправлен Мастеру');
}

function approveHonestyRequest(requestId) {
    ensureHonestyState();
    const request = (state.honesty.requests || []).find((item) => item.id === requestId);
    if (!request || request.status !== 'pending') return;

    request.status = 'approved';
    request.reviewedAt = Date.now();
    request.resourcePenaltyApplied = false;
    request.resourcePenaltyAppliedAt = 0;
    trackEvent('honesty_approved', { level: request.level, consequence: request.consequence });

    triggerPenaltyProtocol(request.level, request.consequence, { bypassShield: true, source: 'honesty' });
}

function applyHonestyResourcePenalty(requestId) {
    ensureHonestyState();
    const request = (state.honesty.requests || []).find((item) => item.id === requestId);
    if (!request || request.status !== 'approved') return;

    if (request.resourcePenaltyApplied) {
        showToast('Списание уже применено.');
        return;
    }

    const penalty = getHonestyResourcePenalty(request.level);
    const crystalsBefore = Number(state.crystals || 0);
    const xpBefore = Number(state.xp || 0);

    const calcPenaltyAmount = (value, percent) => {
        const safePercent = Math.max(0, Number(percent) || 0);
        if (safePercent <= 0) return 0;
        const base = Math.abs(Number(value) || 0);
        const fromPercent = Math.floor(base * safePercent / 100);
        // Даже при нулевом балансе штраф формирует долг.
        return Math.max(1, fromPercent);
    };

    let crystalDelta = 0;
    let xpDelta = 0;

    if (penalty.crystalPercent > 0) {
        const spend = calcPenaltyAmount(crystalsBefore, penalty.crystalPercent);
        state.crystals = crystalsBefore - spend;
        crystalDelta = -spend;
    }

    if (penalty.xpPercent > 0) {
        const spend = calcPenaltyAmount(xpBefore, penalty.xpPercent);
        state.xp = xpBefore - spend;
        xpDelta = -spend;
    }

    request.resourcePenaltyApplied = true;
    request.resourcePenaltyAppliedAt = Date.now();

    trackEvent('honesty_penalty_applied', {
        requestId,
        level: request.level,
        crystalDelta,
        xpDelta,
        rule: penalty.label
    });

    saveState();
    showToast(`Списание применено: ${penalty.label}`);
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
    if (isDojoActionsLocked()) return;

    if (getQuestStatus(id) === 'approved') return;

    // Анти-мухлеж: проверяем последние события
    const now = Date.now();
    const recentSubmits = state.events.filter((e) => {
        const ts = Number(e?.ts);
        return e?.type === 'quest_submitted' && Number.isFinite(ts) && now - ts < 60000;
    });
    if (recentSubmits.length >= 4) {
        alert('Слишком много заданий! Магистр подозревает спам. Подожди 1 минуту.');
        return;
    }
    
    // Проверка повторной отправки одного и того же
    const lastSameQuest = [...state.events].reverse().find((event) => {
        const ts = Number(event?.ts);
        return event?.type === 'quest_submitted' && event?.questId === id && Number.isFinite(ts);
    });
    if (lastSameQuest && now - Number(lastSameQuest.ts) < 120000) {
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
    if (isDojoActionsLocked()) return;

    const item = SHOP_DATA.find((x) => x.id === itemId);
    if (!item) return;

    const weeklyLockText = getShopWeeklyLockReason(item.id);
    if (weeklyLockText) {
        showToast(weeklyLockText);
        return;
    }

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
    registerShopWeeklyPurchase(item.id);
    trackEvent('shop_buy', { itemId, crystalDelta: -item.price });
    saveState();
    showToast(`Запрос отправлен: ${item.title}`);
}

function grantManualCrystals() {
    ensureMasterCrystalGrantState();

    const blockReason = getManualCrystalGrantBlockReason();
    if (blockReason) {
        showToast(blockReason);
        return;
    }

    const amountField = document.getElementById('admin-crystal-grant-amount');
    const reasonField = document.getElementById('admin-crystal-grant-reason');
    const rawAmount = Number(amountField?.value || 0);
    const amount = Math.floor(rawAmount);
    const reason = String(reasonField?.value || '').trim();

    if (!Number.isFinite(amount) || amount < MANUAL_CRYSTAL_GRANT_MIN || amount > MANUAL_CRYSTAL_GRANT_MAX) {
        showToast(`Введите сумму от ${MANUAL_CRYSTAL_GRANT_MIN} до ${MANUAL_CRYSTAL_GRANT_MAX} 💎.`);
        return;
    }

    if (reason.length < MANUAL_CRYSTAL_GRANT_REASON_MIN) {
        showToast('Добавь короткую причину награды (минимум 4 символа).');
        return;
    }

    addCrystals(state, amount);
    state.masterCrystalGrant.grantsToday += 1;
    state.masterCrystalGrant.grantedThisWeek += amount;

    trackEvent('master_crystals_granted', {
        amount,
        reason,
        grantsToday: state.masterCrystalGrant.grantsToday,
        grantedThisWeek: state.masterCrystalGrant.grantedThisWeek
    });

    if (amountField) amountField.value = '';
    if (reasonField) reasonField.value = '';

    saveState();
    showToast(`Выдано +${amount} 💎 (${reason})`);
}

function resetEpicQuests() {
    const confirmed = window.confirm('Открыть эпик-квесты заново? Прогресс по эпикам будет сброшен на TODO.');
    if (!confirmed) return;

    const changed = resetQuestStatusesForGroup('epic');
    if (!changed) {
        showToast('Эпики уже открыты.');
        return;
    }

    trackEvent('epic_reset_by_master', { by: 'master' });
    saveState();
    showToast('Эпик-квесты открыты заново.');
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
        isPenaltyWheelDrawn = true;
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
    isPenaltyWheelDrawn = true;
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
    isPenaltyWheelDrawn = true;
    saveState();
}

// --- 6. РУЛЕТКИ (CANVAS) ---

function drawWheel(canvasId, items, color1, color2) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const cssSize = Math.max(1, Math.floor(canvas.clientWidth || canvas.width || 340));
    canvas.width = Math.floor(cssSize * ratio);
    canvas.height = Math.floor(cssSize * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const slices = items.length;
    const sliceDeg = 360 / slices;

    const size = cssSize;
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
    animateWheelSpin(wheel, deg, WHEEL_SPIN_DURATION_MS);
    
    setTimeout(() => {
        state.isSpinning = false;
        const idx = roll.index;
        state.activePenaltyResult = pool[idx];
        queueConsequence(state.activePenaltyResult, state.penaltyCategory, 'wheel');
        document.getElementById('penalty-result').innerText = "ШТРАФ: " + state.activePenaltyResult;
        document.getElementById('resolve-btn').style.display = 'inline-block';
        trackEvent('penalty_result', { category: state.penaltyCategory, result: state.activePenaltyResult });
        saveState();
    }, WHEEL_SPIN_DURATION_MS);
}

function spinBonusWheel() {
    if (isDojoActionsLocked()) return;

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
    animateWheelSpin(wheel, deg, WHEEL_SPIN_DURATION_MS);
    
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
            trackEvent('bonus_spin', { prize: prize.label, xpDelta: applied.xpDelta, crystalDelta: -BONUS_WHEEL_COST });
        } else if (prize.kind === 'crystals') {
            trackEvent('bonus_spin', {
                prize: prize.label,
                crystalDelta: applied.crystalDelta - BONUS_WHEEL_COST,
                crystalRaw: Number(prize.value || 0),
                crystalGranted: applied.crystalDelta
            });
        } else {
            trackEvent('bonus_spin', { prize: prize.label, crystalDelta: -BONUS_WHEEL_COST });
        }
        saveState();

        showCelebration({
            title: 'ПОБЕДНЫЙ ПРОКРУТ!',
            text: prizeLabel,
            meta: metaParts.join(' | '),
            theme: prize.kind === 'crystals' || prize.kind === 'shield' ? 'water' : 'fire'
        });
    }, WHEEL_SPIN_DURATION_MS);
}

// --- 7. UI И НАВИГАЦИЯ ---

function switchTab(tabId, el, options = {}) {
    const route = String(tabId || '').replace('tab-', '');
    const bypassDojoLock = Boolean(options?.bypassDojoLock);
    const isDojoLockedForHero = isGlobalDojoClosed();

    if (isDojoLockedForHero && !bypassDojoLock && (route === 'quests' || route === 'store')) {
        showToast(HERO_LOCK_TEXT.dojoTab);
        return;
    }

    setActiveRoute(route);
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    }
    setTabTheme(tabId);
    updateUI();
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

function exportBackup() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `nezha-quest-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const statusEl = document.getElementById('backup-status');
    if (statusEl) statusEl.textContent = `Бэкап сохранён: ${a.download}`;
}

function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed || typeof parsed !== 'object' || !('hp' in parsed) || !('xp' in parsed)) {
                alert('Файл не содержит данных Nezha Quest.');
                return;
            }
            const confirmed = window.confirm('Загрузить бэкап?\nТекущий прогресс будет заменён данными из файла.');
            if (!confirmed) return;
            Object.assign(state, parsed);
            saveState();
            const statusEl = document.getElementById('backup-status');
            if (statusEl) statusEl.textContent = 'Бэкап успешно загружен!';
            alert('Прогресс восстановлен из бэкапа!');
        } catch {
            alert('Ошибка чтения файла. Убедитесь, что это JSON-бэкап.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
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
    submitHonestyRequestFromCard,
    submitHonestyRequest,
    approveHonestyRequest,
    rejectHonestyRequest,
    applyHonestyResourcePenalty,
    openAdmin,
    closeAdmin,
    checkPIN,
    toggleGlobalDojoMode,
    toggleDojoLogHistory,
    toggleDojoOverride,
    submitQuest,
    approveQuest,
    rejectQuest,
    resetEpicQuests,
    buyItem,
    grantManualCrystals,
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
    resetAccountToZero,
    exportBackup,
    importBackup
});

// Запуск
let _cloudUnsubscribe = null;

async function initApp() {
    // 1. Init Firebase — await so db/auth are ready before we try to load
    await initFirebase();

    // 2. Try to load state from Firebase first; fall back to localStorage
    const cloudState = await loadStateFromCloud();
    if (cloudState && typeof cloudState === 'object' && 'hp' in cloudState) {
        // Cloud has data — use it as the source of truth and update localStorage
        Object.assign(state, cloudState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    // 3. Subscribe to real-time changes from other devices
    _cloudUnsubscribe = subscribeToCloudState((remoteState) => {
        if (!remoteState || typeof remoteState !== 'object') return;
        // Only apply if remote state is genuinely different (avoid echo from own saves)
        const localJson = JSON.stringify({ ...state, isSpinning: false, txLockUntil: 0 });
        const remoteJson = JSON.stringify({ ...remoteState, isSpinning: false, txLockUntil: 0 });
        if (localJson === remoteJson) return;
        Object.assign(state, remoteState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        updateUI();
    });

    const migrated = migrateLegacyPendingToStatuses();
    if (migrated) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    ensureCrystalFlowState();
    ensureBonusWheelState();
    ensureQuestCycleState();
    ensureShopWeeklyPurchasesState();
    ensureMasterCrystalGrantState();
    applyQuestCycleResets();
    ensureTransformationState();
    if (!state.settings) state.settings = {};
    state.settings.bedtimeHour = NIGHT_MODE_START_HOUR;
    state.settings.bedtimeMinute = NIGHT_MODE_START_MINUTE;
    state.settings.wakeHour = NIGHT_MODE_END_HOUR;
    state.settings.wakeMinute = NIGHT_MODE_END_MINUTE;
    state.settings.globalDojoMode = GLOBAL_DOJO_MODES.includes(state.settings.globalDojoMode)
        ? state.settings.globalDojoMode
        : 'open';

    renderHeroAvatar();
    updatePenaltySelector();
    closeCelebration();
    state.isSpinning = false;
    state.txLockUntil = 0;
    setTabTheme('tab-dashboard');

    updateUI();
    window.setInterval(updateScheduleWidgets, 1000);
}

window.addEventListener('load', initApp);