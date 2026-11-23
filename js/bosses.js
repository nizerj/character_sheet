import { saveState, todayKey, diffDaysKeys, logPenalty, applyXpGain } from './state.js';

export const BOSS_TIERS = [
  { id: 'mini', label: 'Mini-Boss (300 HP · +250 XP)', hp: 300, rewardXp: 250, penaltyXp: 80 },
  { id: 'boss', label: 'Boss (600 HP · +450 XP)',      hp: 600, rewardXp: 450, penaltyXp: 140 },
  { id: 'raid', label: 'Raid Boss (1200 HP · +800 XP)', hp: 1200, rewardXp: 800, penaltyXp: 220 },
];

export function createBoss(state, { title, tierId, deadline, abilityId, skillId = '', steps = [] }) {
  if (!Array.isArray(state.bosses)) state.bosses = [];
  const tier = BOSS_TIERS.find(t => t.id === tierId) || BOSS_TIERS[1];
  const boss = {
    id: 'boss_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: title.trim(),
    tier: tier.id,
    maxHp: tier.hp,
    hp: tier.hp,
    rewardXp: tier.rewardXp,
    penaltyXp: tier.penaltyXp,
    deadline: deadline || todayKey(),
    abilityId: abilityId || 'academics',
    skillId: skillId || '',
    steps: steps
      .map(s => s.trim())
      .filter(Boolean)
      .map((label, i) => ({ id: `st_${i}_${Date.now()}`, label, done: false })),
    status: 'active', // active | defeated | failed
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  state.bosses.unshift(boss);
  saveState(state);
  return boss;
}

export function damageBoss(state, bossId, amount, reason = 'Direct Strike') {
  const boss = (state.bosses || []).find(b => b.id === bossId && b.status === 'active');
  if (!boss) return null;

  const dmg = Math.max(10, Math.round(amount));
  boss.hp = Math.max(0, boss.hp - dmg);
  let defeated = false;
  let rewardXp = 0;
  let xpResult = null;

  if (boss.hp === 0) {
    boss.status = 'defeated';
    boss.resolvedAt = new Date().toISOString();
    defeated = true;

    if (!state.stats) state.stats = {};
    state.stats.bossesDefeated = (state.stats.bossesDefeated || 0) + 1;

    // Route Boss Victory XP through applyXpGain (handles Level Up, Rank Up, Streak, Combo & Sleep Buff!)
    const mult = boss.rewardXp / 190; // relative to heroic base (190 XP)
    xpResult = applyXpGain(state, {
      title: `⚔️ BOSS DEFEATED: ${boss.title}`,
      difficultyId: 'heroic',
      abilityIds: [boss.abilityId],
      skillIds: boss.skillId ? [boss.skillId] : [],
      multiplier: mult,
    });
    rewardXp = xpResult.gainedTotalXp;
  }

  saveState(state);
  return { boss, dmg, defeated, rewardXp, reason, xpResult };
}

export function toggleBossStep(state, bossId, stepId) {
  const boss = (state.bosses || []).find(b => b.id === bossId && b.status === 'active');
  if (!boss) return null;
  const step = (boss.steps || []).find(s => s.id === stepId);
  if (!step || step.done) return null;
  step.done = true;

  // Each checklist step deals proportional damage (at least 60 HP)
  const perStep = Math.max(60, Math.round(boss.maxHp / Math.max(1, boss.steps.length)));
  return damageBoss(state, bossId, perStep, step.label);
}

// Auto-damage active bosses matching an ability or skill when any task is completed!
export function applyTaskDamageToMatchingBosses(state, abilityIds, skillIds, xpGained) {
  const hits = [];
  const active = (state.bosses || []).filter(b => b.status === 'active');
  for (const boss of active) {
    const abMatch = (abilityIds || []).includes(boss.abilityId);
    const skMatch = boss.skillId && (skillIds || []).includes(boss.skillId);
    if (abMatch || skMatch) {
      const dmg = Math.max(25, Math.round(xpGained * (skMatch ? 1.5 : 1.0)));
      const res = damageBoss(state, boss.id, dmg, 'Task Strike');
      if (res) hits.push(res);
    }
  }
  return hits;
}

export function checkExpiredBosses(state) {
  const today = todayKey();
  const failed = [];
  for (const boss of state.bosses || []) {
    if (boss.status !== 'active') continue;
    if (boss.deadline && diffDaysKeys(boss.deadline, today) > 0) {
      boss.status = 'failed';
      boss.resolvedAt = new Date().toISOString();
      const res = logPenalty(state, {
        title: `💀 BOSS FAILED: ${boss.title} (Missed Deadline)`,
        severityId: 'major',
        abilityIds: [boss.abilityId],
        skillIds: boss.skillId ? [boss.skillId] : [],
        auto: true,
        customXp: boss.penaltyXp,
      });
      failed.push({ boss, penaltyXp: boss.penaltyXp, rankDowns: res.rankDowns });
    }
  }
  if (failed.length > 0) saveState(state);
  return failed;
}

export function deleteBoss(state, bossId) {
  state.bosses = (state.bosses || []).filter(b => b.id !== bossId);
  saveState(state);
}

export function daysLeftLabel(deadline) {
  const diff = diffDaysKeys(todayKey(), deadline);
  if (diff < 0) return `Overdue ${Math.abs(diff)}d`;
  if (diff === 0) return 'DUE TODAY';
  if (diff === 1) return '1 day left';
  return `${diff} days left`;
}
