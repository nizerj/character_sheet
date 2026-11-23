import {
  ABILITIES,
  DIFFICULTIES,
  PENALTY_SEVERITIES,
  WEEKDAYS,
  THEMES,
  TITLE_TRACKS,
} from './constants.js';
import {
  loadState,
  saveState,
  createFreshState,
  addTask,
  completeTask,
  deleteTask,
  deleteLogEntry,
  logPenalty,
  runAutoDecayCheck,
  recordBodySnapshot,
  incrementSkillMilestone,
  recordFocusSession,
  todayKey,
  addDaysKey,
  getWeekStartKey,
} from './state.js';
import {
  renderApp,
  renderBossesPage,
  renderTrophiesPage,
  renderStatsPage,
  renderReportMarkup,
  showToast,
} from './ui.js';
import {
  downloadJsonBackup,
  encodeBackupCode,
  decodeBackupCode,
  triggerEmailBackup,
  uploadBackupToDrive,
  restoreBackupFromDrive,
} from './backup.js';
import {
  isNativeAndroid,
  checkHealthConnectAvailability,
  requestHealthConnectPermissions,
  syncHealthConnect,
  applyHealthConnectData,
  disconnectHealthConnect,
} from './healthconnect.js';
import { evaluateAchievements, getBadgeUrl } from './achievements.js';
import {
  BOSS_TIERS,
  createBoss,
  damageBoss,
  toggleBossStep,
  applyTaskDamageToMatchingBosses,
  checkExpiredBosses,
  deleteBoss,
} from './bosses.js';
import {
  configureTimer,
  startTimer,
  pauseTimer,
  stopTimer,
  finishTimer,
  getTimerState,
  formatTime,
} from './timer.js';
import { buildWeeklyReport } from './analytics.js';
import { sfx, setAudioMuted, showCutIn } from './audio.js';
import { configureDailyReminder } from './notifications.js';

let state = loadState();
let activeTrackerTab = 'today';
let activePage = 'status';
let activeAchCategory = 'All';
let reviewPrevWeek = false;
let pendingAvatarDataUrl = undefined;
let editingSkillId = null;
let pendingSkillImage = undefined;
let wizStep = 1;
let wizPhotoDataUrl = null;
let wizSkills = [];

setAudioMuted(state.settings?.soundEnabled === false);

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop.open').forEach(el => {
    if (el.id === 'modal-setup' && !state.setupCompleted) return;
    el.classList.remove('open');
  });
}

function refreshCurrentView() {
  renderApp(state, activeTrackerTab);
  if (activePage === 'bosses') renderBossesPage(state);
  else if (activePage === 'trophies') renderTrophiesPage(state, activeAchCategory);
  else if (activePage === 'stats') renderStatsPage(state);
  else if (activePage === 'config') populateConfigPage();
}

function checkAchievementsAndNotify() {
  const unlocked = evaluateAchievements(state);
  unlocked.forEach((ach, i) => {
    setTimeout(() => {
      sfx.achievement();
      showCutIn({
        kicker: 'ACHIEVEMENT UNLOCKED',
        title: ach.name,
        subtitle: ach.titleReward ? `${ach.desc} · Title Unlocked: "${ach.titleReward}"` : ach.desc,
        variant: 'gold',
        badgeUrl: getBadgeUrl(ach.id),
      });
    }, i * 300);
  });
  if (unlocked.length > 0 && activePage === 'trophies') {
    renderTrophiesPage(state, activeAchCategory);
  }
}

function handleXpCelebration(res, label) {
  if (res.balancedComboTriggered) {
    showToast(`⚡ BALANCED DAY COMBO! +${res.comboBonus} Bonus XP!`);
  }
  if (res.leveledUp) {
    sfx.levelUp();
    showCutIn({
      kicker: 'LEVEL UP',
      title: `LV. ${res.newLevel}`,
      subtitle: label || 'Your potential expands!',
      variant: 'gold',
    });
  }
  if (res.rankUps && res.rankUps.length > 0) {
    sfx.rankUp();
    showCutIn({
      kicker: 'RANK UP',
      title: res.rankUps[0],
      subtitle: res.rankUps.slice(1).join(' · ') || 'New stat tier reached!',
      variant: 'gold',
    });
  }
  checkAchievementsAndNotify();
}

