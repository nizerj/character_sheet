export const ABILITIES = [
  {
    id: 'academics',
    label: 'Academics',
    short: 'ACA',
    defaultGraceDays: 7,
    decayPerDay: 12,
    decayName: 'Academic Rust',
    rankTitles: ['Slacker', 'Studious', 'Learned', 'Scholarly', 'Erudite'],
  },
  {
    id: 'culture',
    label: 'Culture',
    short: 'CUL',
    defaultGraceDays: 10,
    decayPerDay: 8,
    decayName: 'Cultural Stagnation',
    rankTitles: ['Uninitiated', 'Curious', 'Cultured', 'Refined', 'Connoisseur'],
  },
  {
    id: 'fitness',
    label: 'Fitness',
    short: 'FIT',
    defaultGraceDays: 6,
    decayPerDay: 15,
    decayName: 'Missed Training',
    rankTitles: ['Dormant', 'Active', 'Athletic', 'Formidable', 'Peak'],
  },
  {
    id: 'charisma',
    label: 'Charisma',
    short: 'CHA',
    defaultGraceDays: 12,
    decayPerDay: 10,
    decayName: 'Social Rust',
    rankTitles: ['Quiet', 'Approachable', 'Engaging', 'Magnetic', 'Iconic'],
  },
  {
    id: 'productivity',
    label: 'Productivity',
    short: 'PRD',
    defaultGraceDays: 4,
    decayPerDay: 12,
    decayName: 'Momentum Loss',
    rankTitles: ['Scattered', 'Focused', 'Driven', 'Relentless', 'Unstoppable'],
  },
];

// Persona-style Rank 1 -> Rank 5 (steep nonlinear curve; Rank 5 is genuinely hard!)
export const RANK_THRESHOLDS = [
  { rank: 1, minXp: 0,    baseScore: 0.20 },
  { rank: 2, minXp: 250,  baseScore: 0.40 },
  { rank: 3, minXp: 750,  baseScore: 0.60 },
  { rank: 4, minXp: 1650, baseScore: 0.80 },
  { rank: 5, minXp: 3200, baseScore: 1.00 },
];

export const DIFFICULTIES = [
  { id: 'trivial', label: 'Trivial', xp: 15,  tagClass: 'tag-diff-trivial', desc: '10–15 min quick win' },
  { id: 'easy',    label: 'Easy',    xp: 35,  tagClass: 'tag-diff-easy',    desc: 'Light effort / routine' },
  { id: 'medium',  label: 'Medium',  xp: 65,  tagClass: 'tag-diff-medium',  desc: '1h+ focused session' },
  { id: 'hard',    label: 'Hard',    xp: 115, tagClass: 'tag-diff-hard',    desc: 'Deep work, exam prep, hard workout' },
  { id: 'heroic',  label: 'Heroic',  xp: 190, tagClass: 'tag-diff-heroic',  desc: 'Major milestone, aced exam, shipped project' },
];

export const PENALTY_SEVERITIES = [
  { id: 'minor',    label: 'Minor (−25 XP)',     xp: 25  },
  { id: 'moderate', label: 'Moderate (−60 XP)',  xp: 60  },
  { id: 'major',    label: 'Major (−115 XP)',    xp: 115 },
  { id: 'critical', label: 'Critical (−200 XP)', xp: 200 },
];

export const WEEKDAYS = [
  { idx: 1, short: 'Mon' },
  { idx: 2, short: 'Tue' },
  { idx: 3, short: 'Wed' },
  { idx: 4, short: 'Thu' },
  { idx: 5, short: 'Fri' },
  { idx: 6, short: 'Sat' },
  { idx: 0, short: 'Sun' },
];

// Skill mastery: 0.0 to 5.0 (10 half-steps)
export const SKILL_STEP_THRESHOLDS = [
  0, 60, 150, 280, 450, 670, 950, 1290, 1700, 2180, 2750,
];

export const LEVEL_TITLES = [
  { minLevel: 1,  title: 'Fool' },
  { minLevel: 4,  title: 'Awakened' },
  { minLevel: 8,  title: 'Seeker' },
  { minLevel: 12, title: 'Wild Card' },
  { minLevel: 18, title: 'Vanguard' },
  { minLevel: 25, title: 'Architect' },
  { minLevel: 35, title: 'Sovereign' },
  { minLevel: 50, title: 'World' },
];

export const THEMES = [
  {
    id: 'p5-phantom',
    name: 'Phantom Red (P5)',
    desc: 'Iconic Persona 5 crimson red, jet black, sharp white & gold details.',
    swatches: ['#070709', '#ff1e38', '#ffffff', '#f5c542'],
  },
  {
    id: 'p5-velvet',
    name: 'Velvet Edge',
    desc: 'Obsidian blue-purple, silver slashes, gold ranks & crimson accents.',
    swatches: ['#0f0d24', '#7c6df7', '#e2e8f0', '#f5c542'],
  },
  {
    id: 'p3-reload',
    name: 'Midnight Hour (P3R)',
    desc: 'Deep midnight navy, electric cyan & crisp white Persona 3 diagonals.',
    swatches: ['#09172e', '#38bdf8', '#f8fafc', '#2dd4bf'],
  },
  {
    id: 'p4-gold',
    name: 'Midnight Channel (P4)',
    desc: 'High-contrast obsidian charcoal with iconic Persona electric yellow.',
    swatches: ['#141417', '#facc15', '#f4f4f5', '#f43f5e'],
  },
  {
    id: 'emerald-edge',
    name: 'Amazon Edge',
    desc: 'Deep emerald forest dark surfaces with amethyst & gold sharp trim.',
    swatches: ['#0b221a', '#34d399', '#a78bfa', '#f5c542'],
  },
];

