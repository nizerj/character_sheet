import { ABILITIES, evaluatePhysiqueTitle, getLevelInfo, getSkillMastery } from './constants.js';
import { getAbilityRankSnapshot, getAverageRank, getEffectiveStreak, todayKey } from './state.js';
import { ACHIEVEMENTS, getBadgeUrl } from './achievements.js';

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function exportCharacterCardPng(state) {
  const W = 1080;
  const H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const styles = getComputedStyle(document.documentElement);
  const bgSolid = styles.getPropertyValue('--bg-solid').trim() || '#080914';
  const cardBg = styles.getPropertyValue('--bg-card').trim() || '#111226';
  const primary = styles.getPropertyValue('--accent-primary').trim() || '#7c6df7';
  const gold = styles.getPropertyValue('--accent-gold').trim() || '#f5c542';
  const radarStroke = styles.getPropertyValue('--radar-stroke').trim() || '#a5b4fc';
  const textBright = styles.getPropertyValue('--text-bright').trim() || '#ffffff';
  const textMuted = styles.getPropertyValue('--text-muted').trim() || '#94a3b8';

  // Background
  ctx.fillStyle = bgSolid;
  ctx.fillRect(0, 0, W, H);

  // Diagonal slash accent
  ctx.save();
  ctx.fillStyle = primary;
  ctx.globalAlpha = 0.16;
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 0);
  ctx.lineTo(W * 0.88, 0);
  ctx.lineTo(W * 0.56, H);
  ctx.lineTo(W * 0.30, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Outer frame
  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, W - 36, H - 36);

  // Left card panel
  ctx.fillStyle = cardBg;
  ctx.fillRect(42, 42, 340, H - 84);
  ctx.fillStyle = gold;
  ctx.fillRect(42, 42, 6, H - 84);

  const lvl = getLevelInfo(state.totalXp, state.settings?.titleTrack || 'arcana');
  const { ranks, fitCap } = getAbilityRankSnapshot(state);
  const avgRank = getAverageRank(state);
  const streak = getEffectiveStreak(state);

  // Portrait
  const portraitX = 68;
  const portraitY = 68;
  const portraitSize = 112;
  ctx.fillStyle = '#070711';
  ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
  const avatarImg = await loadImage(state.profile.avatarDataUrl || './assets/icon-192.png');
  if (avatarImg) {
    ctx.drawImage(avatarImg, portraitX, portraitY, portraitSize, portraitSize);
  }
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(portraitX, portraitY, portraitSize, portraitSize);

  // Name, Level, Title
  ctx.fillStyle = textBright;
  ctx.font = 'italic 900 26px Inter, Segoe UI, sans-serif';
  ctx.fillText((state.profile.name || 'Player').slice(0, 14), 196, 102);

  ctx.fillStyle = primary;
  ctx.font = '800 15px Inter, Segoe UI, sans-serif';
  ctx.fillText((state.profile.customClass || lvl.title).toUpperCase().slice(0, 18), 196, 128);

  // Level Pill
  ctx.fillStyle = gold;
  ctx.fillRect(196, 144, 78, 28);
  ctx.fillStyle = '#070711';
  ctx.font = '900 15px monospace';
  ctx.fillText(`LV.${lvl.level}`, 212, 163);

  ctx.fillStyle = textMuted;
  ctx.font = '700 13px monospace';
  ctx.fillText(`AVG R${avgRank}/5`, 284, 163);

  // Vitals & Stats
  let y = 218;
  const vitals = [
    `AGE: ${state.profile.age || '—'}   HT: ${state.profile.heightCm ? state.profile.heightCm + 'cm' : '—'}   WT: ${state.profile.weightKg ? state.profile.weightKg + 'kg' : '—'}`,
    `STREAK: ${streak}d   GOLD: ${state.gold || 0} G`,
    `TOTAL XP: ${(state.totalXp || 0).toLocaleString()} XP`,
  ];
  ctx.font = '700 13px monospace';
  vitals.forEach(line => {
    ctx.fillStyle = textBright;
    ctx.fillText(line, 68, y);
    y += 26;
  });

  // BMI + Physique Title (only if HC body data active)
  const hcBody = Boolean(
    state.healthConnect?.connected &&
    (state.healthConnect?.hasRealBodyData || state.healthConnect?.isSimulated) &&
    Number(state.healthConnect?.bodyFatPct) >= 4
  );
  const phys = hcBody
    ? evaluatePhysiqueTitle(state.profile.heightCm, state.profile.weightKg, state.healthConnect.bodyFatPct, state.healthConnect.leanMassKg)
    : null;
  if (fitCap.bmi) {
    ctx.fillStyle = '#34d399';
    ctx.fillText(`BMI ${fitCap.bmi.toFixed(1)} · MAX FIT: R${fitCap.maxRank}${phys ? ` · ${phys.title.toUpperCase()}` : ''}`, 68, y);
    y += 28;
  }

  // Goal
  ctx.fillStyle = gold;
  ctx.font = '800 11px monospace';
  ctx.fillText('MAIN GOAL', 68, y + 6);
  ctx.fillStyle = textMuted;
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText((state.profile.goal || 'Level up every day.').slice(0, 38), 68, y + 26);

  // Unlocked Trophy Badges (up to 6)
  const unlockedIds = Object.keys(state.achievements?.unlocked || {});
  ctx.fillStyle = gold;
  ctx.font = '800 11px monospace';
  ctx.fillText(`TROPHIES (${unlockedIds.length}/${ACHIEVEMENTS.length})`, 68, 495);

  const topBadges = unlockedIds.slice(-6);
  for (let i = 0; i < topBadges.length; i++) {
    const bImg = await loadImage(getBadgeUrl(topBadges[i]));
    if (bImg) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bImg, 68 + i * 48, 510, 42, 42);
      ctx.imageSmoothingEnabled = true;
    }
  }

  // Right Panel: 5-Axis Radar Chart
  ctx.fillStyle = cardBg;
  ctx.fillRect(406, 42, 632, 360);
  ctx.fillStyle = primary;
  ctx.fillRect(406, 42, 6, 360);

  ctx.fillStyle = textBright;
  ctx.font = 'italic 900 16px Inter, sans-serif';
  ctx.fillText('// SOCIAL STATS · RANK 1 → 5', 432, 76);

  const cx = 720;
  const cy = 236;
  const r = 112;
  const angles = ABILITIES.map((_, i) => ((-90 + i * 72) * Math.PI) / 180);

  // Grid pentagons
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.2;
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(s => {
    ctx.beginPath();
    angles.forEach((a, i) => {
      const px = cx + r * s * Math.cos(a);
      const py = cy + r * s * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();
  });

  // Stat Polygon
  ctx.beginPath();
  const vPts = ABILITIES.map((ab, i) => {
    const sc = Math.max(0.18, Math.min(1, ranks[ab.id]?.score ?? 0.2));
    return { x: cx + r * sc * Math.cos(angles[i]), y: cy + r * sc * Math.sin(angles[i]), ab, rank: ranks[ab.id].rank };
  });
  vPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(124, 109, 247, 0.34)';
  ctx.fill();
  ctx.strokeStyle = radarStroke;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Labels & vertices
  vPts.forEach((p, i) => {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();

    const lx = cx + (r + 36) * Math.cos(angles[i]);
    const ly = cy + (r + 28) * Math.sin(angles[i]);
    ctx.fillStyle = textBright;
    ctx.font = '900 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.ab.label.toUpperCase()} [R${p.rank}]`, lx, ly);
  });
  ctx.textAlign = 'left';

  // Bottom Right Panel: Top Skills
  ctx.fillStyle = cardBg;
  ctx.fillRect(406, 422, 632, 176);
  ctx.fillStyle = textBright;
  ctx.fillRect(406, 422, 6, 176);

  ctx.fillStyle = textBright;
  ctx.font = 'italic 900 15px Inter, sans-serif';
  ctx.fillText('// TOP SKILLS', 432, 454);

  const topSkills = [...(state.skills || [])].sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 4);
  if (topSkills.length === 0) {
    ctx.fillStyle = textMuted;
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText('No skills added yet.', 432, 495);
  } else {
    topSkills.forEach((sk, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = 432 + col * 295;
      const by = 482 + row * 52;
      const m = getSkillMastery(sk.xp || 0);
      ctx.fillStyle = textBright;
      ctx.font = '800 14px Inter, sans-serif';
      ctx.fillText(sk.name.slice(0, 18), bx, by);
      ctx.fillStyle = gold;
      ctx.font = '800 13px monospace';
      ctx.fillText(`★ ${m.stars.toFixed(1)}/5  (${sk.xp || 0} XP)`, bx, by + 20);
    });
  }

  // Footer date stamp
  ctx.fillStyle = textMuted;
  ctx.font = '700 11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`SNAPSHOT · ${todayKey()}`, W - 44, H - 30);

  // Trigger download (or Web Share on Android if supported!)
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  const filename = `character-card-${todayKey()}.png`;

  if (navigator.canShare && blob) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: `${state.profile.name || 'My'} Character Card`, files: [file] });
        return filename;
      } catch {
        // User cancelled or fallback to download
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}
