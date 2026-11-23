import { ABILITIES } from './constants.js';
import { todayKey, addDaysKey, getWeekStartKey, isoToLocalDayKey } from './state.js';

// =========================================================================
// 1. ACTIVITY HEATMAP (LAST 16 WEEKS / 112 DAYS)
// =========================================================================
export function renderActivityHeatmap(container, state) {
  const counts = {};
  const xpByDay = {};
  for (const log of state.logs || []) {
    if (log.type !== 'task' || !log.timestamp) continue;
    const day = isoToLocalDayKey(log.timestamp);
    counts[day] = (counts[day] || 0) + 1;
    xpByDay[day] = (xpByDay[day] || 0) + (log.baseXp || 0);
  }

  const today = todayKey();
  const totalDays = 112; // 16 columns x 7 rows
  const cells = [];

  for (let i = totalDays - 1; i >= 0; i--) {
    const key = addDaysKey(today, -i);
    const c = counts[key] || 0;
    const xp = xpByDay[key] || 0;
    const level = c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : c <= 5 ? 3 : 4;
    cells.push(`<div class="hm-cell hm-l${level}" title="${key}: ${c} task(s) · +${xp} XP"></div>`);
  }

  container.innerHTML = `
    <div class="heatmap-grid">${cells.join('')}</div>
    <div class="heatmap-legend">
      <span>16 weeks ago</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <span>Less</span>
        <span class="hm-cell hm-l0"></span>
        <span class="hm-cell hm-l1"></span>
        <span class="hm-cell hm-l2"></span>
        <span class="hm-cell hm-l3"></span>
        <span class="hm-cell hm-l4"></span>
        <span>More</span>
      </div>
      <span>Today</span>
    </div>
  `;
}

// =========================================================================
// 2. LAST 14 DAYS XP BAR CHART (SVG)
// =========================================================================
export function renderXpBarChart(container, state) {
  const today = todayKey();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = addDaysKey(today, -i);
    let xp = 0;
    for (const log of state.logs || []) {
      if (log.type === 'task' && isoToLocalDayKey(log.timestamp) === key) {
        xp += log.baseXp || 0;
      }
    }
    days.push({ key, label: key.slice(8), xp });
  }

  const maxXp = Math.max(100, ...days.map(d => d.xp));
  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue('--accent-primary').trim() || '#7c6df7';
  const gold = styles.getPropertyValue('--accent-gold').trim() || '#f5c542';
  const muted = styles.getPropertyValue('--text-muted').trim() || '#94a3b8';

  const w = 440;
  const h = 150;
  const barW = 20;
  const gap = 10;

  const bars = days
    .map((d, idx) => {
      const x = 14 + idx * (barW + gap);
      const bh = Math.max(3, Math.round((d.xp / maxXp) * 104));
      const y = 122 - bh;
      const color = d.key === today ? gold : primary;
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barW}" height="${bh}" fill="${d.xp > 0 ? color : 'rgba(255,255,255,0.08)'}">
            <title>${d.key}: +${d.xp} XP</title>
          </rect>
          <text x="${x + barW / 2}" y="139" text-anchor="middle" fill="${muted}" font-size="9" font-family="monospace">${d.label}</text>
        </g>
      `;
    })
    .join('');

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <line x1="10" y1="122" x2="${w - 10}" y2="122" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>
      ${bars}
    </svg>
  `;
}

