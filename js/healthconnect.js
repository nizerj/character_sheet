import { saveState, todayKey, isoToLocalDayKey, completeTask, recordBodySnapshot, updateStreakAndCombo } from './state.js';

function getNativePlugin() {
  return window.Capacitor?.Plugins?.HealthConnect || null;
}

export function isNativeAndroid() {
  return Boolean(window.Capacitor?.isNativePlatform?.() && getNativePlugin());
}

export async function checkHealthConnectAvailability() {
  const plugin = getNativePlugin();
  if (!plugin) {
    return { available: false, reason: 'Web browser mode (install the Android APK for live Health Connect sync).' };
  }
  try {
    return await plugin.isAvailable();
  } catch (err) {
    return { available: false, reason: err?.message || 'Health Connect unavailable.' };
  }
}

export async function requestHealthConnectPermissions() {
  const plugin = getNativePlugin();
  if (!plugin) {
    throw new Error('Health Connect is only available inside the Android APK.');
  }
  return await plugin.requestPermissions();
}

function workoutToDifficultyAndXp(minutes, distanceKm = 0, category = 'workout') {
  if ((category === 'running' && distanceKm >= 10) || minutes >= 85) {
    return { diffId: 'heroic', xp: 190 };
  }
  if ((category === 'running' && distanceKm >= 5) || minutes >= 50) {
    return { diffId: 'hard', xp: 115 };
  }
  if ((category === 'running' && distanceKm >= 2) || minutes >= 25) {
    return { diffId: 'medium', xp: 65 };
  }
  return { diffId: 'easy', xp: 35 };
}

function formatPace(minutes, distanceKm) {
  if (!distanceKm || distanceKm < 0.3 || !minutes || minutes <= 0) return '';
  const paceMin = minutes / distanceKm;
  if (paceMin < 2 || paceMin > 20) return '';
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  const adjM = s === 60 ? m + 1 : m;
  const adjS = s === 60 ? 0 : s;
  return `${adjM}:${String(adjS).padStart(2, '0')}/km`;
}

function matchFitnessSkill(skills, category, workoutTitle = '') {
  const fitSkills = (skills || []).filter(s => s.linkedAbility === 'fitness');
  const titleLower = String(workoutTitle || '').toLowerCase();

  // 1. First check user-defined Auto-Match Keywords across ALL skills (lets any workout title route to exact skill!)
  for (const sk of skills || []) {
    if (!sk.keywords) continue;
    const kwList = String(sk.keywords).split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    if (kwList.some(kw => titleLower.includes(kw))) {
      return sk;
    }
  }

  if (fitSkills.length === 0) return null;

  // 2. Smart cardio/running detection even when logged inside Hevy!
  const cardioRx = /(run|corrida|cardio|jog|bike|cycl|swim|walk|hike|treadmill|esteira|elliptical|hiit|rowing|jump\s*rope|spinning)/i;
  const effectiveCategory = cardioRx.test(titleLower) ? 'cardio' : category;

  if (effectiveCategory === 'running' || effectiveCategory === 'cardio') {
    const match = fitSkills.find(s => cardioRx.test(s.name));
    if (match) return match;
  } else if (effectiveCategory === 'strength') {
    const strRx = /(strength|gym|weight|lift|hevy|muscul|calisthenics|train|academia)/i;
    const match = fitSkills.find(s => strRx.test(s.name));
    if (match) return match;
  }
  return fitSkills[0];
}

// Checks if two workouts from different apps (e.g., Hevy + Samsung Health) overlap in time within ±3 min
function isOverlappingSyncedSession(windows, startMs, endMs) {
  if (!startMs || !endMs || !Array.isArray(windows)) return false;
  const pad = 3 * 60 * 1000;
  return windows.some(w => startMs <= w.end + pad && endMs >= w.start - pad);
}

export function disconnectHealthConnect(state) {
  state.healthConnect = {
    connected: false,
    isSimulated: false,
    hasRealBodyData: false,
    lastSyncAt: null,
    bodyFatPct: null,
    leanMassKg: null,
    lastSleepHours: null,
    sleepDate: null,
    todaySteps: 0,
    stepsSource: null,
    stepsDate: null,
    stepsBonusAwardedDate: null,
    todayDistanceKm: 0,
    distanceDate: null,
    syncedWorkoutIds: [],
    syncedWorkoutWindows: [],
  };
  saveState(state);
}

