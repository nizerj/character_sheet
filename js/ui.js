import {
  ABILITIES,
  DIFFICULTIES,
  DEFAULT_PIXEL_AVATAR,
  evaluatePhysiqueTitle,
  getAbilityIconUrl,
  getLevelInfo,
  getSkillMastery,
} from './constants.js';
import {
  getAbilityRankSnapshot,
  getAverageRank,
  getTaskStatus,
  daysSince,
  getEffectiveStreak,
  isSafeRoomActive,
  safeRoomDaysLeft,
  isWellRestedToday,
  isFatiguedToday,
  getTodayTrainedAbilities,
  todayKey,
} from './state.js';
import { renderRadarChart } from './radar.js';
import { ACHIEVEMENTS, getBadgeUrl, getUnlockedTitles } from './achievements.js';
import { daysLeftLabel } from './bosses.js';
import { ensureShopState } from './shop.js';
import { generateDailyBounties } from './bounties.js';
import {
  renderActivityHeatmap,
  renderXpBarChart,
  renderBodyTrendChart,
  buildWeeklyReport,
} from './analytics.js';

export function applyVisualSettings(settings) {
  const root = document.documentElement;
  root.setAttribute('data-theme', settings.theme || 'p5-velvet');

  const { primary, gold, radar } = settings.customColors || {};
  if (primary) {
    root.style.setProperty('--accent-primary', primary);
    root.style.setProperty('--accent-primary-dim', hexToRgba(primary, 0.18));
  } else {
    root.style.removeProperty('--accent-primary');
    root.style.removeProperty('--accent-primary-dim');
  }

  if (gold) {
    root.style.setProperty('--accent-gold', gold);
    root.style.setProperty('--accent-gold-dim', hexToRgba(gold, 0.16));
  } else {
    root.style.removeProperty('--accent-gold');
    root.style.removeProperty('--accent-gold-dim');
  }

  if (radar) {
    root.style.setProperty('--radar-stroke', radar);
    root.style.setProperty('--radar-fill', hexToRgba(radar, 0.28));
  } else {
    root.style.removeProperty('--radar-stroke');
    root.style.removeProperty('--radar-fill');
  }
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(124, 109, 247, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function showToast(message, type = 'normal') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type === 'danger' ? 'danger' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all 0.22s ease';
    setTimeout(() => el.remove(), 240);
  }, 4000);
}

function renderMoonGlyphs(stars) {
  const full = Math.floor(stars);
  const hasHalf = stars - full >= 0.5;
  let html = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      const isLead = i === full - 1 && !hasHalf;
      const fill = isLead ? 'var(--accent-gold)' : 'var(--accent-silver)';
      html += `<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="${fill}"/></svg>`;
    } else if (i === full && hasHalf) {
      html += `<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" fill="var(--bg-card)" stroke="var(--accent-silver)" stroke-width="1.2"/>
        <path d="M10 2.5 A7.5 7.5 0 0 0 10 17.5 Z" fill="var(--accent-gold)"/>
      </svg>`;
    } else {
      html += `<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.5" fill="none" stroke="#475569" stroke-width="1.3"/>
      </svg>`;
    }
  }
  return html;
}