// =========================================================================
// 3. BODY COMPOSITION TREND CHART (WEIGHT & BODY FAT %)
// =========================================================================
export function renderBodyTrendChart(container, state) {
  const hist = (state.bodyHistory || []).slice(-20);
  if (hist.length < 2) {
    container.innerHTML = `<div class="empty-state">Log weight updates or sync Health Connect across multiple days to unlock your Weight &amp; Body Fat trend chart.</div>`;
    return;
  }

  const styles = getComputedStyle(document.documentElement);
  const gold = styles.getPropertyValue('--accent-gold').trim() || '#f5c542';
  const emerald = styles.getPropertyValue('--accent-emerald').trim() || '#34d399';
  const muted = styles.getPropertyValue('--text-muted').trim() || '#94a3b8';

  const weights = hist.map(p => p.weightKg).filter(Boolean);
  const minW = Math.min(...weights) - 1;
  const maxW = Math.max(...weights) + 1;
  const w = 440;
  const h = 155;

  const pts = hist
    .map((p, i) => {
      const x = 32 + (i / Math.max(1, hist.length - 1)) * (w - 56);
      const y = 122 - ((p.weightKg - minW) / Math.max(0.5, maxW - minW)) * 96;
      return { x, y, ...p };
    });

  const linePts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = pts
    .map(
      p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${gold}">
        <title>${p.date}: ${p.weightKg} kg${p.bodyFatPct ? ` · BF ${p.bodyFatPct}%` : ''}</title>
      </circle>`
    )
    .join('');

  // Optional body fat overlay
  const bfPts = hist
    .map((p, i) => {
      if (!p.bodyFatPct) return null;
      const x = 32 + (i / Math.max(1, hist.length - 1)) * (w - 56);
      const y = 122 - ((p.bodyFatPct - 5) / 35) * 96;
      return `${x.toFixed(1)},${Math.max(14, Math.min(122, y)).toFixed(1)}`;
    })
    .filter(Boolean);

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <line x1="28" y1="122" x2="${w - 16}" y2="122" stroke="rgba(255,255,255,0.14)"/>
      <text x="6" y="26" fill="${muted}" font-size="9" font-family="monospace">${maxW.toFixed(0)}k</text>
      <text x="6" y="122" fill="${muted}" font-size="9" font-family="monospace">${minW.toFixed(0)}k</text>
      <polyline points="${linePts}" fill="none" stroke="${gold}" stroke-width="2.4"/>
      ${bfPts.length >= 2 ? `<polyline points="${bfPts.join(' ')}" fill="none" stroke="${emerald}" stroke-width="1.8" stroke-dasharray="4 3"/>` : ''}
      ${dots}
      <text x="32" y="144" fill="${gold}" font-size="10" font-family="monospace">● Weight (kg)</text>
      ${bfPts.length >= 2 ? `<text x="140" y="144" fill="${emerald}" font-size="10" font-family="monospace">--- Body Fat %</text>` : ''}
    </svg>
  `;
}

// =========================================================================
// 4. WEEKLY REVIEW / END-OF-WEEK REPORT CARD
// =========================================================================
export function buildWeeklyReport(state, usePreviousWeek = false) {
  const curStart = getWeekStartKey();
  const startKey = usePreviousWeek ? addDaysKey(curStart, -7) : curStart;
  const endKey = addDaysKey(startKey, 6);

  let gainedXp = 0;
  let lostXp = 0;
  let tasksDone = 0;
  let penaltiesCount = 0;
  const abXp = { academics: 0, culture: 0, fitness: 0, charisma: 0, productivity: 0 };

  for (const log of state.logs || []) {
    const day = isoToLocalDayKey(log.timestamp);
    if (!day || day < startKey || day > endKey) continue;
    if (log.type === 'task') {
      tasksDone++;
      gainedXp += log.baseXp || 0;
      if (log.abilityDeltas) {
        for (const [k, v] of Object.entries(log.abilityDeltas)) {
          if (abXp[k] !== undefined) abXp[k] += v;
        }
      } else {
        (log.abilities || []).forEach(k => {
          if (abXp[k] !== undefined) abXp[k] += Math.round((log.baseXp || 0) / Math.max(1, log.abilities.length));
        });
      }
    } else if (log.type === 'penalty') {
      penaltiesCount++;
      lostXp += Math.abs(log.xpDelta || 0);
    }
  }

  const goalposts = (state.tasks || []).filter(t => t.recurrence === 'goalpost');
  const goalpostsHit = goalposts.filter(t => {
    const count = (t.completions || []).filter(d => d >= startKey && d <= endKey).length;
    return count >= (t.weeklyTarget || 3);
  }).length;

  const sortedAbs = ABILITIES.map(a => ({ label: a.label, xp: abXp[a.id] || 0 })).sort((a, b) => b.xp - a.xp);
  const strongest = sortedAbs[0];
  const neglected = sortedAbs[sortedAbs.length - 1];

  // Weekly Grade S / A / B / C / D
  const net = gainedXp - lostXp;
  let grade = 'D';
  if (net >= 900 && penaltiesCount === 0) grade = 'S';
  else if (net >= 550) grade = 'A';
  else if (net >= 280) grade = 'B';
  else if (net >= 100) grade = 'C';

  return {
    rangeLabel: `${startKey.slice(5)} → ${endKey.slice(5)}`,
    gainedXp,
    lostXp,
    netXp: net,
    tasksDone,
    penaltiesCount,
    goalpostsHit,
    goalpostsTotal: goalposts.length,
    strongest,
    neglected,
    grade,
  };
}
