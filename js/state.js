import {
  ABILITIES,
  DIFFICULTIES,
  PENALTY_SEVERITIES,
  WEEKDAYS,
  evaluateFitnessCap,
  getPersonaRankForXp,
  getLevelInfo,
} from './constants.js';

const STORAGE_KEY = 'persona_life_sheet_v2';

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysKey(dateKey, deltaDays) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return todayKey(dt);
}

export function diffDaysKeys(fromKey, toKey) {
  const [y1, m1, d1] = fromKey.split('-').map(Number);
  const [y2, m2, d2] = toKey.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

// Start of current ISO week (Monday) as YYYY-MM-DD
export function getWeekStartKey(date = new Date()) {
  const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = dt.getDay(); // 0=Sun, 1=Mon...
  const diffToMon = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diffToMon);
  return todayKey(dt);
}

export function createFreshState(keepSettings = null) {
  const now = new Date().toISOString();
  const defaultSettings = {
    theme: 'p5-velvet',
    titleTrack: 'arcana',
    skillDisplay: 'moons',
    autoDecayEnabled: true,
    soundEnabled: true,
    reminderEnabled: false,
    reminderTime: '20:00',
    customColors: { primary: '', gold: '', radar: '' },
    graceDays: {
      academics: 7,
      culture: 10,
      fitness: 6,
      charisma: 12,
      productivity: 4,
    },
    backup: {
      email: '',
      driveClientId: '',
      lastBackupAt: null,
    },
  };

  return {
    setupCompleted: false,
    profile: {
      name: '',
      customClass: '',
      age: null,
      heightCm: null,
      weightKg: null,
      goal: '',
      avatarDataUrl: null,
      pixelateAvatar: false,
    },
    settings: keepSettings ? { ...defaultSettings, ...keepSettings } : defaultSettings,
    totalXp: 0,
    abilities: {
      academics:    { xp: 0, lastActivity: now, lastDecayDate: now },
      culture:      { xp: 0, lastActivity: now, lastDecayDate: now },
      fitness:      { xp: 0, lastActivity: now, lastDecayDate: now },
      charisma:     { xp: 0, lastActivity: now, lastDecayDate: now },
      productivity: { xp: 0, lastActivity: now, lastDecayDate: now },
    },
    skills: [],
    tasks: [],
    bosses: [],
    logs: [],
    bodyHistory: [],
    achievements: { unlocked: {} },
    stats: {
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDay: null,
      balancedDays: 0,
      balancedDaysDates: [],
      goalpostsHit: 0,
      bossesDefeated: 0,
      focusSessions: 0,
      totalFocusMinutes: 0,
      milestonesCompleted: 0,
      hadRankDown: false,
      comebackAchieved: false,
      lastReviewWeek: null,
    },
    healthConnect: {
      connected: false,
      isSimulated: false,
      hasRealBodyData: false,
      lastSyncAt: null,
      bodyFatPct: null,
      leanMassKg: null,
      lastSleepHours: null,
      sleepDate: null,
      todaySteps: 0,
      stepsDate: null,
      stepsBonusAwardedDate: null,
      syncedWorkoutIds: [],
    },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createFreshState();
    const parsed = JSON.parse(raw);
    const fresh = createFreshState();
    return {
      ...fresh,
      ...parsed,
      profile: { ...fresh.profile, ...(parsed.profile || {}) },
      settings: {
        ...fresh.settings,
        ...(parsed.settings || {}),
        customColors: { ...fresh.settings.customColors, ...(parsed.settings?.customColors || {}) },
        graceDays: { ...fresh.settings.graceDays, ...(parsed.settings?.graceDays || {}) },
        backup: { ...fresh.settings.backup, ...(parsed.settings?.backup || {}) },
      },
      abilities: { ...fresh.abilities, ...(parsed.abilities || {}) },
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      bosses: Array.isArray(parsed.bosses) ? parsed.bosses : [],
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      bodyHistory: Array.isArray(parsed.bodyHistory) ? parsed.bodyHistory : [],
      achievements: { ...fresh.achievements, ...(parsed.achievements || {}) },
      stats: { ...fresh.stats, ...(parsed.stats || {}) },
      healthConnect: { ...fresh.healthConnect, ...(parsed.healthConnect || {}) },
    };
  } catch (err) {
    console.warn('Failed to load state:', err);
    return createFreshState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

export function getAbilityRankSnapshot(state) {
  const fitCap = evaluateFitnessCap(state.profile.heightCm, state.profile.weightKg);
  const ranks = {};
  for (const ab of ABILITIES) {
    const xp = state.abilities[ab.id]?.xp || 0;
    const cap = ab.id === 'fitness' ? fitCap.maxRank : null;
    ranks[ab.id] = getPersonaRankForXp(ab.id, xp, cap);
  }
  return { ranks, fitCap };
}

export function getAverageRank(state) {
  const { ranks } = getAbilityRankSnapshot(state);
  const sum = ABILITIES.reduce((acc, ab) => acc + ranks[ab.id].rank, 0);
  return (sum / ABILITIES.length).toFixed(1);
}

// --- TASK SCHEDULE & RECURRENCE EVALUATION ---
export function getTaskStatus(task) {
  const today = todayKey();
  const todayDow = new Date().getDay();
  const weekStart = getWeekStartKey();
  const weekEnd = addDaysKey(weekStart, 6);
  const completions = Array.isArray(task.completions) ? task.completions : [];
  const doneToday = completions.includes(today);
  const lastDone = completions.length > 0 ? completions[completions.length - 1] : null;

  if (task.recurrence === 'one_time') {
    const completed = completions.length > 0;
    const due = task.dueDate || today;
    const overdueDays = !completed ? Math.max(0, diffDaysKeys(due, today)) : 0;
    const isDueToday = !completed && (task.scope === 'today' || due <= today);
    const isInThisWeek = !completed && (task.scope === 'week' || (due >= weekStart && due <= weekEnd) || due <= today);
    return {
      doneToday: completed,
      completedOneTime: completed,
      isDueToday: isDueToday || doneToday,
      isInThisWeek: isInThisWeek || doneToday,
      overdueDays,
      scheduleBadge: task.scope === 'week' ? 'This Week' : 'One-Time',
      statusBadge: completed ? 'Completed' : overdueDays > 0 ? `Overdue ${overdueDays}d` : due === today ? 'Today' : `Due ${due.slice(5)}`,
    };
  }

  if (task.recurrence === 'weekdays') {
    const days = Array.isArray(task.days) && task.days.length > 0 ? task.days : [1, 3, 5];
    const isDueToday = days.includes(todayDow);
    const labels = WEEKDAYS.filter(w => days.includes(w.idx)).map(w => w.short).join(' · ');
    return {
      doneToday,
      completedOneTime: false,
      isDueToday,
      isInThisWeek: true,
      overdueDays: 0,
      scheduleBadge: labels,
      statusBadge: doneToday ? 'Done Today' : isDueToday ? 'Due Today' : 'Scheduled',
    };
  }

  if (task.recurrence === 'spaced') {
    const interval = Math.max(1, Number(task.intervalDays) || 2);
    const nextDue = lastDone ? addDaysKey(lastDone, interval) : today;
    const daysUntil = diffDaysKeys(today, nextDue); // <=0 means due today or overdue
    const overdueDays = daysUntil < 0 ? Math.abs(daysUntil) : 0;
    const isDueToday = daysUntil <= 0 || doneToday;
    const isInThisWeek = daysUntil <= 6 || doneToday;
    return {
      doneToday,
      completedOneTime: false,
      isDueToday,
      isInThisWeek,
      overdueDays,
      scheduleBadge: `Every ${interval}d`,
      statusBadge: doneToday
        ? `Next in ${interval}d`
        : overdueDays > 0
        ? `Overdue ${overdueDays}d`
        : daysUntil === 0
        ? 'Due Today'
        : `In ${daysUntil}d`,
    };
  }

  // Goalpost (X times per week)
  const target = Math.max(1, Number(task.weeklyTarget) || 3);
  const weeklyCompletions = completions.filter(d => d >= weekStart && d <= weekEnd);
  const weeklyCount = weeklyCompletions.length;
  const goalpostReached = weeklyCount >= target;
  return {
    doneToday,
    completedOneTime: false,
    isDueToday: true, // available to check in any day of the week
    isInThisWeek: true,
    overdueDays: 0,
    weeklyCount,
    weeklyTarget: target,
    goalpostReached,
    scheduleBadge: `Goalpost ${target}×/wk`,
    statusBadge: goalpostReached ? 'Quota Reached!' : `${weeklyCount}/${target} this week`,
  };
}

export function recordBodySnapshot(state) {
  const w = Number(state.profile?.weightKg);
  if (!w || w <= 20) return;
  if (!Array.isArray(state.bodyHistory)) state.bodyHistory = [];
  const date = todayKey();
  const entry = {
    date,
    weightKg: Math.round(w * 10) / 10,
    bodyFatPct: state.healthConnect?.bodyFatPct || null,
  };
  const existingIdx = state.bodyHistory.findIndex(x => x.date === date);
  if (existingIdx >= 0) state.bodyHistory[existingIdx] = entry;
  else state.bodyHistory.push(entry);
  if (state.bodyHistory.length > 90) state.bodyHistory = state.bodyHistory.slice(-90);
}

export function isWellRestedToday(state) {
  return Boolean(
    state.healthConnect?.connected &&
    state.healthConnect?.sleepDate === todayKey() &&
    Number(state.healthConnect?.lastSleepHours) >= 7
  );
}

export function isFatiguedToday(state) {
  return Boolean(
    state.healthConnect?.connected &&
    state.healthConnect?.sleepDate === todayKey() &&
    Number(state.healthConnect?.lastSleepHours) > 0 &&
    Number(state.healthConnect?.lastSleepHours) < 5.5
  );
}

export function getTodayTrainedAbilities(state) {
  const today = todayKey();
  const set = new Set();
  for (const log of state.logs || []) {
    if (log.type === 'task' && log.timestamp?.startsWith(today)) {
      (log.abilities || []).forEach(a => set.add(a));
    }
  }
  return set;
}

function updateStreakAndCombo(state) {
  if (!state.stats) state.stats = {};
  const today = todayKey();
  const last = state.stats.lastActiveDay;

  if (last !== today) {
    if (last && diffDaysKeys(last, today) === 1) {
      state.stats.currentStreak = (state.stats.currentStreak || 0) + 1;
    } else {
      state.stats.currentStreak = 1;
    }
    state.stats.bestStreak = Math.max(state.stats.bestStreak || 0, state.stats.currentStreak);
    state.stats.lastActiveDay = today;
  }

  // Check Balanced Day Combo (3+ distinct abilities trained today -> +35 Bonus XP once per day)
  const trained = getTodayTrainedAbilities(state);
  if (!Array.isArray(state.stats.balancedDaysDates)) state.stats.balancedDaysDates = [];
  if (trained.size >= 3 && !state.stats.balancedDaysDates.includes(today)) {
    state.stats.balancedDaysDates.push(today);
    state.stats.balancedDays = (state.stats.balancedDays || 0) + 1;
    const bonus = 35;
    state.totalXp += bonus;
    state.logs.unshift({
      id: 'combo_' + today,
      type: 'task',
      title: `⚡ BALANCED DAY COMBO (${trained.size} Abilities Trained)`,
      difficulty: 'easy',
      baseXp: bonus,
      totalXpDelta: bonus,
      abilityDeltas: {},
      skillDeltas: {},
      abilities: [],
      skillIds: [],
      timestamp: new Date().toISOString(),
    });
    return { balancedComboTriggered: true, comboBonus: bonus };
  }
  return { balancedComboTriggered: false, comboBonus: 0 };
}

// --- AWARD XP HELPER ---
export function applyXpGain(state, { title, difficultyId, abilityIds, skillIds, multiplier = 1, extraLabel = '' }) {
  const diff = DIFFICULTIES.find(d => d.id === difficultyId) || DIFFICULTIES[2];
  const beforeLevel = getLevelInfo(state.totalXp, state.settings?.titleTrack).level;
  const beforeRanks = getAbilityRankSnapshot(state).ranks;
  const now = new Date().toISOString();

  // Well-Rested Sleep Buff (+10% XP)
  const sleepMult = isWellRestedToday(state) ? 1.1 : 1.0;
  const totalMult = multiplier * sleepMult;

  let gainedTotalXp = 0;
  const abilityDeltas = {};
  const skillDeltas = {};

  abilityIds.forEach((abId, idx) => {
    const secMult = idx === 0 ? 1.0 : 0.6;
    const gain = Math.max(1, Math.round(diff.xp * secMult * totalMult));
    state.abilities[abId].xp = Math.max(0, (state.abilities[abId].xp || 0) + gain);
    state.abilities[abId].lastActivity = now;
    state.abilities[abId].lastDecayDate = now;
    abilityDeltas[abId] = gain;
    gainedTotalXp += gain;
  });

  if (abilityIds.length === 0) {
    gainedTotalXp = Math.max(1, Math.round(diff.xp * totalMult));
  }

  skillIds.forEach(skId => {
    const sk = state.skills.find(s => s.id === skId);
    if (sk) {
      const skGain = Math.max(1, Math.round(diff.xp * totalMult));
      sk.xp = Math.max(0, (sk.xp || 0) + skGain);
      skillDeltas[skId] = skGain;
    }
  });

  state.totalXp += gainedTotalXp;

  state.logs.unshift({
    id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    type: 'task',
    title: extraLabel ? `${title} (${extraLabel})` : title,
    difficulty: diff.id,
    baseXp: gainedTotalXp,
    totalXpDelta: gainedTotalXp,
    abilityDeltas,
    skillDeltas,
    abilities: [...abilityIds],
    skillIds: [...skillIds],
    timestamp: now,
  });

  const comboRes = updateStreakAndCombo(state);

  const afterLevel = getLevelInfo(state.totalXp, state.settings?.titleTrack).level;
  const afterRanks = getAbilityRankSnapshot(state).ranks;

  const rankUps = [];
  for (const ab of ABILITIES) {
    if (afterRanks[ab.id].rank > beforeRanks[ab.id].rank) {
      rankUps.push(`${ab.label} → Rank ${afterRanks[ab.id].rank} (${afterRanks[ab.id].title})`);
      if (state.stats?.hadRankDown) state.stats.comebackAchieved = true;
    }
  }

  return {
    gainedTotalXp,
    leveledUp: afterLevel > beforeLevel,
    newLevel: afterLevel,
    rankUps,
    balancedComboTriggered: comboRes.balancedComboTriggered,
    comboBonus: comboRes.comboBonus,
    wellRestedActive: sleepMult > 1,
  };
}

export function completeTask(state, taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return null;

  const status = getTaskStatus(task);
  const today = todayKey();

  if (task.recurrence === 'one_time' && status.completedOneTime) return null;
  if (task.recurrence !== 'one_time' && status.doneToday) return null;

  if (!Array.isArray(task.completions)) task.completions = [];
  task.completions.push(today);

  let result;
  let goalpostBonusTriggered = false;

  if (task.recurrence === 'goalpost') {
    const newCount = status.weeklyCount + 1;
    const hitQuotaNow = newCount === status.weeklyTarget;
    // Partial XP (60%) on every check-in + 100% Goalpost Bonus when quota is reached!
    if (hitQuotaNow) {
      goalpostBonusTriggered = true;
      if (!state.stats) state.stats = {};
      state.stats.goalpostsHit = (state.stats.goalpostsHit || 0) + 1;
      result = applyXpGain(state, {
        title: task.title,
        difficultyId: task.difficulty,
        abilityIds: task.abilities || [],
        skillIds: task.skillIds || [],
        multiplier: 1.6, // 0.6 check-in + 1.0 quota bonus
        extraLabel: `Goalpost ${newCount}/${status.weeklyTarget} BONUS!`,
      });
    } else {
      result = applyXpGain(state, {
        title: task.title,
        difficultyId: task.difficulty,
        abilityIds: task.abilities || [],
        skillIds: task.skillIds || [],
        multiplier: 0.6,
        extraLabel: `Goalpost ${newCount}/${status.weeklyTarget}`,
      });
    }
  } else {
    result = applyXpGain(state, {
      title: task.title,
      difficultyId: task.difficulty,
      abilityIds: task.abilities || [],
      skillIds: task.skillIds || [],
      multiplier: 1.0,
    });
  }

  saveState(state);
  return { ...result, taskTitle: task.title, goalpostBonusTriggered };
}

export function addTask(state, payload) {
  const task = {
    id: 'tsk_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: payload.title.trim(),
    difficulty: payload.difficultyId,
    abilities: [...payload.abilityIds],
    skillIds: [...payload.skillIds],
    recurrence: payload.recurrence, // one_time | weekdays | spaced | goalpost
    scope: payload.scope || 'today',
    dueDate: payload.dueDate || todayKey(),
    days: payload.days || [],
    intervalDays: Number(payload.intervalDays) || 2,
    weeklyTarget: Number(payload.weeklyTarget) || 4,
    completions: [],
    createdAt: new Date().toISOString(),
  };
  state.tasks.unshift(task);
  saveState(state);
  return task;
}

export function deleteTask(state, taskId) {
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  saveState(state);
}

export function logPenalty(state, { title, severityId, abilityIds, skillIds = [], auto = false, customXp = null }) {
  const sev = PENALTY_SEVERITIES.find(s => s.id === severityId) || PENALTY_SEVERITIES[1];
  const penaltyXp = customXp !== null ? Math.abs(customXp) : sev.xp;
  const beforeRanks = getAbilityRankSnapshot(state).ranks;
  const now = new Date().toISOString();

  const abilityDeltas = {};
  const skillDeltas = {};

  abilityIds.forEach(abId => {
    state.abilities[abId].xp = Math.max(0, (state.abilities[abId].xp || 0) - penaltyXp);
    abilityDeltas[abId] = -penaltyXp;
  });

  skillIds.forEach(skId => {
    const sk = state.skills.find(s => s.id === skId);
    if (sk) {
      const skLoss = Math.round(penaltyXp * 0.7);
      sk.xp = Math.max(0, (sk.xp || 0) - skLoss);
      skillDeltas[skId] = -skLoss;
    }
  });

  const totalLoss = Math.round(penaltyXp * 0.5);
  state.totalXp = Math.max(0, state.totalXp - totalLoss);

  state.logs.unshift({
    id: 'pen_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    type: 'penalty',
    title: title.trim(),
    severity: sev.id,
    xpDelta: -penaltyXp,
    totalXpDelta: -totalLoss,
    abilityDeltas,
    skillDeltas,
    abilities: [...abilityIds],
    skillIds: [...skillIds],
    auto,
    timestamp: now,
  });

  const afterRanks = getAbilityRankSnapshot(state).ranks;
  const rankDowns = [];
  for (const ab of ABILITIES) {
    if (afterRanks[ab.id].rank < beforeRanks[ab.id].rank) {
      rankDowns.push(`${ab.label} → Rank ${afterRanks[ab.id].rank} (${afterRanks[ab.id].title})`);
      if (!state.stats) state.stats = {};
      state.stats.hadRankDown = true;
    }
  }

  saveState(state);
  return { penaltyXp, rankDowns };
}

// Deletes a log entry and reverses all XP it granted (or refunds XP if it was a penalty)
export function deleteLogEntry(state, logId) {
  const idx = state.logs.findIndex(l => l.id === logId);
  if (idx === -1) return null;
  const entry = state.logs[idx];
  const isPen = entry.type === 'penalty';

  // Reverse totalXp
  const totalDelta =
    typeof entry.totalXpDelta === 'number'
      ? entry.totalXpDelta
      : isPen
      ? Math.round((entry.xpDelta || 0) * 0.5)
      : entry.baseXp || 0;
  state.totalXp = Math.max(0, state.totalXp - totalDelta);

  // Reverse ability XP
  if (entry.abilityDeltas && Object.keys(entry.abilityDeltas).length > 0) {
    for (const [abId, delta] of Object.entries(entry.abilityDeltas)) {
      if (state.abilities[abId]) {
        state.abilities[abId].xp = Math.max(0, (state.abilities[abId].xp || 0) - delta);
      }
    }
  } else if (Array.isArray(entry.abilities) && entry.abilities.length > 0) {
    // Fallback for legacy logs
    if (isPen) {
      const loss = Math.abs(entry.xpDelta || 0);
      entry.abilities.forEach(abId => {
        if (state.abilities[abId]) state.abilities[abId].xp += loss;
      });
    } else {
      const share = Math.round((entry.baseXp || 0) / entry.abilities.length);
      entry.abilities.forEach(abId => {
        if (state.abilities[abId]) state.abilities[abId].xp = Math.max(0, state.abilities[abId].xp - share);
      });
    }
  }

  // Reverse skill XP
  if (entry.skillDeltas && Object.keys(entry.skillDeltas).length > 0) {
    for (const [skId, delta] of Object.entries(entry.skillDeltas)) {
      const sk = state.skills.find(s => s.id === skId);
      if (sk) sk.xp = Math.max(0, (sk.xp || 0) - delta);
    }
  } else if (Array.isArray(entry.skillIds) && entry.skillIds.length > 0) {
    const fallbackDelta = isPen ? -Math.round(Math.abs(entry.xpDelta || 0) * 0.7) : entry.baseXp || 0;
    entry.skillIds.forEach(skId => {
      const sk = state.skills.find(s => s.id === skId);
      if (sk) sk.xp = Math.max(0, (sk.xp || 0) - fallbackDelta);
    });
  }

  // If this was a Health Connect workout log, allow re-syncing it if desired
  if (entry.hcSessionId && state.healthConnect?.syncedWorkoutIds) {
    state.healthConnect.syncedWorkoutIds = state.healthConnect.syncedWorkoutIds.filter(id => id !== entry.hcSessionId);
  }

  state.logs.splice(idx, 1);
  saveState(state);
  return { title: entry.title, reversedXp: totalDelta };
}

// --- SKILL MILESTONE / SUB-QUEST INCREMENT ---
export function incrementSkillMilestone(state, skillId, stepAmount) {
  const sk = state.skills.find(s => s.id === skillId);
  if (!sk || !sk.milestone || !sk.milestone.target) return null;

  const amt = Math.max(1, Number(stepAmount) || 1);
  const prev = Number(sk.milestone.current) || 0;
  const target = Number(sk.milestone.target);
  const next = Math.min(target, prev + amt);
  const delta = next - prev;
  if (delta <= 0) return null;

  sk.milestone.current = next;
  const justCompleted = next >= target && prev < target;
  if (justCompleted) {
    if (!state.stats) state.stats = {};
    state.stats.milestonesCompleted = (state.stats.milestonesCompleted || 0) + 1;
  }

  const res = applyXpGain(state, {
    title: `${sk.name}: ${sk.milestone.label || 'Milestone'} (+${delta} ${sk.milestone.unit || 'steps'})`,
    difficultyId: justCompleted ? 'hard' : 'easy',
    abilityIds: sk.linkedAbility ? [sk.linkedAbility] : ['productivity'],
    skillIds: [sk.id],
    multiplier: justCompleted ? 1.4 : 0.9,
    extraLabel: justCompleted ? 'MILESTONE COMPLETE!' : `${next}/${target}`,
  });

  saveState(state);
  return { ...res, skillName: sk.name, current: next, target, justCompleted };
}

// --- FOCUS / POMODORO SESSION REWARD (+20% DEEP FOCUS BONUS) ---
export function recordFocusSession(state, { label, minutesCompleted, abilityId, skillId = '', completedFull = true }) {
  if (!state.stats) state.stats = {};
  state.stats.focusSessions = (state.stats.focusSessions || 0) + 1;
  state.stats.totalFocusMinutes = (state.stats.totalFocusMinutes || 0) + minutesCompleted;

  const diffId = minutesCompleted >= 50 ? 'hard' : minutesCompleted >= 25 ? 'medium' : 'easy';
  const mult = completedFull ? 1.2 : 0.85; // +20% Deep Focus Bonus for completing full timer!

  const res = applyXpGain(state, {
    title: `⏱ Focus: ${label} (${minutesCompleted}m)`,
    difficultyId: diffId,
    abilityIds: abilityId ? [abilityId] : ['productivity'],
    skillIds: skillId ? [skillId] : [],
    multiplier: mult,
    extraLabel: completedFull ? '+20% Focus Bonus' : 'Partial',
  });

  saveState(state);
  return res;
}

export function daysSince(isoDate) {
  if (!isoDate) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)));
}

export function runAutoDecayCheck(state) {
  if (!state.setupCompleted || !state.settings.autoDecayEnabled) return [];
  const events = [];
  const nowIso = new Date().toISOString();

  for (const ab of ABILITIES) {
    const entry = state.abilities[ab.id];
    if (!entry || entry.xp <= 0) continue;

    const grace = state.settings.graceDays[ab.id] ?? ab.defaultGraceDays;
    const inactiveDays = daysSince(entry.lastActivity);
    const daysSinceLastDecay = daysSince(entry.lastDecayDate || entry.lastActivity);

    if (inactiveDays > grace && daysSinceLastDecay >= 1) {
      const overdueDays = Math.min(inactiveDays - grace, daysSinceLastDecay);
      const loss = overdueDays * ab.decayPerDay;
      if (loss > 0) {
        const res = logPenalty(state, {
          title: `Auto Decay: ${ab.decayName} (${inactiveDays}d inactive)`,
          severityId: 'minor',
          abilityIds: [ab.id],
          auto: true,
          customXp: loss,
        });
        entry.lastDecayDate = nowIso;
        events.push({ ability: ab.label, loss, rankDowns: res.rankDowns });
      }
    }
  }

  if (events.length > 0) saveState(state);
  return events;
}
