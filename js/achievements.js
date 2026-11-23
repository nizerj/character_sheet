import { ABILITIES, evaluateFitnessCap, getLevelInfo, getSkillMastery } from './constants.js';
import { getAbilityRankSnapshot, saveState } from './state.js';

export const ACHIEVEMENTS = [
  // --- MILESTONES & LEVELS (16) ---
  { id: 'first_task', cat: 'Milestones', name: 'First Blood', desc: 'Complete your very first task.', check: ctx => ctx.taskCount >= 1 },
  { id: 'tasks_10',   cat: 'Milestones', name: 'Getting Rolling', desc: 'Complete 10 tasks.', check: ctx => ctx.taskCount >= 10 },
  { id: 'tasks_25',   cat: 'Milestones', name: 'Quarter Century', desc: 'Complete 25 tasks.', check: ctx => ctx.taskCount >= 25 },
  { id: 'tasks_50',   cat: 'Milestones', name: 'Half-Hundred', desc: 'Complete 50 tasks.', titleReward: 'Taskmaster', check: ctx => ctx.taskCount >= 50 },
  { id: 'tasks_100',  cat: 'Milestones', name: 'Centurion', desc: 'Complete 100 tasks.', titleReward: 'Centurion', check: ctx => ctx.taskCount >= 100 },
  { id: 'tasks_250',  cat: 'Milestones', name: 'Relentless', desc: 'Complete 250 tasks.', check: ctx => ctx.taskCount >= 250 },
  { id: 'tasks_500',  cat: 'Milestones', name: 'Unbroken Machine', desc: 'Complete 500 tasks.', titleReward: 'Unbroken', check: ctx => ctx.taskCount >= 500 },
  { id: 'lvl_2',      cat: 'Milestones', name: 'First Spark', desc: 'Reach Character Level 2.', check: ctx => ctx.level >= 2 },
  { id: 'lvl_5',      cat: 'Milestones', name: 'Rising Potential', desc: 'Reach Character Level 5.', check: ctx => ctx.level >= 5 },
  { id: 'lvl_10',     cat: 'Milestones', name: 'Double Digits', desc: 'Reach Character Level 10.', check: ctx => ctx.level >= 10 },
  { id: 'lvl_15',     cat: 'Milestones', name: 'Seasoned', desc: 'Reach Character Level 15.', check: ctx => ctx.level >= 15 },
  { id: 'lvl_20',     cat: 'Milestones', name: 'Elite Tier', desc: 'Reach Character Level 20.', titleReward: 'Vanguard Elite', check: ctx => ctx.level >= 20 },
  { id: 'lvl_30',     cat: 'Milestones', name: 'High Commander', desc: 'Reach Character Level 30.', check: ctx => ctx.level >= 30 },
  { id: 'lvl_50',     cat: 'Milestones', name: 'Apex Legend', desc: 'Reach Character Level 50.', titleReward: 'Apex Legend', check: ctx => ctx.level >= 50 },
  { id: 'xp_1000',    cat: 'Milestones', name: 'One Thousand Strong', desc: 'Accumulate 1,000 Total XP.', check: ctx => ctx.totalXp >= 1000 },
  { id: 'xp_10000',   cat: 'Milestones', name: 'Tenfold Power', desc: 'Accumulate 10,000 Total XP.', titleReward: 'Overachiever', check: ctx => ctx.totalXp >= 10000 },

  // --- ABILITY RANKS (15) ---
  { id: 'aca_r2', cat: 'Abilities', name: 'Studious Mind', desc: 'Reach Academics Rank 2.', check: ctx => ctx.ranks.academics.rank >= 2 },
  { id: 'aca_r3', cat: 'Abilities', name: 'Learned Scholar', desc: 'Reach Academics Rank 3.', check: ctx => ctx.ranks.academics.rank >= 3 },
  { id: 'aca_r5', cat: 'Abilities', name: 'Erudite', desc: 'Reach MAX Academics Rank 5.', titleReward: 'Erudite', check: ctx => ctx.ranks.academics.rank >= 5 },
  { id: 'cul_r2', cat: 'Abilities', name: 'Curious Soul', desc: 'Reach Culture Rank 2.', check: ctx => ctx.ranks.culture.rank >= 2 },
  { id: 'cul_r3', cat: 'Abilities', name: 'Cultured Eye', desc: 'Reach Culture Rank 3.', check: ctx => ctx.ranks.culture.rank >= 3 },
  { id: 'cul_r5', cat: 'Abilities', name: 'Connoisseur', desc: 'Reach MAX Culture Rank 5.', titleReward: 'Connoisseur', check: ctx => ctx.ranks.culture.rank >= 5 },
  { id: 'fit_r2', cat: 'Abilities', name: 'In Motion', desc: 'Reach Fitness Rank 2.', check: ctx => ctx.ranks.fitness.rank >= 2 },
  { id: 'fit_r3', cat: 'Abilities', name: 'Athletic Build', desc: 'Reach Fitness Rank 3.', check: ctx => ctx.ranks.fitness.rank >= 3 },
  { id: 'fit_r5', cat: 'Abilities', name: 'Peak Human', desc: 'Reach MAX Fitness Rank 5 (requires healthy BMI).', titleReward: 'Peak Athlete', check: ctx => ctx.ranks.fitness.rank >= 5 },
  { id: 'cha_r2', cat: 'Abilities', name: 'Icebreaker', desc: 'Reach Charisma Rank 2.', check: ctx => ctx.ranks.charisma.rank >= 2 },
  { id: 'cha_r3', cat: 'Abilities', name: 'Silver Tongue', desc: 'Reach Charisma Rank 3.', check: ctx => ctx.ranks.charisma.rank >= 3 },
  { id: 'cha_r5', cat: 'Abilities', name: 'Iconic Presence', desc: 'Reach MAX Charisma Rank 5.', titleReward: 'Icon', check: ctx => ctx.ranks.charisma.rank >= 5 },
  { id: 'prd_r2', cat: 'Abilities', name: 'Locked In', desc: 'Reach Productivity Rank 2.', check: ctx => ctx.ranks.productivity.rank >= 2 },
  { id: 'prd_r3', cat: 'Abilities', name: 'Driven Force', desc: 'Reach Productivity Rank 3.', check: ctx => ctx.ranks.productivity.rank >= 3 },
  { id: 'prd_r5', cat: 'Abilities', name: 'Unstoppable', desc: 'Reach MAX Productivity Rank 5.', titleReward: 'Unstoppable', check: ctx => ctx.ranks.productivity.rank >= 5 },

  // --- ALL-ROUNDER (3) ---
  { id: 'all_r2', cat: 'Abilities', name: 'Balanced Start', desc: 'Reach Rank 2 in all 5 abilities.', check: ctx => ctx.minRank >= 2 },
  { id: 'all_r3', cat: 'Abilities', name: 'Renaissance Path', desc: 'Reach Rank 3 in all 5 abilities.', titleReward: 'Polymath', check: ctx => ctx.minRank >= 3 },
  { id: 'all_r5', cat: 'Abilities', name: 'Total Mastery', desc: 'Reach Rank 5 in all 5 abilities.', titleReward: 'Grandmaster', check: ctx => ctx.minRank >= 5 },

  // --- SKILLS & MILESTONES (6) ---
  { id: 'skill_first',     cat: 'Skills', name: 'New Craft', desc: 'Add your first trainable skill.', check: ctx => ctx.skillCount >= 1 },
  { id: 'skill_five',      cat: 'Skills', name: 'Multiskilled', desc: 'Track 5 or more skills simultaneously.', check: ctx => ctx.skillCount >= 5 },
  { id: 'skill_3star',     cat: 'Skills', name: 'Rising Specialist', desc: 'Reach 3.0 Stars / Moons in any skill.', check: ctx => ctx.maxSkillStars >= 3 },
  { id: 'skill_master',    cat: 'Skills', name: 'Full Mastery', desc: 'Max out any skill to 5.0 Stars / Full Moon.', titleReward: 'Craft Master', check: ctx => ctx.masteredSkills >= 1 },
  { id: 'skill_3master',   cat: 'Skills', name: 'Triple Threat', desc: 'Max out 3 different skills to 5.0.', titleReward: 'Virtuoso', check: ctx => ctx.masteredSkills >= 3 },
  { id: 'skill_milestone', cat: 'Skills', name: 'Chapter Complete', desc: 'Finish a Skill Milestone (e.g., full book or course).', check: ctx => ctx.milestonesDone >= 1 },

  // --- STREAKS, COMBOS & GOALPOSTS (8) ---
  { id: 'streak_3',    cat: 'Consistency', name: 'Three-Day Spark', desc: 'Maintain a 3-day task streak.', check: ctx => ctx.bestStreak >= 3 },
  { id: 'streak_7',    cat: 'Consistency', name: 'Full Week', desc: 'Maintain a 7-day task streak.', titleReward: 'Consistent', check: ctx => ctx.bestStreak >= 7 },
  { id: 'streak_14',   cat: 'Consistency', name: 'Fortnight Fire', desc: 'Maintain a 14-day task streak.', check: ctx => ctx.bestStreak >= 14 },
  { id: 'streak_30',   cat: 'Consistency', name: 'Iron Month', desc: 'Maintain a 30-day task streak.', titleReward: 'Iron Discipline', check: ctx => ctx.bestStreak >= 30 },
  { id: 'combo_first', cat: 'Consistency', name: 'Balanced Day', desc: 'Train 3+ different abilities in a single day.', check: ctx => ctx.balancedDays >= 1 },
  { id: 'combo_5',     cat: 'Consistency', name: 'Fivefold Harmony', desc: 'Trigger 5 Balanced Day combos.', titleReward: 'Harmonist', check: ctx => ctx.balancedDays >= 5 },
  { id: 'goalpost_1',  cat: 'Consistency', name: 'Quota Crusher', desc: 'Hit a Weekly Goalpost target.', check: ctx => ctx.goalpostsHit >= 1 },
  { id: 'goalpost_5',  cat: 'Consistency', name: 'Weekly Champion', desc: 'Hit 5 Weekly Goalpost targets.', titleReward: 'Quota Hunter', check: ctx => ctx.goalpostsHit >= 5 },

  // --- BOSSES & FOCUS TIMER (5) ---
  { id: 'boss_1',   cat: 'Combat & Focus', name: 'Boss Slayer', desc: 'Defeat your first Boss Fight before the deadline.', titleReward: 'Boss Slayer', check: ctx => ctx.bossesDefeated >= 1 },
  { id: 'boss_3',   cat: 'Combat & Focus', name: 'Giant Killer', desc: 'Defeat 3 Boss Fights.', check: ctx => ctx.bossesDefeated >= 3 },
  { id: 'boss_10',  cat: 'Combat & Focus', name: 'Raid Conqueror', desc: 'Defeat 10 Boss Fights.', titleReward: 'Conqueror', check: ctx => ctx.bossesDefeated >= 10 },
  { id: 'focus_1',  cat: 'Combat & Focus', name: 'Deep Dive', desc: 'Complete your first Focus Timer session.', check: ctx => ctx.focusSessions >= 1 },
  { id: 'focus_10', cat: 'Combat & Focus', name: 'Flow State', desc: 'Complete 10 Focus Timer sessions.', titleReward: 'Deep Diver', check: ctx => ctx.focusSessions >= 10 },

  // --- HEALTH CONNECT, RESILIENCE & META (8) ---
  { id: 'hc_sync',      cat: 'Health & Meta', name: 'Biometric Link', desc: 'Sync real data from Android Health Connect.', check: ctx => ctx.hcRealSynced },
  { id: 'hc_bmi_opt',   cat: 'Health & Meta', name: 'Optimal Vessel', desc: 'Hold an optimal scientific BMI (Rank 5 Fitness unlocked).', check: ctx => ctx.optimalBmi },
  { id: 'hc_workout',   cat: 'Health & Meta', name: 'Iron Synced', desc: 'Import a workout from Hevy / Health Connect.', check: ctx => ctx.hcWorkouts >= 1 },
  { id: 'hc_sleep',     cat: 'Health & Meta', name: 'Well-Rested', desc: 'Sync 7+ hours of sleep via Health Connect.', check: ctx => ctx.lastSleepHours >= 7 },
  { id: 'hc_steps',     cat: 'Health & Meta', name: '8K Strider', desc: 'Reach 8,000+ steps in a day via Health Connect.', check: ctx => ctx.todaySteps >= 8000 },
  { id: 'comeback',     cat: 'Health & Meta', name: 'Comeback Kid', desc: 'Recover with a Rank Up after experiencing a Rank Down.', titleReward: 'Resilient', check: ctx => ctx.comebackAchieved },
  { id: 'custom_photo', cat: 'Health & Meta', name: 'Face of the Hero', desc: 'Upload a custom portrait photo.', check: ctx => ctx.hasCustomPhoto },
  { id: 'backup_saved', cat: 'Health & Meta', name: 'Chronicle Keeper', desc: 'Save a backup via Email, Drive, or JSON.', check: ctx => ctx.hasBackup },
];

