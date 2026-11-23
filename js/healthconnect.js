import { ABILITIES } from './constants.js';
import { saveState, todayKey, completeTask } from './state.js';

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

// Applies synced scale + workout data into app state (deduplicated by session ID)
export function applyHealthConnectData(state, payload) {
  if (!state.healthConnect) {
    state.healthConnect = {
      connected: false,
      lastSyncAt: null,
      bodyFatPct: null,
      syncedWorkoutIds: [],
    };
  }
  if (!Array.isArray(state.healthConnect.syncedWorkoutIds)) {
    state.healthConnect.syncedWorkoutIds = [];
  }

  const summary = {
    weightUpdated: false,
    newWeightKg: null,
    bodyFatPct: null,
    workoutsImported: 0,
    totalFitnessXp: 0,
  };

  // 1. Bioimpedance Scale: Weight & Body Fat %
  if (payload.latestWeightKg && payload.latestWeightKg > 20) {
    const rounded = Math.round(payload.latestWeightKg * 10) / 10;
    if (state.profile.weightKg !== rounded) {
      state.profile.weightKg = rounded;
      summary.weightUpdated = true;
      summary.newWeightKg = rounded;
    }
  }
  if (typeof payload.latestBodyFatPct === 'number' && payload.latestBodyFatPct > 2 && payload.latestBodyFatPct < 70) {
    state.healthConnect.bodyFatPct = Math.round(payload.latestBodyFatPct * 10) / 10;
    summary.bodyFatPct = state.healthConnect.bodyFatPct;
  }
  if (typeof payload.latestLeanMassKg === 'number' && payload.latestLeanMassKg > 15) {
    state.healthConnect.leanMassKg = Math.round(payload.latestLeanMassKg * 10) / 10;
    summary.leanMassKg = state.healthConnect.leanMassKg;
  }

  // 2. Hevy / Exercise Sessions
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

    // If user has a Fitness Goalpost task and workout was today, check it off automatically!
    const sessionDay = (session.startTime || nowIso).slice(0, 10);
    if (fitnessGoalpost && sessionDay === todayKey()) {
      const res = completeTask(state, fitnessGoalpost.id);
      if (res) {
        summary.workoutsImported++;
        summary.totalFitnessXp += res.gainedTotalXp;
        continue;
      }
    }

    // Otherwise award Fitness XP directly + linked Fitness skill
    state.abilities.fitness.xp = (state.abilities.fitness.xp || 0) + xp;
    state.abilities.fitness.lastActivity = nowIso;
    state.abilities.fitness.lastDecayDate = nowIso;
    state.totalXp += xp;

    const skillIds = [];
    if (fitnessSkill) {
      fitnessSkill.xp = (fitnessSkill.xp || 0) + xp;
      skillIds.push(fitnessSkill.id);
    }

    state.logs.unshift({
      id: 'hc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: 'task',
      title: `🏋️ ${title} (Health Connect · ${mins}m)`,
      difficulty: diffId,
      baseXp: xp,
      abilities: ['fitness'],
      skillIds,
      timestamp: nowIso,
    });

    summary.workoutsImported++;
    summary.totalFitnessXp += xp;
  }

  // Keep synced IDs list bounded
  if (state.healthConnect.syncedWorkoutIds.length > 200) {
    state.healthConnect.syncedWorkoutIds = state.healthConnect.syncedWorkoutIds.slice(-200);
  }

  state.healthConnect.connected = true;
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
  return applyHealthConnectData(state, data);
}
