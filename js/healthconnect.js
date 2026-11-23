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

function durationToDifficulty(minutes) {
  if (minutes >= 85) return 'heroic';
  if (minutes >= 50) return 'hard';
  if (minutes >= 25) return 'medium';
  return 'easy';
}

function durationToXp(minutes) {
  if (minutes >= 85) return 190;
  if (minutes >= 50) return 115;
  if (minutes >= 25) return 65;
  return 35;
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
    stepsDate: null,
    stepsBonusAwardedDate: null,
    syncedWorkoutIds: [],
  };
  saveState(state);
}

// Applies synced scale + workout + sleep + steps data into app state
export function applyHealthConnectData(state, payload, { simulated = false } = {}) {
  if (!state.healthConnect) {
    disconnectHealthConnect(state);
  }
  if (!Array.isArray(state.healthConnect.syncedWorkoutIds)) {
    state.healthConnect.syncedWorkoutIds = [];
  }

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
    stepBonusAwarded: false,
  };

  // 1. Bioimpedance Scale: Weight, Body Fat %, Lean Body Mass
  // BUG FIX: When real Health Connect sync returns NO body fat record, clear stale/simulated values so user is never wrongly labeled "Shredded"!
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

  // Record daily body trend point if weight exists
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

  // 3. Steps today + 8,000-step daily Fitness Bonus
  const rawSteps = Math.round(Number(payload.todaySteps) || 0);
  if (rawSteps > 0) {
    state.healthConnect.todaySteps = rawSteps;
    state.healthConnect.stepsDate = today;
    summary.todaySteps = rawSteps;

    if (rawSteps >= 8000 && state.healthConnect.stepsBonusAwardedDate !== today) {
      state.healthConnect.stepsBonusAwardedDate = today;
      const stepXp = 25;
      const nowIso = new Date().toISOString();
      state.abilities.fitness.xp = (state.abilities.fitness.xp || 0) + stepXp;
      state.abilities.fitness.lastActivity = nowIso;
      state.abilities.fitness.lastDecayDate = nowIso;
      state.totalXp += stepXp;
      state.logs.unshift({
        id: 'hc_steps_' + today,
        type: 'task',
        title: `👟 8K+ Steps Bonus (${rawSteps.toLocaleString()} steps)`,
        difficulty: 'easy',
        baseXp: stepXp,
        totalXpDelta: stepXp,
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

  // 4. Hevy / Exercise Sessions
  const sessions = Array.isArray(payload.workouts) ? payload.workouts : [];
  const fitnessSkill = state.skills.find(s => s.linkedAbility === 'fitness');
  const fitnessGoalpost = state.tasks.find(
    t => t.recurrence === 'goalpost' && (t.abilities || []).includes('fitness')
  );

  for (const session of sessions) {
    const sid = session.id || `${session.startTime}_${session.durationMinutes}`;
    if (state.healthConnect.syncedWorkoutIds.includes(sid)) continue;

    state.healthConnect.syncedWorkoutIds.push(sid);
    const mins = Math.max(10, Math.round(session.durationMinutes || 45));
    const title = session.title?.trim() || `Hevy Workout (${mins} min)`;
    const diffId = durationToDifficulty(mins);
    const xp = durationToXp(mins);
    const nowIso = session.endTime || new Date().toISOString();

    const sessionDay = isoToLocalDayKey(session.startTime || nowIso);
    if (fitnessGoalpost && sessionDay === today) {
      const res = completeTask(state, fitnessGoalpost.id);
      if (res) {
        summary.workoutsImported++;
        summary.totalFitnessXp += res.gainedTotalXp;
        continue;
      }
    }

    state.abilities.fitness.xp = (state.abilities.fitness.xp || 0) + xp;
    state.abilities.fitness.lastActivity = nowIso;
    state.abilities.fitness.lastDecayDate = nowIso;
    state.totalXp += xp;

    const skillIds = [];
    const skillDeltas = {};
    if (fitnessSkill) {
      fitnessSkill.xp = (fitnessSkill.xp || 0) + xp;
      skillIds.push(fitnessSkill.id);
      skillDeltas[fitnessSkill.id] = xp;
    }

    state.logs.unshift({
      id: 'hc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'task',
      title: `🏋️ ${title} (Health Connect · ${mins}m)`,
      difficulty: diffId,
      baseXp: xp,
      totalXpDelta: xp,
      abilityDeltas: { fitness: xp },
      skillDeltas,
      abilities: ['fitness'],
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