// Applies synced Samsung Health + Bioimpedance Scale + Hevy data into app state (deduplicated!)
export function applyHealthConnectData(state, payload, { simulated = false } = {}) {
  if (!state.healthConnect) {
    disconnectHealthConnect(state);
  }
  if (!Array.isArray(state.healthConnect.syncedWorkoutIds)) state.healthConnect.syncedWorkoutIds = [];
  if (!Array.isArray(state.healthConnect.syncedWorkoutWindows)) state.healthConnect.syncedWorkoutWindows = [];

  const today = todayKey();
  const summary = {
    weightUpdated: false,
    newWeightKg: null,
    bodyFatPct: null,
    leanMassKg: null,
    workoutsImported: 0,
    totalFitnessXp: 0,
    lastSleepHours: null,
    todaySteps: 0,
    stepsSource: null,
    todayDistanceKm: 0,
    stepBonusAwarded: false,
  };

  // 1. Bioimpedance Scale: Weight, Body Fat %, Lean Body Mass
  const rawWeight = Number(payload.latestWeightKg);
  const rawBf = Number(payload.latestBodyFatPct);
  const rawLean = Number(payload.latestLeanMassKg);

  if (!simulated && (!rawBf || rawBf < 4 || rawBf > 60)) {
    state.healthConnect.bodyFatPct = null;
    state.healthConnect.leanMassKg = null;
    state.healthConnect.hasRealBodyData = false;
  }

  if (rawWeight && rawWeight > 20 && rawWeight < 300) {
    const rounded = Math.round(rawWeight * 10) / 10;
    if (state.profile.weightKg !== rounded) {
      state.profile.weightKg = rounded;
      summary.weightUpdated = true;
      summary.newWeightKg = rounded;
    }
  }

  if (rawBf && rawBf >= 4 && rawBf <= 60) {
    state.healthConnect.bodyFatPct = Math.round(rawBf * 10) / 10;
    summary.bodyFatPct = state.healthConnect.bodyFatPct;
    if (!simulated) state.healthConnect.hasRealBodyData = true;
  }

  const currentW = state.profile.weightKg || rawWeight || 0;
  if (rawLean && rawLean > 15 && (!currentW || rawLean <= currentW * 0.96)) {
    state.healthConnect.leanMassKg = Math.round(rawLean * 10) / 10;
    summary.leanMassKg = state.healthConnect.leanMassKg;
  } else if (!simulated && !rawLean) {
    state.healthConnect.leanMassKg = null;
  }

  if (state.profile.weightKg) {
    recordBodySnapshot(state);
  }

  // 2. Sleep (last night)
  const rawSleep = Number(payload.lastSleepHours);
  if (rawSleep && rawSleep > 0.5 && rawSleep <= 20) {
    state.healthConnect.lastSleepHours = Math.round(rawSleep * 10) / 10;
    state.healthConnect.sleepDate = today;
    summary.lastSleepHours = state.healthConnect.lastSleepHours;
  }

  // 3. Steps today (Samsung Health prioritized natively -> ZERO double counting!)
  const rawSteps = Math.round(Number(payload.todaySteps) || 0);
  if (rawSteps > 0) {
    state.healthConnect.todaySteps = rawSteps;
    state.healthConnect.stepsSource = payload.stepsSource || 'Health Connect';
    state.healthConnect.stepsDate = today;
    summary.todaySteps = rawSteps;
    summary.stepsSource = state.healthConnect.stepsSource;

    if (rawSteps >= 8000 && state.healthConnect.stepsBonusAwardedDate !== today) {
      state.healthConnect.stepsBonusAwardedDate = today;
      const stepXp = 25;
      const stepGold = 12;
      const nowIso = new Date().toISOString();
      state.abilities.fitness.xp = (state.abilities.fitness.xp || 0) + stepXp;
      state.abilities.fitness.lastActivity = nowIso;
      state.abilities.fitness.lastDecayDate = nowIso;
      state.totalXp += stepXp;
      state.gold = (state.gold || 0) + stepGold;
      state.logs.unshift({
        id: 'hc_steps_' + today,
        type: 'task',
        title: `👟 8K+ Steps Bonus (${rawSteps.toLocaleString()} · ${state.healthConnect.stepsSource})`,
        difficulty: 'easy',
        baseXp: stepXp,
        totalXpDelta: stepXp,
        goldDelta: stepGold,
        abilityDeltas: { fitness: stepXp },
        skillDeltas: {},
        abilities: ['fitness'],
        skillIds: [],
        timestamp: nowIso,
      });
      summary.stepBonusAwarded = true;
      summary.totalFitnessXp += stepXp;
      updateStreakAndCombo(state);
    }
  }

  // 4. Today's Cardio / Walking Distance (Samsung Health prioritized)
  const rawDist = Number(payload.todayDistanceKm) || 0;
  if (rawDist > 0.05) {
    state.healthConnect.todayDistanceKm = Math.round(rawDist * 100) / 100;
    state.healthConnect.distanceDate = today;
    summary.todayDistanceKm = state.healthConnect.todayDistanceKm;
  }

  // 5. Exercise Sessions (Hevy Strength + Samsung Health Running & Cardio — deduplicated by ID & time overlap!)
  const sessions = Array.isArray(payload.workouts) ? payload.workouts : [];
  // Prefer Hevy for strength sessions & Samsung Health for running/cardio if overlapping sessions exist
  const prioritized = [...sessions].sort((a, b) => {
    const score = s => (s.sourceApp === 'Hevy' && s.category === 'strength' ? 0 : s.sourceApp === 'Samsung Health' ? 1 : 2);
    return score(a) - score(b);
  });

  for (const session of prioritized) {
    const sid = session.id || `${session.startTime}_${session.durationMinutes}`;
    if (state.healthConnect.syncedWorkoutIds.includes(sid)) continue;

    const startMs = session.startTime ? new Date(session.startTime).getTime() : 0;
    const endMs = session.endTime ? new Date(session.endTime).getTime() : 0;
    if (isOverlappingSyncedSession(state.healthConnect.syncedWorkoutWindows, startMs, endMs)) {
      // Skip duplicate session mirrored across both Hevy and Samsung Health
      state.healthConnect.syncedWorkoutIds.push(sid);
      continue;
    }

    state.healthConnect.syncedWorkoutIds.push(sid);
    if (startMs && endMs) {
      state.healthConnect.syncedWorkoutWindows.push({ start: startMs, end: endMs });
    }

    const mins = Math.max(10, Math.round(session.durationMinutes || 45));
    const category = session.category || 'workout';
    const distKm = Number(session.distanceKm) || 0;
    const sourceApp = session.sourceApp || 'Health Connect';
    const baseTitle = session.title?.trim() || (category === 'running' ? 'Running' : 'Workout');
    const pace = category === 'running' ? formatPace(mins, distKm) : '';
    const icon = category === 'running' ? '🏃' : category === 'cardio' ? '🚴' : '🏋️';

    const details = [];
    if (distKm > 0) details.push(`${distKm} km`);
    details.push(`${mins}m`);
    if (pace) details.push(pace);
    details.push(sourceApp);

    const formattedTitle = `${icon} ${baseTitle} (${details.join(' · ')})`;
    const { diffId, xp } = workoutToDifficultyAndXp(mins, distKm, category);
    const goldEarned = Math.max(10, Math.round(xp * 0.4));
    const nowIso = session.endTime || new Date().toISOString();

    const matchedSkill = matchFitnessSkill(state.skills, category, baseTitle);
    const targetAb = matchedSkill?.linkedAbility && state.abilities[matchedSkill.linkedAbility]
      ? matchedSkill.linkedAbility
      : 'fitness';

    const sessionDay = isoToLocalDayKey(session.startTime || nowIso);
    const matchingGoalpost = state.tasks.find(t => {
      if (t.recurrence !== 'goalpost' || !(t.abilities || []).includes(targetAb)) return false;
      if (matchedSkill && Array.isArray(t.skillIds) && t.skillIds.length > 0) {
        return t.skillIds.includes(matchedSkill.id);
      }
      return true;
    });
    if (matchingGoalpost && sessionDay === today) {
      const res = completeTask(state, matchingGoalpost.id);
      if (res) {
        summary.workoutsImported++;
        summary.totalFitnessXp += res.gainedTotalXp;
        continue;
      }
    }

    state.abilities[targetAb].xp = (state.abilities[targetAb].xp || 0) + xp;
    state.abilities[targetAb].lastActivity = nowIso;
    state.abilities[targetAb].lastDecayDate = nowIso;
    state.totalXp += xp;
    state.gold = (state.gold || 0) + goldEarned;

    const skillIds = [];
    const skillDeltas = {};
    if (matchedSkill) {
      matchedSkill.xp = (matchedSkill.xp || 0) + xp;
      skillIds.push(matchedSkill.id);
      skillDeltas[matchedSkill.id] = xp;
    }

    state.logs.unshift({
      id: 'hc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'task',
      title: formattedTitle,
      difficulty: diffId,
      baseXp: xp,
      totalXpDelta: xp,
      goldDelta: goldEarned,
      abilityDeltas: { [targetAb]: xp },
      skillDeltas,
      abilities: [targetAb],
      skillIds,
      hcSessionId: sid,
      timestamp: nowIso,
    });

    summary.workoutsImported++;
    summary.totalFitnessXp += xp;
    updateStreakAndCombo(state);
  }

  if (state.healthConnect.syncedWorkoutIds.length > 200) {
    state.healthConnect.syncedWorkoutIds = state.healthConnect.syncedWorkoutIds.slice(-200);
  }
  if (state.healthConnect.syncedWorkoutWindows.length > 100) {
    state.healthConnect.syncedWorkoutWindows = state.healthConnect.syncedWorkoutWindows.slice(-100);
  }

  state.healthConnect.connected = true;
  state.healthConnect.isSimulated = Boolean(simulated);
  state.healthConnect.lastSyncAt = new Date().toISOString();
  saveState(state);
  return summary;
}

export async function syncHealthConnect(state, daysBack = 7) {
  const plugin = getNativePlugin();
  if (!plugin) {
    throw new Error('Native Health Connect requires the Android APK.');
  }
  const data = await plugin.syncData({ daysBack });
  return applyHealthConnectData(state, data, { simulated: false });
}