export const DEFAULT_PIXEL_AVATAR = `
<svg viewBox="0 0 16 16" width="100%" height="100%" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
  <rect width="16" height="16" fill="#131428"/>
  <rect x="2" y="2" width="1" height="1" fill="#f5d061" opacity="0.85"/>
  <rect x="13" y="3" width="1" height="1" fill="#a5b4fc" opacity="0.85"/>
  <rect x="4" y="2" width="8" height="2" fill="#1e1b4b"/>
  <rect x="3" y="3" width="10" height="4" fill="#231f54"/>
  <rect x="4" y="2" width="6" height="1" fill="#4338ca"/>
  <rect x="5" y="5" width="6" height="5" fill="#f3c6a5"/>
  <rect x="6" y="10" width="4" height="1" fill="#e2ae88"/>
  <rect x="5" y="4" width="6" height="1" fill="#1e1b4b"/>
  <rect x="5" y="5" width="2" height="1" fill="#1e1b4b"/>
  <rect x="10" y="5" width="1" height="1" fill="#1e1b4b"/>
  <rect x="6" y="7" width="1" height="1" fill="#0f172a"/>
  <rect x="9" y="7" width="1" height="1" fill="#0f172a"/>
  <rect x="7" y="9" width="2" height="1" fill="#c48b6c"/>
  <rect x="2" y="12" width="12" height="4" fill="#2e2968"/>
  <rect x="3" y="11" width="10" height="5" fill="#3b3582"/>
  <rect x="4" y="11" width="1" height="5" fill="#e2e8f0"/>
  <rect x="11" y="11" width="1" height="5" fill="#e2e8f0"/>
  <rect x="7" y="11" width="2" height="2" fill="#f5c542"/>
  <rect x="7" y="13" width="2" height="3" fill="#1e1b4b"/>
</svg>
`;

// Scientific BMI Gate for Fitness Max Rank (Rank 1–5)
export function evaluateFitnessCap(heightCm, weightKg) {
  const h = Number(heightCm) / 100;
  const w = Number(weightKg);
  if (!h || h <= 0.5 || !w || w <= 20) {
    return { bmi: null, maxRank: 5, status: 'optimal', label: 'Set height & weight to calibrate', rangeKg: null };
  }
  const bmi = w / (h * h);
  const minHealthyKg = (18.5 * h * h).toFixed(1);
  const maxHealthyKg = (24.9 * h * h).toFixed(1);
  const rangeKg = `${minHealthyKg}–${maxHealthyKg} kg`;

  if (bmi >= 18.5 && bmi <= 24.9) {
    return { bmi, maxRank: 5, status: 'optimal', label: 'Optimal Healthy BMI — Rank 5 Unlocked', rangeKg };
  }
  if ((bmi >= 17.5 && bmi < 18.5) || (bmi > 24.9 && bmi <= 27.4)) {
    return { bmi, maxRank: 4, status: 'capped', label: 'Slightly outside healthy BMI — Capped at Rank 4', rangeKg };
  }
  if ((bmi >= 16.5 && bmi < 17.5) || (bmi > 27.4 && bmi <= 29.9)) {
    return { bmi, maxRank: 3, status: 'capped', label: 'Outside healthy BMI — Capped at Rank 3', rangeKg };
  }
  return { bmi, maxRank: 2, status: 'capped', label: 'Far outside healthy BMI — Capped at Rank 2', rangeKg };
}

export function getPersonaRankForXp(abilityId, xp, maxRankOverride = null) {
  const ab = ABILITIES.find(a => a.id === abilityId);
  let idx = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (xp >= RANK_THRESHOLDS[i].minXp) idx = i;
  }
  const rawRank = RANK_THRESHOLDS[idx].rank;
  let capped = false;
  if (maxRankOverride && rawRank > maxRankOverride) {
    idx = Math.max(0, maxRankOverride - 1);
    capped = true;
  }

  const current = RANK_THRESHOLDS[idx];
  const next = RANK_THRESHOLDS[Math.min(idx + 1, RANK_THRESHOLDS.length - 1)];

  let score = current.baseScore;
  if (!capped && next.minXp > current.minXp) {
    const prog = Math.min(1, Math.max(0, (xp - current.minXp) / (next.minXp - current.minXp)));
    score = current.baseScore + prog * (next.baseScore - current.baseScore);
  }

  return {
    rank: current.rank,
    rawRank,
    capped,
    title: ab?.rankTitles[current.rank - 1] || `Rank ${current.rank}`,
    score,
    nextRank: next.rank,
    nextMinXp: next.minXp,
    isMax: current.rank === 5,
  };
}

export function getSkillMastery(xp) {
  let step = 0;
  for (let i = 0; i < SKILL_STEP_THRESHOLDS.length; i++) {
    if (xp >= SKILL_STEP_THRESHOLDS[i]) step = i;
  }
  return {
    stars: step / 2,
    step,
    nextXp: SKILL_STEP_THRESHOLDS[Math.min(step + 1, SKILL_STEP_THRESHOLDS.length - 1)],
    maxed: step >= 10,
  };
}

export function xpNeededForLevel(level) {
  return Math.round(160 * Math.pow(level, 1.4));
}

export function getLevelInfo(totalXp) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (true) {
    const needed = xpNeededForLevel(level);
    if (remaining >= needed) {
      remaining -= needed;
      level++;
    } else {
      const titleEntry = [...LEVEL_TITLES].reverse().find(t => level >= t.minLevel) || LEVEL_TITLES[0];
      return {
        level,
        currentXp: remaining,
        neededXp: needed,
        pct: Math.min(100, (remaining / needed) * 100),
        title: titleEntry.title,
      };
    }
  }
}
