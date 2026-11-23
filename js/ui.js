import {
  ABILITIES,
  DIFFICULTIES,
  DEFAULT_PIXEL_AVATAR,
  evaluatePhysiqueTitle,
  getLevelInfo,
  getSkillMastery,
} from './constants.js';
import {
  getAbilityRankSnapshot,
  getAverageRank,
  getTaskStatus,
  daysSince,
} from './state.js';
import { renderRadarChart } from './radar.js';

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
  const cardExtraClass = `${isDone ? 'done' : ''} ${st.goalpostReached ? 'goalpost-hit' : ''}`;

  return `
    <div class="task-card ${cardExtraClass}">
      <button class="task-check-btn ${isDone ? 'checked' : ''}" data-complete-task="${task.id}" ${isDone ? 'disabled' : ''} title="${isDone ? 'Completed' : 'Check off & earn XP'}">
        ${isDone ? '✓' : ''}
      </button>
      <div class="task-body">
        <div class="task-top">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="task-xp">${xpPreview}</span>
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

  // Level HUD
  document.getElementById('hud-level').textContent = `LV.${lvl.level}`;
  document.getElementById('hud-title').textContent = state.profile.customClass || lvl.title;
  document.getElementById('hud-xp-text').textContent = `${lvl.currentXp.toLocaleString()} / ${lvl.neededXp.toLocaleString()} XP`;
  document.getElementById('hud-xp-fill').style.width = `${lvl.pct.toFixed(1)}%`;

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

  // Scientific BMI Fitness Gate (+ Physique Title ONLY when Health Connect sync is on)
  const bmiCard = document.getElementById('bmi-card');
  bmiCard.className = `bmi-card ${fitCap.status}`;
  const hcOn = Boolean(state.healthConnect?.connected);
  const bfText = hcOn && state.healthConnect?.bodyFatPct ? ` · BF ${state.healthConnect.bodyFatPct}%` : '';
  document.getElementById('bmi-value').textContent = (fitCap.bmi ? `BMI ${fitCap.bmi.toFixed(1)}` : 'BMI —') + bfText;
  document.getElementById('bmi-badge').textContent = `MAX FITNESS: RANK ${fitCap.maxRank}`;
  document.getElementById('bmi-desc').textContent = fitCap.rangeKg
    ? `${fitCap.label}. Healthy range for your height: ${fitCap.rangeKg}.`
    : 'Add height & weight to unlock scientific Fitness Rank 5 calibration.';

  const physiqueEl = document.getElementById('physique-badge');
  const physique = hcOn
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

  // Active Status & Decay Warnings
  const statusList = document.getElementById('status-list');
  const statusItems = [];
  const recentActive = ABILITIES.filter(ab => state.abilities[ab.id].xp > 0 && daysSince(state.abilities[ab.id].lastActivity) <= 2).length;
  if (recentActive >= 2) {
    statusItems.push(`<div class="status-pill buff"><span>▲ MOMENTUM (${recentActive}/5)</span><span>ACTIVE</span></div>`);
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
        const iconMarkup = sk.iconImage
          ? `<img src="${sk.iconImage}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"/>`
          : sk.icon || '✦';
        return `
          <div class="skill-item" data-edit-skill="${sk.id}" title="Right-click or long-press to edit">
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
        `;
      })
      .join('');
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
                <div style="display:flex;align-items:center;gap:6px;">
                  <div class="task-xp" style="${isPen ? 'color:var(--accent-danger);' : ''}">${xpText}</div>
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

  // Sort: unchecked first, overdue first
  filteredTasks.sort((a, b) => {
    const sa = getTaskStatus(a);
    const sb = getTaskStatus(b);
    const da = a.recurrence === 'one_time' ? sa.completedOneTime : sa.doneToday;
    const db = b.recurrence === 'one_time' ? sb.completedOneTime : sb.doneToday;
    if (da !== db) return da ? 1 : -1;
    return sb.overdueDays - sa.overdueDays;
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