export function getBadgeUrl(id) {
  return `./assets/badges/${id}.png`;
}

export function getUnlockedTitles(state) {
  const unlocked = state.achievements?.unlocked || {};
  return ACHIEVEMENTS.filter(a => a.titleReward && unlocked[a.id]).map(a => ({
    id: a.id,
    title: a.titleReward,
    from: a.name,
  }));
}

export function evaluateAchievements(state) {
  if (!state.achievements) state.achievements = { unlocked: {} };
  if (!state.achievements.unlocked) state.achievements.unlocked = {};
  const stats = state.stats || {};

  const { ranks, fitCap } = getAbilityRankSnapshot(state);
  const lvl = getLevelInfo(state.totalXp, state.settings?.titleTrack || 'arcana');
  const taskLogs = (state.logs || []).filter(l => l.type === 'task');
  const skillMasteries = (state.skills || []).map(s => getSkillMastery(s.xp).stars);

  const ctx = {
    taskCount: taskLogs.length,
    level: lvl.level,
    totalXp: state.totalXp || 0,
    ranks,
    minRank: Math.min(...ABILITIES.map(a => ranks[a.id].rank)),
    skillCount: (state.skills || []).length,
    maxSkillStars: skillMasteries.length ? Math.max(...skillMasteries) : 0,
    masteredSkills: skillMasteries.filter(s => s >= 5).length,
    milestonesDone: stats.milestonesCompleted || 0,
    bestStreak: stats.bestStreak || 0,
    balancedDays: stats.balancedDays || 0,
    goalpostsHit: stats.goalpostsHit || 0,
    bossesDefeated: stats.bossesDefeated || 0,
    focusSessions: stats.focusSessions || 0,
    hcRealSynced: Boolean(state.healthConnect?.connected && !state.healthConnect?.isSimulated && state.healthConnect?.lastSyncAt),
    optimalBmi: Boolean(fitCap.bmi && fitCap.status === 'optimal'),
    hcWorkouts: (state.healthConnect?.syncedWorkoutIds || []).filter(id => !String(id).startsWith('sim_')).length,
    lastSleepHours: state.healthConnect?.lastSleepHours || 0,
    todaySteps: state.healthConnect?.todaySteps || 0,
    comebackAchieved: Boolean(stats.comebackAchieved),
    hasCustomPhoto: Boolean(state.profile?.avatarDataUrl),
    hasBackup: Boolean(state.settings?.backup?.lastBackupAt),
  };

  const newlyUnlocked = [];
  const now = new Date().toISOString();

  for (const ach of ACHIEVEMENTS) {
    if (state.achievements.unlocked[ach.id]) continue;
    try {
      if (ach.check(ctx)) {
        state.achievements.unlocked[ach.id] = now;
        newlyUnlocked.push(ach);
      }
    } catch {
      // ignore safe check errors
    }
  }

  if (newlyUnlocked.length > 0) saveState(state);
  return newlyUnlocked;
}