function compressImageFile(file, maxSize = 320, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// =========================================================================
// PAGE SWITCHING
// =========================================================================
function switchPage(page) {
  activePage = page;
  ['status', 'bosses', 'trophies', 'stats', 'config'].forEach(p => {
    const el = document.getElementById(`view-${p}`);
    if (!el) return;
    if (p === page) el.style.display = p === 'status' ? 'grid' : 'block';
    else el.style.display = 'none';
  });
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  sfx.click();
  refreshCurrentView();
}

// =========================================================================
// SETUP & TUTORIAL WIZARD
// =========================================================================
function setWizardStep(step) {
  wizStep = step;
  [1, 2, 3].forEach(n => {
    document.getElementById(`wiz-step-${n}`).style.display = n === step ? 'block' : 'none';
    document.querySelector(`[data-wiz-ind="${n}"]`).classList.toggle('active', n === step);
  });
  document.getElementById('btn-wiz-back').style.visibility = step > 1 ? 'visible' : 'hidden';
  document.getElementById('btn-wiz-next').style.display = step < 3 ? 'inline-flex' : 'none';
  document.getElementById('btn-wiz-finish').style.display = step === 3 ? 'inline-flex' : 'none';
}

function renderWizSkills() {
  const box = document.getElementById('wiz-added-skills');
  if (wizSkills.length === 0) {
    box.innerHTML = `<span style="font-size:11.5px;color:var(--text-muted);">No skills selected yet (you can always add them later).</span>`;
    return;
  }
  box.innerHTML = wizSkills
    .map(
      (s, i) => `
      <span class="tag tag-skill" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;font-size:11px;">
        ${s.icon} ${s.name}
        <button type="button" data-wiz-rem-skill="${i}" style="background:none;border:none;color:inherit;cursor:pointer;font-weight:900;">✕</button>
      </span>
    `
    )
    .join('');
}

function openSetupWizard(tutorialOnly = false) {
  document.getElementById('btn-close-setup').style.display = state.setupCompleted ? 'inline-block' : 'none';
  document.getElementById('wiz-custom-skill-ab').innerHTML = ABILITIES.map(
    ab => `<option value="${ab.id}">${ab.label}</option>`
  ).join('');

  if (tutorialOnly) {
    document.getElementById('btn-wiz-finish').textContent = 'Got It ✓';
    setWizardStep(3);
  } else {
    wizPhotoDataUrl = state.profile.avatarDataUrl || null;
    wizSkills = [];
    document.getElementById('wiz-name').value = state.profile.name || '';
    document.getElementById('wiz-age').value = state.profile.age ?? '';
    document.getElementById('wiz-height').value = state.profile.heightCm ?? '';
    document.getElementById('wiz-weight').value = state.profile.weightKg ?? '';
    document.getElementById('wiz-goal').value = state.profile.goal || '';
    document.getElementById('wiz-pixelate').checked = Boolean(state.profile.pixelateAvatar);
    document.querySelectorAll('#wiz-skill-presets .chip-option').forEach(c => c.classList.remove('selected-gold'));
    renderWizSkills();
    document.getElementById('btn-wiz-finish').textContent = 'Start at Rank 1 ✦';
    setWizardStep(1);
  }
  openModal('modal-setup');
}

// =========================================================================
// POPULATE MODALS & CONFIG
// =========================================================================
function updateRecurrenceBoxes() {
  const mode = document.getElementById('task-recurrence').value;
  ['one_time', 'weekdays', 'spaced', 'goalpost'].forEach(m => {
    document.getElementById(`rec-opt-${m}`).style.display = m === mode ? 'block' : 'none';
  });
}

function populateTaskModal() {
  document.getElementById('task-title').value = '';
  document.getElementById('task-difficulty').innerHTML = DIFFICULTIES.map(
    d => `<option value="${d.id}" ${d.id === 'medium' ? 'selected' : ''}>${d.label} (+${d.xp} XP) — ${d.desc}</option>`
  ).join('');
  document.getElementById('task-recurrence').value = 'one_time';
  document.getElementById('task-scope').value = 'today';
  document.getElementById('task-due-date').value = todayKey();
  document.getElementById('task-interval').value = 2;
  document.getElementById('task-weekly-target').value = 4;

  document.getElementById('task-weekday-chips').innerHTML = WEEKDAYS.map(
    w => `<button type="button" class="chip-option" data-weekday="${w.idx}">${w.short}</button>`
  ).join('');
  document.getElementById('task-ability-chips').innerHTML = ABILITIES.map(
    ab => `<button type="button" class="chip-option" data-ability="${ab.id}">${ab.label}</button>`
  ).join('');

  const skWrap = document.getElementById('task-skill-chips');
  skWrap.innerHTML =
    state.skills.length === 0
      ? `<span style="font-size:12px;color:var(--text-muted);">No skills added yet.</span>`
      : state.skills.map(sk => `<button type="button" class="chip-option" data-skill="${sk.id}">${sk.icon || '✦'} ${sk.name}</button>`).join('');
  updateRecurrenceBoxes();
}

function populatePenaltyModal() {
  document.getElementById('penalty-title').value = '';
  document.getElementById('penalty-severity').innerHTML = PENALTY_SEVERITIES.map(
    s => `<option value="${s.id}" ${s.id === 'moderate' ? 'selected' : ''}>${s.label}</option>`
  ).join('');
  document.getElementById('penalty-ability-chips').innerHTML = ABILITIES.map(
    ab => `<button type="button" class="chip-option" data-ability="${ab.id}">${ab.label}</button>`
  ).join('');
  const skWrap = document.getElementById('penalty-skill-chips');
  skWrap.innerHTML =
    state.skills.length === 0
      ? `<span style="font-size:12px;color:var(--text-muted);">No skills added yet.</span>`
      : state.skills.map(sk => `<button type="button" class="chip-option" data-skill="${sk.id}">${sk.icon || '✦'} ${sk.name}</button>`).join('');
}

function renderSkillImgPreview(dataUrl) {
  const prev = document.getElementById('skill-icon-preview');
  if (dataUrl) {
    prev.style.display = 'flex';
    prev.innerHTML = `<img src="${dataUrl}" style="width:32px;height:32px;object-fit:cover;border:1px solid var(--accent-gold);"/><span>Custom image ready (compressed)</span>`;
  } else {
    prev.style.display = 'none';
    prev.innerHTML = '';
  }
}

function populateSkillModal(skillId = null) {
  editingSkillId = skillId;
  pendingSkillImage = undefined;
  document.getElementById('skill-ability').innerHTML = ABILITIES.map(
    ab => `<option value="${ab.id}">${ab.label}</option>`
  ).join('');
  document.getElementById('skill-icon-file').value = '';

  const sk = skillId ? state.skills.find(s => s.id === skillId) : null;
  if (sk) {
    document.getElementById('skill-modal-title').textContent = '✎ Edit Skill';
    document.getElementById('btn-skill-submit').textContent = 'Save Skill';
    document.getElementById('skill-name').value = sk.name;
    document.getElementById('skill-icon').value = sk.icon || '✦';
    document.getElementById('skill-ability').value = sk.linkedAbility || 'productivity';
    document.getElementById('skill-ms-label').value = sk.milestone?.label || '';
    document.getElementById('skill-ms-current').value = sk.milestone?.current ?? '';
    document.getElementById('skill-ms-target').value = sk.milestone?.target ?? '';
    document.getElementById('skill-ms-unit').value = sk.milestone?.unit || '';
    renderSkillImgPreview(sk.iconImage || null);
  } else {
    document.getElementById('skill-modal-title').textContent = '+ Add Skill';
    document.getElementById('btn-skill-submit').textContent = 'Add Skill';
    document.getElementById('skill-name').value = '';
    document.getElementById('skill-icon').value = '✦';
    document.getElementById('skill-ms-label').value = '';
    document.getElementById('skill-ms-current').value = '';
    document.getElementById('skill-ms-target').value = '';
    document.getElementById('skill-ms-unit').value = '';
    renderSkillImgPreview(null);
  }
}

function populateBossModal() {
  document.getElementById('boss-title').value = '';
  document.getElementById('boss-tier').innerHTML = BOSS_TIERS.map(
    t => `<option value="${t.id}" ${t.id === 'boss' ? 'selected' : ''}>${t.label}</option>`
  ).join('');
  document.getElementById('boss-deadline').value = addDaysKey(todayKey(), 14);
  document.getElementById('boss-ability').innerHTML = ABILITIES.map(
    a => `<option value="${a.id}">${a.label}</option>`
  ).join('');
  document.getElementById('boss-skill').innerHTML =
    `<option value="">— None —</option>` +
    state.skills.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('boss-steps').value = '';
}

function populateTimerModal() {
  document.getElementById('timer-ability').innerHTML = ABILITIES.map(
    a => `<option value="${a.id}">${a.label}</option>`
  ).join('');
  document.getElementById('timer-skill').innerHTML =
    `<option value="">— None —</option>` +
    state.skills.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  updateTimerUI(getTimerState());
}

function updateTimerUI(ts) {
  const formatted = formatTime(ts.remainingSeconds);
  document.getElementById('timer-modal-clock').textContent = formatted;
  document.getElementById('timer-float-clock').textContent = formatted;
  document.getElementById('timer-float-label').textContent = ts.config.label || 'Focus';
  document.getElementById('btn-timer-start').textContent = ts.running ? '⏸ Pause' : '▶ Start';
  const modalOpen = document.getElementById('modal-timer').classList.contains('open');
  document.getElementById('timer-float').classList.toggle('visible', ts.running && !modalOpen);
}

function populateProfileModal() {
  const p = state.profile;
  pendingAvatarDataUrl = undefined;
  document.getElementById('prof-name').value = p.name || '';
  document.getElementById('prof-class').value = p.customClass || '';
  document.getElementById('prof-age').value = p.age ?? '';
  document.getElementById('prof-height').value = p.heightCm ?? '';
  document.getElementById('prof-weight').value = p.weightKg ?? '';
  document.getElementById('prof-goal').value = p.goal || '';
  document.getElementById('prof-pixelate').checked = Boolean(p.pixelateAvatar);
  document.getElementById('prof-photo-input').value = '';
}

function toHex(val, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(val) ? val : fallback;
}

function populateConfigPage() {
  document.getElementById('theme-grid').innerHTML = THEMES.map(t => {
    const active = state.settings.theme === t.id ? 'active' : '';
    const swatches = t.swatches.map(c => `<span class="swatch" style="background:${c}"></span>`).join('');
    return `
      <button type="button" class="theme-choice ${active}" data-theme-pick="${t.id}">
        <div class="t-name">${t.name}</div>
        <div class="t-desc">${t.desc}</div>
        <div class="swatch-row">${swatches}</div>
      </button>
    `;
  }).join('');

  document.getElementById('config-title-track').innerHTML = Object.values(TITLE_TRACKS)
    .map(tr => `<option value="${tr.id}" ${(state.settings.titleTrack || 'arcana') === tr.id ? 'selected' : ''}>${tr.label}</option>`)
    .join('');

  const styles = getComputedStyle(document.documentElement);
  document.getElementById('color-primary').value = toHex(state.settings.customColors.primary || styles.getPropertyValue('--accent-primary').trim(), '#7c6df7');
  document.getElementById('color-gold').value = toHex(state.settings.customColors.gold || styles.getPropertyValue('--accent-gold').trim(), '#f5c542');
  document.getElementById('color-radar').value = toHex(state.settings.customColors.radar || styles.getPropertyValue('--radar-stroke').trim(), '#a5b4fc');
  document.getElementById('setting-auto-decay').checked = Boolean(state.settings.autoDecayEnabled);
  document.getElementById('setting-sound').checked = state.settings.soundEnabled !== false;
  document.getElementById('setting-reminder').checked = Boolean(state.settings.reminderEnabled);
  document.getElementById('setting-reminder-time').value = state.settings.reminderTime || '20:00';

  document.getElementById('grace-days-grid').innerHTML = ABILITIES.map(ab => {
    const val = state.settings.graceDays[ab.id] ?? ab.defaultGraceDays;
    return `
      <div>
        <label class="form-label" style="font-size:9.5px;text-align:center;">${ab.short} (d)</label>
        <input class="form-input" style="text-align:center;padding:6px 4px;" type="number" min="1" max="60" data-grace-ability="${ab.id}" value="${val}" />
      </div>
    `;
  }).join('');

  const b = state.settings.backup || {};
  document.getElementById('backup-email').value = b.email || '';
  document.getElementById('backup-drive-client').value = b.driveClientId || '';
  document.getElementById('last-backup-label').textContent = b.lastBackupAt
    ? `Last backup: ${new Date(b.lastBackupAt).toLocaleString()}`
    : 'No backup yet';

  const hcLabel = document.getElementById('hc-status-label');
  if (state.healthConnect?.connected && state.healthConnect?.lastSyncAt) {
    const modeTag = state.healthConnect.isSimulated ? 'Test Mode' : 'Live Synced';
    hcLabel.textContent = `${modeTag}: ${new Date(state.healthConnect.lastSyncAt).toLocaleTimeString()}`;
  } else if (isNativeAndroid()) {
    hcLabel.textContent = 'Android Ready (Not Connected)';
  } else {
    hcLabel.textContent = 'Android APK Only (Test Mode on PC)';
  }
}

function openReviewModal(prevWeek = false) {
  reviewPrevWeek = prevWeek;
  const rep = buildWeeklyReport(state, reviewPrevWeek);
  document.getElementById('review-modal-body').innerHTML = renderReportMarkup(rep);
  openModal('modal-review');
}

// =========================================================================
// EVENT BINDING
// =========================================================================
function bindEvents() {
  const openTask = () => { populateTaskModal(); openModal('modal-task'); };
  const openPenalty = () => { populatePenaltyModal(); openModal('modal-penalty'); };
  const openProfile = () => { populateProfileModal(); openModal('modal-profile'); };

  document.getElementById('btn-open-task').addEventListener('click', openTask);
  document.getElementById('btn-quick-task').addEventListener('click', openTask);
  document.getElementById('btn-open-penalty').addEventListener('click', openPenalty);
  document.getElementById('btn-open-profile').addEventListener('click', openProfile);
  document.getElementById('avatar-container').addEventListener('click', openProfile);
  document.getElementById('btn-open-skill').addEventListener('click', () => { populateSkillModal(); openModal('modal-skill'); });
  document.getElementById('btn-open-boss').addEventListener('click', () => { populateBossModal(); openModal('modal-boss'); });
  document.getElementById('btn-open-timer').addEventListener('click', () => { populateTimerModal(); openModal('modal-timer'); });
  document.getElementById('btn-float-open').addEventListener('click', () => { populateTimerModal(); openModal('modal-timer'); });
  document.getElementById('btn-open-review').addEventListener('click', () => openReviewModal(false));
  document.getElementById('btn-review-toggle-week').addEventListener('click', () => openReviewModal(!reviewPrevWeek));
  document.getElementById('btn-open-tutorial').addEventListener('click', () => openSetupWizard(true));

  document.getElementById('btn-toggle-sound').addEventListener('click', () => {
    state.settings.soundEnabled = state.settings.soundEnabled === false;
    setAudioMuted(!state.settings.soundEnabled);
    saveState(state);
    refreshCurrentView();
    if (state.settings.soundEnabled) sfx.click();
  });

  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => {
    closeAllModals();
    updateTimerUI(getTimerState());
  }));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) {
        closeAllModals();
        updateTimerUI(getTimerState());
      }
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAllModals();
      updateTimerUI(getTimerState());
    }
  });

  document.getElementById('task-recurrence').addEventListener('change', updateRecurrenceBoxes);

  // --- FOCUS TIMER CONTROLS ---
  document.querySelectorAll('[data-timer-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = Number(btn.dataset.timerPreset);
      document.getElementById('timer-minutes').value = m;
      configureTimer({
        minutes: m,
        label: document.getElementById('timer-label').value.trim() || 'Deep Focus',
        abilityId: document.getElementById('timer-ability').value,
        skillId: document.getElementById('timer-skill').value,
      });
      updateTimerUI(getTimerState());
    });
  });

  const onTimerDone = info => {
    sfx.timerDone();
    const res = recordFocusSession(state, info);
    const hits = applyTaskDamageToMatchingBosses(state, [info.abilityId], info.skillId ? [info.skillId] : [], res.gainedTotalXp);
    refreshCurrentView();
    showToast(`⏱ Focus Complete (${info.minutesCompleted}m)! +${res.gainedTotalXp} XP`);
    hits.forEach(h => {
      if (h.defeated) {
        sfx.bossWin();
        showCutIn({ kicker: 'BOSS DEFEATED!', title: h.boss.title, subtitle: `+${h.rewardXp} Bonus XP`, variant: 'gold' });
      }
    });
    handleXpCelebration(res, 'Deep Focus Complete');
  };

  document.getElementById('btn-timer-start').addEventListener('click', () => {
    const ts = getTimerState();
    if (ts.running) {
      pauseTimer();
      updateTimerUI(getTimerState());
    } else {
      if (ts.remainingSeconds === ts.totalSeconds) {
        configureTimer({
          minutes: Number(document.getElementById('timer-minutes').value) || 25,
          label: document.getElementById('timer-label').value.trim() || 'Deep Focus',
          abilityId: document.getElementById('timer-ability').value,
          skillId: document.getElementById('timer-skill').value,
        });
      }
      sfx.click();
      startTimer(updateTimerUI, onTimerDone);
    }
  });

  document.getElementById('btn-timer-stop').addEventListener('click', () => {
    stopTimer();
    updateTimerUI(getTimerState());
  });

  document.getElementById('btn-timer-finish-early').addEventListener('click', () => {
    const ts = getTimerState();
    if (ts.remainingSeconds === ts.totalSeconds) {
      showToast('Start the timer first!', 'danger');
      return;
    }
    finishTimer(false);
    closeAllModals();
  });

  // --- WIZARD RESTORE & NAVIGATION ---
  document.getElementById('btn-wiz-toggle-restore').addEventListener('click', () => {
    const panel = document.getElementById('wiz-restore-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('wiz-import-json').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.profile || !parsed.abilities) throw new Error('Invalid');
        parsed.setupCompleted = true;
        state = parsed;
        saveState(state);
        document.getElementById('modal-setup').classList.remove('open');
        refreshCurrentView();
        showToast(`Welcome back, ${state.profile.name || 'Player'}! Backup restored.`);
      } catch {
        showToast('Invalid JSON backup file.', 'danger');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-wiz-restore-code').addEventListener('click', () => {
    const code = document.getElementById('wiz-restore-code').value.trim();
    if (!code) return;
    try {
      const parsed = decodeBackupCode(code);
      parsed.setupCompleted = true;
      state = parsed;
      saveState(state);
      document.getElementById('wiz-restore-code').value = '';
      document.getElementById('modal-setup').classList.remove('open');
      refreshCurrentView();
      showToast(`Welcome back, ${state.profile.name || 'Player'}! Backup restored.`);
    } catch {
      showToast('Invalid backup code.', 'danger');
    }
  });

  document.getElementById('btn-wiz-next').addEventListener('click', () => { if (wizStep < 3) setWizardStep(wizStep + 1); });
  document.getElementById('btn-wiz-back').addEventListener('click', () => { if (wizStep > 1) setWizardStep(wizStep - 1); });

  document.getElementById('wiz-photo-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      wizPhotoDataUrl = await compressImageFile(file);
      showToast('Photo uploaded!');
    } catch {
      showToast('Could not read photo.', 'danger');
    }
  });

  document.getElementById('btn-wiz-add-skill').addEventListener('click', () => {
    const name = document.getElementById('wiz-custom-skill').value.trim();
    const linkedAbility = document.getElementById('wiz-custom-skill-ab').value;
    if (!name) return;
    if (!wizSkills.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      wizSkills.push({ name, icon: '✦', linkedAbility });
      renderWizSkills();
    }
    document.getElementById('wiz-custom-skill').value = '';
  });

  document.getElementById('btn-wiz-finish').addEventListener('click', () => {
    if (!state.setupCompleted) {
      state.profile.name = document.getElementById('wiz-name').value.trim() || 'Player';
      state.profile.age = Number(document.getElementById('wiz-age').value) || null;
      state.profile.heightCm = Number(document.getElementById('wiz-height').value) || null;
      state.profile.weightKg = Number(document.getElementById('wiz-weight').value) || null;
      state.profile.goal = document.getElementById('wiz-goal').value.trim() || 'Level up every day.';
      state.profile.pixelateAvatar = document.getElementById('wiz-pixelate').checked;
      if (wizPhotoDataUrl) state.profile.avatarDataUrl = wizPhotoDataUrl;
      if (state.profile.weightKg) recordBodySnapshot(state);

      wizSkills.forEach((s, idx) => {
        state.skills.push({
          id: 'sk_' + Date.now() + '_' + idx,
          name: s.name,
          icon: s.icon,
          linkedAbility: s.linkedAbility,
          xp: 0,
        });
      });

      state.setupCompleted = true;
      saveState(state);
      refreshCurrentView();
      checkAchievementsAndNotify();
      showToast(`Welcome, ${state.profile.name}! You start at LV.1 · Rank 1.`);
    }
    document.getElementById('modal-setup').classList.remove('open');
  });

  // --- GLOBAL DELEGATED CLICKS ---
  document.body.addEventListener('click', e => {
    const presetBtn = e.target.closest('[data-preset-skill]');
    if (presetBtn) {
      const [name, icon, linkedAbility] = presetBtn.dataset.presetSkill.split('|');
      const idx = wizSkills.findIndex(s => s.name === name);
      if (idx >= 0) { wizSkills.splice(idx, 1); presetBtn.classList.remove('selected-gold'); }
      else { wizSkills.push({ name, icon, linkedAbility }); presetBtn.classList.add('selected-gold'); }
      renderWizSkills();
      return;
    }

    const wizRem = e.target.closest('[data-wiz-rem-skill]');
    if (wizRem) {
      const removed = wizSkills.splice(Number(wizRem.dataset.wizRemSkill), 1)[0];
      if (removed) {
        document.querySelectorAll('#wiz-skill-presets .chip-option').forEach(c => {
          if (c.dataset.presetSkill.startsWith(removed.name + '|')) c.classList.remove('selected-gold');
        });
      }
      renderWizSkills();
      return;
    }

    const dayPreset = e.target.closest('[data-day-preset]');
    if (dayPreset) {
      const p = dayPreset.dataset.dayPreset;
      const targetDays = p === 'weekdays' ? [1, 2, 3, 4, 5] : p === 'weekends' ? [6, 0] : [0, 1, 2, 3, 4, 5, 6];
      document.querySelectorAll('#task-weekday-chips .chip-option').forEach(c => {
        c.classList.toggle('selected', targetDays.includes(Number(c.dataset.weekday)));
      });
      return;
    }

    // Equip unlocked achievement title
    const equipBtn = e.target.closest('[data-equip-title]');
    if (equipBtn) {
      state.profile.customClass = equipBtn.dataset.equipTitle;
      saveState(state);
      sfx.click();
      refreshCurrentView();
      showToast(state.profile.customClass ? `Equipped title: "${state.profile.customClass}"` : 'Switched back to Auto Level Title');
      return;
    }

    // Achievement category filter
    const achCatBtn = e.target.closest('[data-ach-cat]');
    if (achCatBtn) {
      activeAchCategory = achCatBtn.dataset.achCat;
      renderTrophiesPage(state, activeAchCategory);
      return;
    }

    // Skill Milestone +Step increment
    const msBtn = e.target.closest('[data-ms-inc]');
    if (msBtn) {
      const res = incrementSkillMilestone(state, msBtn.dataset.msInc, Number(msBtn.dataset.msStep) || 1);
      if (res) {
        sfx.taskDone();
        refreshCurrentView();
        showToast(
          res.justCompleted
            ? `✦ MILESTONE COMPLETE! ${res.skillName} (${res.current}/${res.target}) · +${res.gainedTotalXp} XP!`
            : `${res.skillName} progress: ${res.current}/${res.target} (+${res.gainedTotalXp} XP)`
        );
        handleXpCelebration(res, res.skillName);
      }
      return;
    }

    // Boss Step Strike
    const bossStepBtn = e.target.closest('[data-boss-step]');
    if (bossStepBtn) {
      const [bossId, stepId] = bossStepBtn.dataset.bossStep.split('|');
      const res = toggleBossStep(state, bossId, stepId);
      if (res) {
        if (res.defeated) {
          sfx.bossWin();
          showCutIn({ kicker: 'BOSS DEFEATED!', title: res.boss.title, subtitle: `+${res.rewardXp} Bonus XP`, variant: 'gold' });
        } else {
          sfx.bossHit();
          showToast(`⚔️ Dealt −${res.dmg} HP to ${res.boss.title}!`);
        }
        refreshCurrentView();
        checkAchievementsAndNotify();
      }
      return;
    }

    // Boss Direct Strike
    const bossStrikeBtn = e.target.closest('[data-boss-strike]');
    if (bossStrikeBtn) {
      const [bossId, amt] = bossStrikeBtn.dataset.bossStrike.split('|');
      const res = damageBoss(state, bossId, Number(amt) || 60);
      if (res) {
        if (res.defeated) {
          sfx.bossWin();
          showCutIn({ kicker: 'BOSS DEFEATED!', title: res.boss.title, subtitle: `+${res.rewardXp} Bonus XP`, variant: 'gold' });
        } else {
          sfx.bossHit();
          showToast(`⚔️ Strike! −${res.dmg} HP on ${res.boss.title} (${res.boss.hp} HP left)`);
        }
        refreshCurrentView();
        checkAchievementsAndNotify();
      }
      return;
    }

    // Delete Boss
    const delBossBtn = e.target.closest('[data-delete-boss]');
    if (delBossBtn) {
      if (confirm('Delete this Boss Fight?')) {
        deleteBoss(state, delBossBtn.dataset.deleteBoss);
        refreshCurrentView();
      }
      return;
    }

    // Multi-select chip toggles
    const chip = e.target.closest('.chip-option');
    if (chip && !chip.dataset.presetSkill && !chip.dataset.equipTitle) {
      if (chip.dataset.skill) chip.classList.toggle('selected-gold');
      else chip.classList.toggle('selected');
      return;
    }

    // Tracker tab switch
    const tabBtn = e.target.closest('[data-tracker-tab]');
    if (tabBtn) {
      activeTrackerTab = tabBtn.dataset.trackerTab;
      sfx.click();
      renderApp(state, activeTrackerTab);
      return;
    }

    // Complete task (1-click)
    const completeBtn = e.target.closest('[data-complete-task]');
    if (completeBtn) {
      const taskObj = state.tasks.find(t => t.id === completeBtn.dataset.completeTask);
      const res = completeTask(state, completeBtn.dataset.completeTask);
      if (!res) return;
      sfx.taskDone();

      // Deal automatic damage to any active Boss linked to the same ability or skill!
      const bossHits = taskObj
        ? applyTaskDamageToMatchingBosses(state, taskObj.abilities, taskObj.skillIds, res.gainedTotalXp)
        : [];

      refreshCurrentView();
      if (res.goalpostBonusTriggered) {
        showToast(`★ GOALPOST QUOTA REACHED! +${res.gainedTotalXp} XP (with Bonus!)`);
      } else {
        showToast(`+${res.gainedTotalXp} XP · ${res.taskTitle}`);
      }
      bossHits.forEach(h => {
        if (h.defeated) {
          sfx.bossWin();
          showCutIn({ kicker: 'BOSS DEFEATED!', title: h.boss.title, subtitle: `+${h.rewardXp} Bonus XP`, variant: 'gold' });
        } else {
          showToast(`⚔️ −${h.dmg} HP dealt to Boss "${h.boss.title}"!`);
        }
      });
      handleXpCelebration(res, res.taskTitle);
      return;
    }

    // Delete task
    const delTaskBtn = e.target.closest('[data-delete-task]');
    if (delTaskBtn) {
      if (confirm('Delete this task?')) {
        deleteTask(state, delTaskBtn.dataset.deleteTask);
        refreshCurrentView();
      }
      return;
    }

    // Delete log entry & reverse XP
    const delLogBtn = e.target.closest('[data-delete-log]');
    if (delLogBtn) {
      if (confirm('Delete this log entry and reverse its XP?')) {
        const res = deleteLogEntry(state, delLogBtn.dataset.deleteLog);
        if (res) {
          refreshCurrentView();
          const sign = res.reversedXp >= 0 ? `−${res.reversedXp}` : `+${Math.abs(res.reversedXp)}`;
          showToast(`Deleted "${res.title}" (${sign} XP)`);
        }
      }
      return;
    }

    // Delete skill
    const delSkillBtn = e.target.closest('[data-delete-skill]');
    if (delSkillBtn) {
      const id = delSkillBtn.dataset.deleteSkill;
      const sk = state.skills.find(s => s.id === id);
      if (sk && confirm(`Remove skill "${sk.name}"?`)) {
        state.skills = state.skills.filter(s => s.id !== id);
        saveState(state);
        refreshCurrentView();
        showToast(`Removed skill: ${sk.name}`);
      }
      return;
    }

    // Theme picker
    const themePick = e.target.closest('[data-theme-pick]');
    if (themePick) {
      state.settings.theme = themePick.dataset.themePick;
      saveState(state);
      sfx.click();
      refreshCurrentView();
    }
  });

  // Moon / Star toggle
  document.getElementById('btn-mode-moons').addEventListener('click', () => {
    state.settings.skillDisplay = 'moons';
    saveState(state);
    renderApp(state, activeTrackerTab);
  });
  document.getElementById('btn-mode-stars').addEventListener('click', () => {
    state.settings.skillDisplay = 'stars';
    saveState(state);
    renderApp(state, activeTrackerTab);
  });

  // Create New Task
  document.getElementById('form-task').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const difficultyId = document.getElementById('task-difficulty').value;
    const recurrence = document.getElementById('task-recurrence').value;
    const scope = document.getElementById('task-scope').value;
    const dueDate = document.getElementById('task-due-date').value || todayKey();
    const intervalDays = Number(document.getElementById('task-interval').value) || 2;
    const weeklyTarget = Number(document.getElementById('task-weekly-target').value) || 4;
    const days = [...document.querySelectorAll('#task-weekday-chips .chip-option.selected')].map(c => Number(c.dataset.weekday));
    const abilityIds = [...document.querySelectorAll('#task-ability-chips .chip-option.selected')].map(c => c.dataset.ability);
    const skillIds = [...document.querySelectorAll('#task-skill-chips .chip-option.selected-gold')].map(c => c.dataset.skill);

    if (recurrence === 'weekdays' && days.length === 0) {
      showToast('Select at least one day of the week.', 'danger');
      return;
    }
    if (abilityIds.length === 0 && skillIds.length === 0) {
      showToast('Select at least one Ability or Skill.', 'danger');
      return;
    }

    addTask(state, { title, difficultyId, recurrence, scope, dueDate, days, intervalDays, weeklyTarget, abilityIds, skillIds });
    closeAllModals();
    if (recurrence !== 'one_time' && activeTrackerTab === 'log') activeTrackerTab = 'today';
    refreshCurrentView();
    showToast(`Added task: "${title}"`);
  });

  // Summon New Boss
  document.getElementById('form-boss').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('boss-title').value.trim();
    const tierId = document.getElementById('boss-tier').value;
    const deadline = document.getElementById('boss-deadline').value;
    const abilityId = document.getElementById('boss-ability').value;
    const skillId = document.getElementById('boss-skill').value;
    const steps = document.getElementById('boss-steps').value.split('\n');
    createBoss(state, { title, tierId, deadline, abilityId, skillId, steps });
    closeAllModals();
    sfx.bossHit();
    refreshCurrentView();
    showToast(`⚔️ Boss Summoned: "${title}"!`);
  });

  // Submit Penalty
  document.getElementById('form-penalty').addEventListener('submit', e => {
    e.preventDefault();
    const title = document.getElementById('penalty-title').value.trim();
    const severityId = document.getElementById('penalty-severity').value;
    const abilityIds = [...document.querySelectorAll('#penalty-ability-chips .chip-option.selected')].map(c => c.dataset.ability);
    const skillIds = [...document.querySelectorAll('#penalty-skill-chips .chip-option.selected-gold')].map(c => c.dataset.skill);

    if (abilityIds.length === 0 && skillIds.length === 0) {
      showToast('Select at least one affected Ability or Skill.', 'danger');
      return;
    }

    const res = logPenalty(state, { title, severityId, abilityIds, skillIds, auto: false });
    sfx.penalty();
    closeAllModals();
    refreshCurrentView();
    showToast(`−${res.penaltyXp} XP applied for "${title}"`, 'danger');
    if (res.rankDowns.length > 0) {
      showCutIn({ kicker: 'RANK DOWN', title: res.rankDowns[0], subtitle: title, variant: 'danger' });
    }
  });

  // Right-click (PC) & Long-press (Mobile) on Skill to Edit
  document.getElementById('skills-list').addEventListener('contextmenu', e => {
    const item = e.target.closest('[data-edit-skill]');
    if (!item || e.target.closest('[data-delete-skill]') || e.target.closest('[data-ms-inc]')) return;
    e.preventDefault();
    populateSkillModal(item.dataset.editSkill);
    openModal('modal-skill');
  });

  let longPressTimer = null;
  document.getElementById('skills-list').addEventListener('touchstart', e => {
    const item = e.target.closest('[data-edit-skill]');
    if (!item || e.target.closest('[data-delete-skill]') || e.target.closest('[data-ms-inc]')) return;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      populateSkillModal(item.dataset.editSkill);
      openModal('modal-skill');
    }, 520);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(ev => {
    document.getElementById('skills-list').addEventListener(ev, () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }, { passive: true });
  });

  document.getElementById('skill-icon-file').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingSkillImage = await compressImageFile(file, 64, 0.72);
      renderSkillImgPreview(pendingSkillImage);
    } catch {
      showToast('Could not read icon image.', 'danger');
    }
  });
  document.getElementById('btn-clear-skill-img').addEventListener('click', () => {
    pendingSkillImage = null;
    document.getElementById('skill-icon-file').value = '';
    renderSkillImgPreview(null);
  });

  document.getElementById('form-skill').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('skill-name').value.trim();
    const icon = document.getElementById('skill-icon').value.trim() || '✦';
    const linkedAbility = document.getElementById('skill-ability').value;
    const msLabel = document.getElementById('skill-ms-label').value.trim();
    const msTarget = Number(document.getElementById('skill-ms-target').value) || 0;
    const msCurrent = Number(document.getElementById('skill-ms-current').value) || 0;
    const msUnit = document.getElementById('skill-ms-unit').value.trim();
    const milestone = msTarget > 0 ? { label: msLabel || 'Progress', current: msCurrent, target: msTarget, unit: msUnit } : null;
    if (!name) return;

    if (editingSkillId) {
      const sk = state.skills.find(s => s.id === editingSkillId);
      if (sk) {
        sk.name = name;
        sk.icon = icon;
        sk.linkedAbility = linkedAbility;
        sk.milestone = milestone;
        if (pendingSkillImage !== undefined) sk.iconImage = pendingSkillImage;
        saveState(state);
        closeAllModals();
        refreshCurrentView();
        showToast(`Updated skill: ${name}`);
      }
    } else {
      state.skills.push({
        id: 'sk_' + Date.now(),
        name,
        icon,
        iconImage: pendingSkillImage || null,
        linkedAbility,
        milestone,
        xp: 0,
      });
      saveState(state);
      closeAllModals();
      refreshCurrentView();
      checkAchievementsAndNotify();
      showToast(`Added skill: ${icon} ${name}`);
    }
  });

  // Profile Photo Upload & Save
  document.getElementById('prof-photo-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingAvatarDataUrl = await compressImageFile(file);
      showToast('Photo ready — click Save to apply!');
    } catch {
      showToast('Could not read image.', 'danger');
    }
  });
  document.getElementById('btn-reset-avatar').addEventListener('click', () => {
    pendingAvatarDataUrl = null;
    showToast('Switched to Pixel Avatar — click Save to apply.');
  });
  document.getElementById('form-profile').addEventListener('submit', e => {
    e.preventDefault();
    state.profile.name = document.getElementById('prof-name').value.trim() || 'Player';
    state.profile.customClass = document.getElementById('prof-class').value.trim();
    state.profile.age = Number(document.getElementById('prof-age').value) || null;
    state.profile.heightCm = Number(document.getElementById('prof-height').value) || null;
    state.profile.weightKg = Number(document.getElementById('prof-weight').value) || null;
    state.profile.goal = document.getElementById('prof-goal').value.trim();
    state.profile.pixelateAvatar = document.getElementById('prof-pixelate').checked;
    if (pendingAvatarDataUrl !== undefined) state.profile.avatarDataUrl = pendingAvatarDataUrl;
    if (state.profile.weightKg) recordBodySnapshot(state);
    saveState(state);
    closeAllModals();
    refreshCurrentView();
    checkAchievementsAndNotify();
    showToast('Profile saved!');
  });

  // Config Controls
  document.getElementById('config-title-track').addEventListener('change', e => {
    state.settings.titleTrack = e.target.value;
    saveState(state);
    refreshCurrentView();
    showToast('Level title progression updated!');
  });

  ['primary', 'gold', 'radar'].forEach(key => {
    document.getElementById(`color-${key}`).addEventListener('input', e => {
      state.settings.customColors[key] = e.target.value;
      saveState(state);
      renderApp(state, activeTrackerTab);
    });
  });
  document.getElementById('btn-reset-colors').addEventListener('click', () => {
    state.settings.customColors = { primary: '', gold: '', radar: '' };
    saveState(state);
    refreshCurrentView();
  });

  document.getElementById('setting-sound').addEventListener('change', e => {
    state.settings.soundEnabled = e.target.checked;
    setAudioMuted(!e.target.checked);
    saveState(state);
    renderApp(state, activeTrackerTab);
  });

  document.getElementById('btn-save-reminder').addEventListener('click', async () => {
    const enabled = document.getElementById('setting-reminder').checked;
    const timeStr = document.getElementById('setting-reminder-time').value || '20:00';
    state.settings.reminderEnabled = enabled;
    state.settings.reminderTime = timeStr;
    saveState(state);
    const res = await configureDailyReminder(enabled, timeStr);
    showToast(res.message, res.ok ? 'normal' : 'danger');
  });

  document.getElementById('setting-auto-decay').addEventListener('change', e => {
    state.settings.autoDecayEnabled = e.target.checked;
    saveState(state);
    renderApp(state, activeTrackerTab);
  });
  document.getElementById('grace-days-grid').addEventListener('change', e => {
    const abId = e.target.dataset?.graceAbility;
    if (!abId) return;
    state.settings.graceDays[abId] = Math.max(1, Math.min(60, Number(e.target.value) || 7));
    saveState(state);
    renderApp(state, activeTrackerTab);
  });

  // Health Connect Controls
  document.getElementById('btn-hc-connect').addEventListener('click', async () => {
    try {
      const avail = await checkHealthConnectAvailability();
      if (!avail.available) {
        showToast(avail.reason || 'Health Connect is available in the Android APK.', 'danger');
        return;
      }
      await requestHealthConnectPermissions();
      const summary = await syncHealthConnect(state, 7);
      refreshCurrentView();
      checkAchievementsAndNotify();
      showToast(`Health Connect linked! Imported ${summary.workoutsImported} workout(s).`);
    } catch (err) {
      showToast(err.message || 'Could not connect to Health Connect.', 'danger');
    }
  });

  document.getElementById('btn-hc-sync').addEventListener('click', async () => {
    try {
      const summary = await syncHealthConnect(state, 7);
      refreshCurrentView();
      checkAchievementsAndNotify();
      const parts = [];
      if (summary.weightUpdated) parts.push(`Weight → ${summary.newWeightKg}kg`);
      if (summary.bodyFatPct) parts.push(`BF ${summary.bodyFatPct}%`);
      if (summary.lastSleepHours) parts.push(`Sleep ${summary.lastSleepHours}h`);
      if (summary.todaySteps) parts.push(`${summary.todaySteps.toLocaleString()} steps`);
      if (summary.workoutsImported > 0) parts.push(`+${summary.workoutsImported} workout(s)`);
      showToast(parts.length ? `Health Connect: ${parts.join(' · ')}` : 'Health Connect synced — already up to date!');
    } catch (err) {
      showToast(err.message || 'Install Android APK for live Health Connect sync.', 'danger');
    }
  });

  document.getElementById('btn-hc-simulate').addEventListener('click', () => {
    const summary = applyHealthConnectData(
      state,
      {
        latestWeightKg: state.profile.weightKg || 72.4,
        latestBodyFatPct: 14.8,
        lastSleepHours: 7.5,
        todaySteps: 8450,
        workouts: [
          {
            id: 'sim_hevy_' + todayKey(),
            title: 'Hevy — Push Day',
            durationMinutes: 62,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
          },
        ],
      },
      { simulated: true }
    );
    refreshCurrentView();
    checkAchievementsAndNotify();
    showToast(
      summary.workoutsImported > 0
        ? `Test Sync: BF ${summary.bodyFatPct}% · Sleep 7.5h (+10% XP) · 8,450 steps · +1 Hevy workout!`
        : `Test Sync updated (today's test workout & step bonus already logged).`
    );
  });

  document.getElementById('btn-hc-disconnect').addEventListener('click', () => {
    disconnectHealthConnect(state);
    refreshCurrentView();
    showToast('Disconnected Health Connect & cleared synced body metrics.');
  });

  // Backups
  document.getElementById('backup-email').addEventListener('change', e => {
    state.settings.backup.email = e.target.value.trim();
    saveState(state);
  });
  document.getElementById('backup-drive-client').addEventListener('change', e => {
    state.settings.backup.driveClientId = e.target.value.trim();
    saveState(state);
  });
  document.getElementById('btn-backup-email').addEventListener('click', () => {
    const email = document.getElementById('backup-email').value.trim();
    state.settings.backup.email = email;
    state.settings.backup.lastBackupAt = new Date().toISOString();
    saveState(state);
    const filename = triggerEmailBackup(state, email);
    refreshCurrentView();
    checkAchievementsAndNotify();
    showToast(`Downloaded ${filename} & opened email draft!`);
  });
  document.getElementById('btn-drive-quick').addEventListener('click', () => {
    const filename = downloadJsonBackup(state);
    state.settings.backup.lastBackupAt = new Date().toISOString();
    saveState(state);
    refreshCurrentView();
    checkAchievementsAndNotify();
    window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
    showToast(`Downloaded ${filename} — drop it into Google Drive!`);
  });
  document.getElementById('btn-drive-upload').addEventListener('click', async () => {
    const clientId = document.getElementById('backup-drive-client').value.trim();
    state.settings.backup.driveClientId = clientId;
    saveState(state);
    try {
      await uploadBackupToDrive(state, clientId);
      state.settings.backup.lastBackupAt = new Date().toISOString();
      saveState(state);
      refreshCurrentView();
      checkAchievementsAndNotify();
      showToast('☁ Synced backup to Google Drive!');
    } catch (err) {
      showToast(err.message || 'Drive sync failed.', 'danger');
    }
  });
  document.getElementById('btn-drive-restore').addEventListener('click', async () => {
    const clientId = document.getElementById('backup-drive-client').value.trim();
    try {
      state = await restoreBackupFromDrive(clientId);
      saveState(state);
      refreshCurrentView();
      showToast('☁ Restored save from Google Drive!');
    } catch (err) {
      showToast(err.message || 'Drive restore failed.', 'danger');
    }
  });
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const filename = downloadJsonBackup(state);
    state.settings.backup.lastBackupAt = new Date().toISOString();
    saveState(state);
    refreshCurrentView();
    checkAchievementsAndNotify();
    showToast(`Exported ${filename}`);
  });
  document.getElementById('btn-copy-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(encodeBackupCode(state));
      showToast('📋 Backup code copied to clipboard!');
    } catch {
      showToast('Could not copy to clipboard.', 'danger');
    }
  });
  document.getElementById('btn-restore-code').addEventListener('click', () => {
    const code = document.getElementById('restore-code-input').value.trim();
    if (!code) return;
    try {
      state = decodeBackupCode(code);
      saveState(state);
      document.getElementById('restore-code-input').value = '';
      refreshCurrentView();
      showToast('Restored character from backup code!');
    } catch {
      showToast('Invalid backup code.', 'danger');
    }
  });
  document.getElementById('input-import-json').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.profile || !parsed.abilities) throw new Error('Invalid');
        state = parsed;
        saveState(state);
        refreshCurrentView();
        showToast('Save imported!');
      } catch {
        showToast('Invalid JSON file.', 'danger');
      }
    };
    reader.readAsText(file);
  });
  document.getElementById('btn-fresh-start').addEventListener('click', () => {
    if (!confirm('Reset all stats, skills, bosses, trophies, and tasks back to Rank 1 & re-run setup?')) return;
    state = createFreshState(state.settings);
    saveState(state);
    switchPage('status');
    openSetupWizard(false);
  });
}

