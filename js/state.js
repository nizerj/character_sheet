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
    skillDisplay: 'moons',
    autoDecayEnabled: true,
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
    logs: [],
    healthConnect: {
      connected: false,
      lastSyncAt: null,
      bodyFatPct: null,
      leanMassKg: null,
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
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
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

// --- AWARD XP HELPER ---
function applyXpGain(state, { title, difficultyId, abilityIds, skillIds, multiplier = 1, extraLabel = '' }) {
  const diff = DIFFICULTIES.find(d => d.id === difficultyId) || DIFFICULTIES[2];
  const beforeLevel = getLevelInfo(state.totalXp).level;
  const beforeRanks = getAbilityRankSnapshot(state).ranks;
  const now = new Date().toISOString();

  let gainedTotalXp = 0;
  abilityIds.forEach((abId, idx) => {
    const secMult = idx === 0 ? 1.0 : 0.6;
    const gain = Math.max(1, Math.round(diff.xp * secMult * multiplier));
    state.abilities[abId].xp = Math.max(0, (state.abilities[abId].xp || 0) + gain);
    state.abilities[abId].lastActivity = now;
    state.abilities[abId].lastDecayDate = now;
    gainedTotalXp += gain;
  });

  if (abilityIds.length === 0) {
    gainedTotalXp = Math.max(1, Math.round(diff.xp * multiplier));
  }

  skillIds.forEach(skId => {
    const sk = state.skills.find(s => s.id === skId);
    if (sk) {
      sk.xp = Math.max(0, (sk.xp || 0) + Math.max(1, Math.round(diff.xp * multiplier)));
    }
  });

  state.totalXp += gainedTotalXp;

  state.logs.unshift({
    id: 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    type: 'task',
    title: extraLabel ? `${title} (${extraLabel})` : title,
    difficulty: diff.id,
    baseXp: gainedTotalXp,
    abilities: [...abilityIds],
    skillIds: [...skillIds],
    timestamp: now,
  });

  const afterLevel = getLevelInfo(state.totalXp).level;
  const afterRanks = getAbilityRankSnapshot(state).ranks;

  const rankUps = [];
  for (const ab of ABILITIES) {
    if (afterRanks[ab.id].rank > beforeRanks[ab.id].rank) {
      rankUps.push(`${ab.label} → Rank ${afterRanks[ab.id].rank} (${afterRanks[ab.id].title})`);
    }
  }

  return {
    gainedTotalXp,
    leveledUp: afterLevel > beforeLevel,
    newLevel: afterLevel,
    rankUps,
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

  abilityIds.forEach(abId => {
    state.abilities[abId].xp = Math.max(0, (state.abilities[abId].xp || 0) - penaltyXp);
  });

  skillIds.forEach(skId => {
    const sk = state.skills.find(s => s.id === skId);
    if (sk) sk.xp = Math.max(0, (sk.xp || 0) - Math.round(penaltyXp * 0.7));
  });

  state.totalXp = Math.max(0, state.totalXp - Math.round(penaltyXp * 0.5));

  state.logs.unshift({
    id: 'pen_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    type: 'penalty',
    title: title.trim(),
    severity: sev.id,
    xpDelta: -penaltyXp,
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
    }
  }

  saveState(state);
  return { penaltyXp, rankDowns };
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