function renderStarGlyphs(stars) {
  const full = Math.floor(stars);
  const hasHalf = stars - full >= 0.5;
  let html = '';
  for (let i = 0; i < 5; i++) {
    if (i < full) html += `<span class="star-glyph full">★</span>`;
    else if (i === full && hasHalf) html += `<span class="star-glyph half">★</span>`;
    else html += `<span class="star-glyph empty">★</span>`;
  }
  return html;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatRelDate(iso) {
  const d = daysSince(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

function renderTaskCard(task, state) {
  const st = getTaskStatus(task);
  const diff = DIFFICULTIES.find(d => d.id === task.difficulty) || DIFFICULTIES[2];
  const isDone = task.recurrence === 'one_time' ? st.completedOneTime : st.doneToday;
  const xpPreview =
    task.recurrence === 'goalpost'
      ? st.weeklyCount + 1 === st.weeklyTarget
        ? `+${Math.round(diff.xp * 1.6)} XP ★`
        : `+${Math.round(diff.xp * 0.6)} XP`
      : `+${diff.xp} XP`;

  const abTags = (task.abilities || [])
    .map(id => `<span class="tag tag-stat">+${ABILITIES.find(a => a.id === id)?.short || id}</span>`)
    .join('');

  const skTags = (task.skillIds || [])
    .map(id => {
      const sk = state.skills.find(s => s.id === id);
      return sk ? `<span class="tag tag-skill">+${escapeHtml(sk.name)}</span>` : '';
    })
    .join('');

  let goalpostHtml = '';
  if (task.recurrence === 'goalpost') {
    const pips = [];
    for (let i = 0; i < st.weeklyTarget; i++) {
      const cls = i < st.weeklyCount ? (st.goalpostReached ? 'pip bonus' : 'pip filled') : 'pip';
      pips.push(`<span class="${cls}"></span>`);
    }
    goalpostHtml = `
      <div class="goalpost-row">
        <div class="pips">${pips.join('')}</div>
        <span class="goalpost-label" style="${st.goalpostReached ? 'color:var(--accent-gold);' : ''}">
          ${st.weeklyCount}/${st.weeklyTarget} this week ${st.goalpostReached ? '★ BONUS EARNED' : `(Quota bonus +${diff.xp} XP)`}
        </span>
      </div>
    `;
  }

  const statusTagClass = st.overdueDays > 0 ? 'tag-overdue' : 'tag-due';
  const cardExtraClass = `${isDone ? 'done' : ''} ${st.goalpostReached ? 'goalpost-hit' : ''} ${task.pinned ? 'pinned' : ''}`;

  return `
    <div class="task-card ${cardExtraClass}">
      <button class="task-check-btn ${isDone ? 'checked' : ''}" data-complete-task="${task.id}" ${isDone ? 'disabled' : ''} title="${isDone ? 'Completed' : 'Check off & earn XP'}">
        ${isDone ? '✓' : ''}
      </button>
      <div class="task-body">
        <div class="task-top">
          <div class="task-title">${task.pinned ? '<span style="color:var(--accent-gold);margin-right:4px;">★</span>' : ''}${escapeHtml(task.title)}</div>
          <div class="task-mini-actions">
            <span class="task-xp" style="margin-right:4px;">${xpPreview}</span>
            <button class="task-icon-btn ${task.pinned ? 'pinned-active' : ''}" data-pin-task="${task.id}" title="${task.pinned ? 'Unpin' : 'Pin Top Priority (max 3)'}">📌</button>
            <button class="task-icon-btn" data-edit-task="${task.id}" title="Edit task">✎</button>
            <button class="task-icon-btn" data-move-task="${task.id}|-1" title="Move up">▲</button>
            <button class="task-icon-btn" data-move-task="${task.id}|1" title="Move down">▼</button>
            <button class="skill-del" data-delete-task="${task.id}" title="Delete task">✕</button>
          </div>
        </div>
        <div class="task-meta">
          <span class="tag ${diff.tagClass}">${diff.label}</span>
          <span class="tag tag-rec">${st.scheduleBadge}</span>
          <span class="tag ${statusTagClass}">${st.statusBadge}</span>
          ${abTags}${skTags}
        </div>
        ${goalpostHtml}
      </div>
    </div>
  `;
}

export function renderApp(state, activeTrackerTab = 'today') {
  applyVisualSettings(state.settings);

  // Persona Calendar Corner
  const now = new Date();
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  document.getElementById('cal-date').textContent = `${now.getMonth() + 1}/${now.getDate()}`;
  document.getElementById('cal-day').textContent = dayNames[now.getDay()];

  const lvl = getLevelInfo(state.totalXp, state.settings.titleTrack || 'arcana');
  const { ranks, fitCap } = getAbilityRankSnapshot(state);
  const avgRank = getAverageRank(state);

  // Level HUD & Gold
  document.getElementById('hud-level').textContent = `LV.${lvl.level}`;
  document.getElementById('hud-title').textContent = state.profile.customClass || lvl.title;
  document.getElementById('hud-xp-text').textContent = `${lvl.currentXp.toLocaleString()} / ${lvl.neededXp.toLocaleString()} XP`;
  document.getElementById('hud-xp-fill').style.width = `${lvl.pct.toFixed(1)}%`;
  const goldEl = document.getElementById('hud-gold');
  if (goldEl) goldEl.textContent = `${Math.round(state.gold || 0).toLocaleString()} G`;

  // Safe Room Banner
  const srBanner = document.getElementById('saferoom-banner');
  if (srBanner) {
    if (isSafeRoomActive(state)) {
      srBanner.style.display = 'flex';
      srBanner.innerHTML = `<span>🛡 SAFE ROOM ACTIVE (${safeRoomDaysLeft(state)}d left)</span><span>DECAY PAUSED</span>`;
    } else {
      srBanner.style.display = 'none';
    }
  }

  // Profile Card
  const avatarBox = document.getElementById('avatar-container');
  avatarBox.classList.toggle('pixelated', Boolean(state.profile.pixelateAvatar));
  const avatarContent = document.getElementById('avatar-content');
  if (state.profile.avatarDataUrl) {
    avatarContent.innerHTML = `<img src="${state.profile.avatarDataUrl}" alt="Portrait"/>`;
  } else {
    avatarContent.innerHTML = DEFAULT_PIXEL_AVATAR;
  }

  document.getElementById('char-name').textContent = state.profile.name || 'New Player';
  document.getElementById('char-class').textContent = state.profile.customClass || lvl.title;
  document.getElementById('overall-rank').innerHTML = `<span>AVG RANK ${avgRank} / 5</span>`;

  document.getElementById('vital-age').textContent = state.profile.age ? `${state.profile.age}` : '—';
  document.getElementById('vital-height').textContent = state.profile.heightCm ? `${state.profile.heightCm}cm` : '—';
  document.getElementById('vital-weight').textContent = state.profile.weightKg ? `${state.profile.weightKg}kg` : '—';
  document.getElementById('char-goal').textContent = state.profile.goal || 'Set your main goal in Edit Profile.';

  // Scientific BMI Fitness Gate (+ Physique Title ONLY when Health Connect has actual body fat data)
  const bmiCard = document.getElementById('bmi-card');
  bmiCard.className = `bmi-card ${fitCap.status}`;
  const hcOn = Boolean(state.healthConnect?.connected);
  const hcHasBody = Boolean(
    hcOn &&
    (state.healthConnect?.hasRealBodyData || state.healthConnect?.isSimulated) &&
    Number(state.healthConnect?.bodyFatPct) >= 4
  );
  const bfText = hcHasBody ? ` · BF ${state.healthConnect.bodyFatPct}%` : '';
  document.getElementById('bmi-value').textContent = (fitCap.bmi ? `BMI ${fitCap.bmi.toFixed(1)}` : 'BMI —') + bfText;
  document.getElementById('bmi-badge').textContent = `MAX FITNESS: RANK ${fitCap.maxRank}`;
  document.getElementById('bmi-desc').textContent = fitCap.rangeKg
    ? `${fitCap.label}. Healthy range for your height: ${fitCap.rangeKg}.`
    : 'Add height & weight to unlock scientific Fitness Rank 5 calibration.';

  const physiqueEl = document.getElementById('physique-badge');
  const physique = hcHasBody
    ? evaluatePhysiqueTitle(
        state.profile.heightCm,
        state.profile.weightKg,
        state.healthConnect?.bodyFatPct,
        state.healthConnect?.leanMassKg
      )
    : null;
  if (physique) {
    physiqueEl.style.display = 'flex';
    physiqueEl.innerHTML = `<span>⚡ PHYSIQUE: <strong style="color:var(--accent-gold);">${physique.title.toUpperCase()}</strong></span><span style="font-family:monospace;font-size:10.5px;color:var(--text-muted);">${physique.detail} · FFMI ${physique.ffmi}</span>`;
  } else {
    physiqueEl.style.display = 'none';
  }

  // Sound toggle icon
  const soundBtn = document.getElementById('btn-toggle-sound');
  if (soundBtn) soundBtn.textContent = state.settings.soundEnabled !== false ? '🔊' : '🔇';

  // Active Status, Streaks, Combo, Sleep, Steps & Decay Warnings
  const statusList = document.getElementById('status-list');
  const statusItems = [];

  const streak = getEffectiveStreak(state);
  if (streak >= 1) {
    statusItems.push(`<div class="status-pill buff"><span>🔥 ${streak}-DAY STREAK</span><span>BEST: ${state.stats?.bestStreak || streak}d</span></div>`);
  }

  const todayAbs = getTodayTrainedAbilities(state);
  if (todayAbs.size >= 3) {
    statusItems.push(`<div class="status-pill buff"><span>⚡ BALANCED DAY COMBO</span><span>${todayAbs.size}/5 STATS</span></div>`);
  } else if (todayAbs.size > 0) {
    statusItems.push(`<div class="status-pill warn"><span>⚡ COMBO PROGRESS</span><span>${todayAbs.size}/3 STATS TODAY</span></div>`);
  }

  if (isWellRestedToday(state)) {
    statusItems.push(`<div class="status-pill buff"><span>🌙 WELL-RESTED (${state.healthConnect.lastSleepHours}h)</span><span>+10% XP</span></div>`);
  } else if (isFatiguedToday(state)) {
    statusItems.push(`<div class="status-pill debuff"><span>😵 FATIGUED (${state.healthConnect.lastSleepHours}h sleep)</span><span>REST UP</span></div>`);
  }

  if (hcOn && state.healthConnect?.stepsDate === todayKey() && state.healthConnect?.todaySteps > 0) {
    const steps = state.healthConnect.todaySteps;
    const src = state.healthConnect.stepsSource === 'Samsung Health' ? 'S-Health' : 'Steps';
    const distPart =
      state.healthConnect?.distanceDate === todayKey() && state.healthConnect?.todayDistanceKm > 0
        ? ` · ${state.healthConnect.todayDistanceKm} km`
        : '';
    statusItems.push(`<div class="status-pill ${steps >= 8000 ? 'buff' : 'warn'}"><span>👟 ${src.toUpperCase()}</span><span>${steps.toLocaleString()}${distPart}</span></div>`);
  }

  if (fitCap.status === 'capped') {
    statusItems.push(`<div class="status-pill warn"><span>⚠ FITNESS CAP (RANK ${fitCap.maxRank})</span><span>BMI ${fitCap.bmi.toFixed(1)}</span></div>`);
  }
  for (const ab of ABILITIES) {
    const entry = state.abilities[ab.id];
    if (!entry || entry.xp <= 0) continue;
    const idle = daysSince(entry.lastActivity);
    const grace = state.settings.graceDays[ab.id] ?? ab.defaultGraceDays;
    if (idle >= grace) {
      statusItems.push(`<div class="status-pill debuff"><span>▼ ${ab.decayName.toUpperCase()}</span><span>${idle}d (−${ab.decayPerDay}/d)</span></div>`);
    } else if (idle >= Math.max(1, grace - 2)) {
      statusItems.push(`<div class="status-pill warn"><span>⏳ ${ab.short} DECAY RISK</span><span>${grace - idle}d left</span></div>`);
    }
  }
  if (statusItems.length === 0) {
    statusItems.push(`<div class="status-pill buff"><span>✦ ALL STATS STABLE</span><span>READY</span></div>`);
  }
  statusList.innerHTML = statusItems.join('');

  // Radar Chart
  renderRadarChart(document.getElementById('radar-container'), ranks);

  // Ability Persona Rank Strip (Rank 1–5)
  document.getElementById('abilities-strip').innerHTML = ABILITIES.map(ab => {
    const r = ranks[ab.id];
    const xp = state.abilities[ab.id]?.xp || 0;
    const idle = daysSince(state.abilities[ab.id]?.lastActivity);
    const grace = state.settings.graceDays[ab.id] ?? ab.defaultGraceDays;
    const capNote = r.capped ? `<div class="ab-cap">BMI Cap (R${r.rawRank})</div>` : '';
    const decayNote = xp > 0 && idle >= grace ? `<div class="ab-decay-risk">▼ Decaying</div>` : '';
    return `
      <div class="ability-mini" title="${ab.label} · Rank ${r.rank} (${r.title}) · ${xp} XP${r.isMax ? ' (MAX)' : ` · Next Rank at ${r.nextMinXp} XP`}">
        <div class="ab-name">${ab.label}</div>
        <div class="ab-rank-num">R${r.rank}</div>
        <div class="ab-rank-title">${r.title}</div>
        <div class="ab-xp">${xp} XP</div>
        ${capNote}
        ${decayNote}
      </div>
    `;
  }).join('');

  // Skills List (Moons / Stars toggle)
  const mode = state.settings.skillDisplay || 'moons';
  document.getElementById('btn-mode-moons').classList.toggle('active', mode === 'moons');
  document.getElementById('btn-mode-stars').classList.toggle('active', mode === 'stars');

  const skillsList = document.getElementById('skills-list');
  if (state.skills.length === 0) {
    skillsList.innerHTML = `<div class="empty-state">No skills tracked yet. Click <strong>+ Skill</strong> to add Python, classes, books, or workouts.</div>`;
  } else {
    skillsList.innerHTML = state.skills
      .map(sk => {
        const m = getSkillMastery(sk.xp);
        const abLabel = ABILITIES.find(a => a.id === sk.linkedAbility)?.label || 'General';
        const glyphs = mode === 'moons' ? renderMoonGlyphs(m.stars) : renderStarGlyphs(m.stars);
        const iconSrc = sk.iconImage || getAbilityIconUrl(sk.linkedAbility);
        const iconMarkup = `<img src="${iconSrc}" alt="${escapeHtml(abLabel)}"/>`;
        let msHtml = '';
        if (sk.milestone && sk.milestone.target > 0) {
          const cur = Number(sk.milestone.current) || 0;
          const tgt = Number(sk.milestone.target);
          const pct = Math.min(100, Math.round((cur / tgt) * 100));
          const stepInc = tgt >= 100 ? 10 : 1;
          msHtml = `
            <div class="skill-milestone-row">
              <span style="color:var(--text-muted);white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(sk.milestone.label || '')}">${escapeHtml(sk.milestone.label || 'Milestone')}</span>
              <div class="ms-track"><div class="ms-fill" style="width:${pct}%"></div></div>
              <span style="font-family:monospace;color:var(--accent-gold);font-weight:800;white-space:nowrap;">${cur}/${tgt} ${escapeHtml(sk.milestone.unit || '')}</span>
              ${cur < tgt ? `<button class="btn btn-sm btn-gold" data-ms-inc="${sk.id}" data-ms-step="${stepInc}" style="padding:2px 7px;font-size:10px;">+${stepInc}</button>` : `<span style="color:var(--accent-emerald);font-weight:900;">✓</span>`}
            </div>
          `;
        }
        return `
          <div class="skill-item-wrap" data-edit-skill="${sk.id}" title="Right-click or long-press to edit">
            <div class="skill-top-row">
              <div class="skill-left">
                <div class="skill-icon" style="overflow:hidden;">${iconMarkup}</div>
                <div style="min-width:0">
                  <div class="skill-name">${escapeHtml(sk.name)}</div>
                  <div class="skill-sub">${abLabel} · ${sk.xp} XP (${m.stars.toFixed(1)}/5)</div>
                </div>
              </div>
              <div class="skill-right">
                <div class="mastery-glyphs" title="${m.stars.toFixed(1)} / 5.0 · Next step at ${m.nextXp} XP">${glyphs}</div>
                <button class="skill-del" data-delete-skill="${sk.id}" title="Remove skill">✕</button>
              </div>
            </div>
            ${msHtml}
          </div>
        `;
      })
      .join('');
  }

  // Daily Bounties
  const bountiesData = generateDailyBounties(state, false);
  const bountyList = document.getElementById('bounty-list');
  if (bountyList && bountiesData) {
    bountyList.innerHTML = (bountiesData.items || [])
      .map(b => {
        const abLabel = ABILITIES.find(a => a.id === b.abilityId)?.short || b.abilityId;
        return `
          <div class="bounty-row ${b.claimed ? 'claimed' : ''}">
            <div style="min-width:0;">
              <div style="font-weight:800;color:var(--text-bright);">${escapeHtml(b.title)}</div>
              <div style="font-size:10px;color:var(--text-muted);font-family:monospace;margin-top:2px;">+${abLabel} · +${b.xp} XP · +${b.gold} G</div>
            </div>
            <button class="btn btn-sm ${b.claimed ? '' : 'btn-gold'}" data-claim-bounty="${b.id}" ${b.claimed ? 'disabled' : ''}>${b.claimed ? '✓' : 'Claim'}</button>
          </div>
        `;
      })
      .join('');
    const rerollBtn = document.getElementById('btn-reroll-bounties');
    if (rerollBtn) {
      rerollBtn.disabled = (bountiesData.rerollsUsed || 0) >= 1;
      rerollBtn.textContent = (bountiesData.rerollsUsed || 0) >= 1 ? 'Rerolled' : '↻ Reroll';
    }
  }

  // Quick-Log 1-Tap Routines Bar
  const rBar = document.getElementById('routines-bar');
  const routines = state.routines || [];
  if (rBar) {
    if (routines.length === 0) {
      rBar.style.display = 'none';
    } else {
      rBar.style.display = 'flex';
      rBar.innerHTML = routines
        .map(
          r => `
          <span class="routine-chip" data-run-routine="${r.id}" title="1-tap log routine">
            ⚡ ${escapeHtml(r.title)}
            <button type="button" class="skill-del" data-del-routine="${r.id}" style="padding:0 2px;font-size:11px;" title="Delete routine">✕</button>
          </span>
        `
        )
        .join('');
    }
  }

  // Task Tracker / Chronicle Panel
  const listEl = document.getElementById('task-list');
  document.querySelectorAll('[data-tracker-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.trackerTab === activeTrackerTab);
  });

  if (activeTrackerTab === 'log') {
    if (state.logs.length === 0) {
      listEl.innerHTML = `<div class="empty-state">No history yet. Complete a task or log a setback to start your chronicle.</div>`;
    } else {
      listEl.innerHTML = state.logs
        .slice(0, 60)
        .map(entry => {
          const isPen = entry.type === 'penalty';
          const abTags = (entry.abilities || [])
            .map(id => `<span class="tag ${isPen ? 'tag-penalty' : 'tag-stat'}">${isPen ? '−' : '+'}${ABILITIES.find(a => a.id === id)?.short || id}</span>`)
            .join('');
          const skTags = (entry.skillIds || [])
            .map(id => {
              const sk = state.skills.find(s => s.id === id);
              return sk ? `<span class="tag tag-skill">${isPen ? '−' : '+'}${escapeHtml(sk.name)}</span>` : '';
            })
            .join('');
          const xpText = isPen ? `${entry.xpDelta} XP` : `+${entry.baseXp} XP`;
          return `
            <div class="log-entry ${isPen ? 'penalty' : ''}">
              <div class="task-top">
                <div class="task-title">${escapeHtml(entry.title)}</div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <div class="task-xp" style="${isPen ? 'color:var(--accent-danger);' : ''}">${xpText}</div>
                  ${isPen ? '' : `<button class="task-icon-btn" data-edit-log="${entry.id}" title="Edit title / relink skill &amp; stats">✎</button>`}
                  <button class="skill-del" data-delete-log="${entry.id}" title="Delete &amp; reverse XP">✕</button>
                </div>
              </div>
              <div class="task-meta">
                <span class="tag ${isPen ? 'tag-penalty' : 'tag-rec'}">${isPen ? (entry.auto ? 'Auto Decay' : 'Penalty') : 'Completed'}</span>
                ${abTags}${skTags}
                <span style="margin-left:auto;font-size:10px;color:var(--text-muted);font-family:monospace;">${formatRelDate(entry.timestamp)}</span>
              </div>
            </div>
          `;
        })
        .join('');
    }
    return;
  }

  // Filter tasks for Today / Week / Recurring
  let filteredTasks = state.tasks.filter(t => {
    const st = getTaskStatus(t);
    if (activeTrackerTab === 'today') return st.isDueToday;
    if (activeTrackerTab === 'week') return st.isInThisWeek;
    if (activeTrackerTab === 'recurring') return t.recurrence !== 'one_time';
    return true;
  });

  // Sort: unchecked first, pinned Priority Top 3 first, then preserve user manual order!
  filteredTasks.sort((a, b) => {
    const sa = getTaskStatus(a);
    const sb = getTaskStatus(b);
    const da = a.recurrence === 'one_time' ? sa.completedOneTime : sa.doneToday;
    const db = b.recurrence === 'one_time' ? sb.completedOneTime : sb.doneToday;
    if (da !== db) return da ? 1 : -1;
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return 0;
  });

  if (filteredTasks.length === 0) {
    const msg =
      activeTrackerTab === 'today'
        ? 'No tasks scheduled for today. Click <strong>+ New Task</strong> to add daily, weekly, or recurring tasks!'
        : activeTrackerTab === 'week'
        ? 'Nothing scheduled for this week yet.'
        : 'No recurring tasks yet. Try adding a Weekday, Spaced, or Weekly Goalpost habit!';
    listEl.innerHTML = `<div class="empty-state">${msg}</div>`;
  } else {
    listEl.innerHTML = filteredTasks.map(t => renderTaskCard(t, state)).join('');
  }
}

// =========================================================================
// BOSS FIGHTS PAGE RENDERER
// =========================================================================
export function renderBossesPage(state) {
  const grid = document.getElementById('boss-grid');
  const bosses = state.bosses || [];
  if (bosses.length === 0) {
    grid.innerHTML = `<div class="card empty-state" style="grid-column:1/-1;">No active Boss Fights. Click <strong>+ Summon Boss</strong> to turn an exam, big project, or deadline into a Boss with an HP bar!</div>`;
    return;
  }

  grid.innerHTML = bosses
    .map(b => {
      const pct = Math.max(0, Math.round((b.hp / Math.max(1, b.maxHp)) * 100));
      const abLabel = ABILITIES.find(a => a.id === b.abilityId)?.label || b.abilityId;
      const sk = b.skillId ? state.skills.find(s => s.id === b.skillId) : null;
      const deadlineText = b.status === 'active' ? daysLeftLabel(b.deadline) : b.status === 'defeated' ? 'DEFEATED ✓' : 'FAILED ✕';

      const stepsHtml = (b.steps || []).length
        ? `<div class="boss-steps">${b.steps
            .map(
              st => `
            <div class="boss-step ${st.done ? 'done' : ''}">
              <button class="btn btn-sm ${st.done ? '' : 'btn-danger'}" data-boss-step="${b.id}|${st.id}" ${st.done || b.status !== 'active' ? 'disabled' : ''} style="padding:2px 7px;">${st.done ? '✓' : '⚔'}</button>
              <span>${escapeHtml(st.label)}</span>
            </div>`
            )
            .join('')}</div>`
        : '';

      return `
        <div class="boss-card ${b.status}">
          <div class="task-top">
            <div>
              <div style="font-size:16px;font-weight:900;color:var(--text-bright);">⚔️ ${escapeHtml(b.title)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                ${abLabel}${sk ? ` · ${escapeHtml(sk.name)}` : ''} · Reward: <strong style="color:var(--accent-gold);">+${b.rewardXp} XP</strong>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="tag ${b.status === 'defeated' ? 'tag-due' : 'tag-overdue'}">${deadlineText}</span>
              <button class="skill-del" data-delete-boss="${b.id}" title="Delete Boss">✕</button>
            </div>
          </div>

          <div class="boss-hp-track"><div class="boss-hp-fill" style="width:${pct}%"></div></div>
          <div style="display:flex;justify-content:space-between;font-family:monospace;font-size:11px;color:var(--text-muted);">
            <span>HP: <strong style="color:var(--text-bright);">${b.hp} / ${b.maxHp}</strong> (${pct}%)</span>
            <span>Due: ${b.deadline}</span>
          </div>

          ${stepsHtml}

          ${
            b.status === 'active'
              ? `<div style="display:flex;gap:8px;margin-top:10px;">
                  <button class="btn btn-sm btn-danger" data-boss-strike="${b.id}|60">⚔ Strike (−60 HP)</button>
                  <button class="btn btn-sm btn-gold" data-boss-strike="${b.id}|150">⚡ Heavy Strike (−150 HP)</button>
                </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

// =========================================================================
// TROPHIES / ACHIEVEMENTS PAGE RENDERER (61 PIXEL BADGES)
// =========================================================================
export function renderTrophiesPage(state, category = 'All') {
  const unlockedMap = state.achievements?.unlocked || {};
  const unlockedCount = Object.keys(unlockedMap).length;
  document.getElementById('ach-progress-label').textContent = `${unlockedCount} / ${ACHIEVEMENTS.length} UNLOCKED`;

  // Equippable Titles Bar
  const titles = getUnlockedTitles(state);
  const titleBar = document.getElementById('unlocked-titles-bar');
  if (titles.length > 0) {
    titleBar.style.display = 'block';
    titleBar.innerHTML = `
      <div style="font-size:10.5px;font-weight:800;color:var(--accent-gold);text-transform:uppercase;margin-bottom:6px;">Unlocked Equippable Titles (Click to Equip)</div>
      <div class="chip-selector">
        <button class="chip-option ${!state.profile.customClass ? 'selected' : ''}" data-equip-title="">Auto Level Title</button>
        ${titles
          .map(
            t =>
              `<button class="chip-option ${state.profile.customClass === t.title ? 'selected-gold' : ''}" data-equip-title="${escapeHtml(t.title)}">★ ${escapeHtml(t.title)}</button>`
          )
          .join('')}
      </div>
    `;
  } else {
    titleBar.style.display = 'none';
  }

  // Category Filters
  const cats = ['All', 'Unlocked', ...new Set(ACHIEVEMENTS.map(a => a.cat))];
  document.getElementById('ach-filters').innerHTML = cats
    .map(c => `<button class="btn btn-sm ${c === category ? 'btn-gold' : ''}" data-ach-cat="${c}">${c}</button>`)
    .join('');

  const filtered = ACHIEVEMENTS.filter(a => {
    if (category === 'All') return true;
    if (category === 'Unlocked') return Boolean(unlockedMap[a.id]);
    return a.cat === category;
  });

  document.getElementById('ach-grid').innerHTML = filtered
    .map(a => {
      const isUnlocked = Boolean(unlockedMap[a.id]);
      return `
        <div class="ach-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <img class="ach-badge" src="${getBadgeUrl(a.id)}" alt="${escapeHtml(a.name)}" loading="lazy" />
          <div style="min-width:0;">
            <div class="ach-name">${escapeHtml(a.name)}</div>
            <div class="ach-desc">${escapeHtml(a.desc)}</div>
            ${a.titleReward ? `<span class="ach-reward">Title: ${escapeHtml(a.titleReward)}</span>` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

// =========================================================================
// STATS & ANALYTICS PAGE RENDERER
// =========================================================================
export function renderStatsPage(state) {
  const st = state.stats || {};
  const liveStreak = getEffectiveStreak(state);
  const focusHrs = ((st.totalFocusMinutes || 0) / 60).toFixed(1);
  const unlockedCount = Object.keys(state.achievements?.unlocked || {}).length;

  document.getElementById('stats-summary-row').innerHTML = `
    <div class="vital-box"><div class="vital-label">Current Streak</div><div class="vital-value" style="color:var(--accent-gold);">🔥 ${liveStreak}d</div></div>
    <div class="vital-box"><div class="vital-label">Focus Time</div><div class="vital-value">⏱ ${focusHrs}h</div></div>
    <div class="vital-box"><div class="vital-label">Bosses Slain</div><div class="vital-value" style="color:var(--accent-danger);">⚔️ ${st.bossesDefeated || 0}</div></div>
    <div class="vital-box"><div class="vital-label">Trophies</div><div class="vital-value" style="color:var(--accent-emerald);">★ ${unlockedCount}/${ACHIEVEMENTS.length}</div></div>
  `;

  renderActivityHeatmap(document.getElementById('stats-heatmap'), state);
  renderXpBarChart(document.getElementById('stats-xp-chart'), state);
  renderBodyTrendChart(document.getElementById('stats-body-chart'), state);

  const rep = buildWeeklyReport(state, false);
  document.getElementById('stats-week-preview').innerHTML = renderReportMarkup(rep);
}

export function renderReportMarkup(rep) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px;padding:12px;background:var(--bg-input);border-left:4px solid var(--accent-gold);">
      <div>
        <div style="font-size:10.5px;color:var(--text-muted);font-family:monospace;text-transform:uppercase;">WEEK ${rep.rangeLabel}</div>
        <div style="font-size:18px;font-weight:900;color:var(--text-bright);margin-top:2px;">Net ${rep.netXp >= 0 ? '+' : ''}${rep.netXp} XP</div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">${rep.tasksDone} tasks done · ${rep.penaltiesCount} setbacks</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:9.5px;color:var(--text-muted);font-weight:800;">GRADE</div>
        <div class="report-grade">${rep.grade}</div>
      </div>
    </div>
    <div class="vitals-grid" style="margin-bottom:0;">
      <div class="vital-box"><div class="vital-label">Strongest</div><div class="vital-value" style="font-size:12px;color:var(--accent-emerald);">${rep.strongest.label} (+${rep.strongest.xp})</div></div>
      <div class="vital-box"><div class="vital-label">Neglected</div><div class="vital-value" style="font-size:12px;color:var(--accent-danger);">${rep.neglected.label} (+${rep.neglected.xp})</div></div>
      <div class="vital-box"><div class="vital-label">Goalposts</div><div class="vital-value" style="font-size:12px;">${rep.goalpostsHit} / ${rep.goalpostsTotal}</div></div>
    </div>
  `;
}

// =========================================================================
// REWARD SHOP PAGE RENDERER
// =========================================================================
export function renderShopPage(state) {
  ensureShopState(state);
  const gold = Math.round(state.gold || 0);
  document.getElementById('shop-gold-balance').textContent = `${gold.toLocaleString()} G`;

  document.getElementById('shop-grid').innerHTML = state.shopItems
    .map(item => {
      const canAfford = gold >= item.cost;
      return `
        <div class="shop-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div style="font-size:14.5px;font-weight:900;color:var(--text-bright);">${escapeHtml(item.name)}</div>
            ${item.special ? '' : `<button class="skill-del" data-del-shop="${item.id}" title="Remove reward">✕</button>`}
          </div>
          <div style="font-size:11.5px;color:var(--text-muted);flex:1;">${escapeHtml(item.desc || 'Personal reward')}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <span style="font-family:monospace;font-size:15px;font-weight:900;color:var(--accent-gold);">${item.cost} G</span>
            <button class="btn btn-sm ${canAfford ? 'btn-gold' : ''}" data-redeem-shop="${item.id}" ${canAfford ? '' : 'disabled'}>Redeem</button>
          </div>
        </div>
      `;
    })
    .join('');

  const redList = document.getElementById('shop-redemptions');
  if (!state.redemptions || state.redemptions.length === 0) {
    redList.innerHTML = `<div class="empty-state">No rewards redeemed yet. Earn Gold by completing tasks &amp; Bosses!</div>`;
  } else {
    redList.innerHTML = state.redemptions
      .slice(0, 20)
      .map(
        r => `
        <div class="skill-item-wrap" style="padding:8px 12px;">
          <div class="skill-top-row">
            <span style="font-weight:800;font-size:13px;color:var(--text-bright);">${escapeHtml(r.name)}</span>
            <span style="font-family:monospace;font-size:12px;color:var(--accent-gold);font-weight:800;">−${r.cost} G · ${formatRelDate(r.timestamp)}</span>
          </div>
        </div>
      `
      )
      .join('');
  }
}