// =========================================================================
// STARTUP + SERVICE WORKER
// =========================================================================
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

bindEvents();
const decayEvents = runAutoDecayCheck(state);
const expiredBosses = checkExpiredBosses(state);
renderApp(state, activeTrackerTab);

if (!state.setupCompleted) {
  openSetupWizard(false);
} else {
  if (decayEvents.length > 0) {
    const summary = decayEvents.map(d => `${d.ability} (−${d.loss} XP)`).join(', ');
    showToast(`▼ Auto-Decay triggered: ${summary}`, 'danger');
  }
  if (expiredBosses.length > 0) {
    expiredBosses.forEach(f => showToast(`💀 Boss Missed Deadline: ${f.boss.title} (−${f.penaltyXp} XP)`, 'danger'));
  }

  // Auto-show Weekly Review once per new week if there was activity last week
  const curWeek = getWeekStartKey();
  if (state.stats && state.stats.lastReviewWeek !== curWeek) {
    const prevRep = buildWeeklyReport(state, true);
    state.stats.lastReviewWeek = curWeek;
    saveState(state);
    if (prevRep.tasksDone > 0) {
      setTimeout(() => openReviewModal(true), 700);
    }
  }

  // Auto-sync Health Connect on launch & app resume
  if (isNativeAndroid() && state.healthConnect?.connected) {
    const runSilentHcSync = () => {
      syncHealthConnect(state, 7)
        .then(s => {
          if (s.weightUpdated || s.workoutsImported > 0 || s.stepBonusAwarded) {
            refreshCurrentView();
            checkAchievementsAndNotify();
            const parts = [];
            if (s.weightUpdated) parts.push(`Weight → ${s.newWeightKg}kg`);
            if (s.workoutsImported > 0) parts.push(`+${s.workoutsImported} workout(s)`);
            if (s.stepBonusAwarded) parts.push('8K+ Steps Bonus!');
            showToast(`Health Connect synced: ${parts.join(' · ')}`);
          }
        })
        .catch(() => {});
    };
    runSilentHcSync();

    let lastResumeSync = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastResumeSync > 30000) {
        lastResumeSync = Date.now();
        runSilentHcSync();
      }
    });
  }
}
