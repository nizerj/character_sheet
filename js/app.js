import {
  ABILITIES,
  DIFFICULTIES,
  PENALTY_SEVERITIES,
  WEEKDAYS,
  THEMES,
} from './constants.js';
import {
  loadState,
  saveState,
  createFreshState,
  addTask,
  completeTask,
  deleteTask,
  logPenalty,
  runAutoDecayCheck,
  todayKey,
} from './state.js';
import { renderApp, showToast } from './ui.js';
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
} from './healthconnect.js';

let state = loadState();
let activeTrackerTab = 'today';
let activePage = 'status';
let pendingAvatarDataUrl = undefined;
let wizStep = 1;
let wizPhotoDataUrl = null;
let wizSkills = []; // [{name, icon, linkedAbility}]

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop.open').forEach(el => {
    // Don't allow closing mandatory first-time setup before completion
    if (el.id === 'modal-setup' && !state.setupCompleted) return;
    el.classList.remove('open');
  });
}

function compressImageFile(file, maxSize = 320) {
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
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const closeBtn = document.getElementById('btn-close-setup');
  closeBtn.style.display = state.setupCompleted ? 'inline-block' : 'none';

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
// POPULATE MODALS
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
  if (state.skills.length === 0) {
    skWrap.innerHTML = `<span style="font-size:12px;color:var(--text-muted);">No skills added yet.</span>`;
  } else {
    skWrap.innerHTML = state.skills
      .map(sk => `<button type="button" class="chip-option" data-skill="${sk.id}">${sk.icon || '✦'} ${sk.name}</button>`)
      .join('');
  }

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
      : state.skills
          .map(sk => `<button type="button" class="chip-option" data-skill="${sk.id}">${sk.icon || '✦'} ${sk.name}</button>`)
          .join('');
}

function populateSkillModal() {
  document.getElementById('skill-ability').innerHTML = ABILITIES.map(
    ab => `<option value="${ab.id}">${ab.label}</option>`
  ).join('');
  document.getElementById('skill-name').value = '';
  document.getElementById('skill-icon').value = '✦';
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

  const styles = getComputedStyle(document.documentElement);
  document.getElementById('color-primary').value = toHex(state.settings.customColors.primary || styles.getPropertyValue('--accent-primary').trim(), '#7c6df7');
  document.getElementById('color-gold').value = toHex(state.settings.customColors.gold || styles.getPropertyValue('--accent-gold').trim(), '#f5c542');
  document.getElementById('color-radar').value = toHex(state.settings.customColors.radar || styles.getPropertyValue('--radar-stroke').trim(), '#a5b4fc');
  document.getElementById('setting-auto-decay').checked = Boolean(state.settings.autoDecayEnabled);

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
  if (state.healthConnect?.lastSyncAt) {
    hcLabel.textContent = `Synced: ${new Date(state.healthConnect.lastSyncAt).toLocaleTimeString()}`;
  } else if (isNativeAndroid()) {
    hcLabel.textContent = 'Android Ready';
  } else {
    hcLabel.textContent = 'Android APK Only (Test Mode on PC)';
  }
}

function switchPage(page) {
  activePage = page;
  document.getElementById('view-status').style.display = page === 'status' ? 'grid' : 'none';
  document.getElementById('view-config').style.display = page === 'config' ? 'block' : 'none';
  document.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (page === 'config') populateConfigPage();
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
  document.getElementById('btn-open-tutorial').addEventListener('click', () => openSetupWizard(true));

  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeAllModals));
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeAllModals(); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });

  document.getElementById('task-recurrence').addEventListener('change', updateRecurrenceBoxes);

  // Wizard Restore Backup Account (skips tutorial on new browser/device)
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
        renderApp(state, activeTrackerTab);
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
      renderApp(state, activeTrackerTab);
      showToast(`Welcome back, ${state.profile.name || 'Player'}! Backup restored.`);
    } catch {
      showToast('Invalid backup code.', 'danger');
    }
  });

  // Wizard Navigation & Controls
  document.getElementById('btn-wiz-next').addEventListener('click', () => {
    if (wizStep < 3) setWizardStep(wizStep + 1);
  });
  document.getElementById('btn-wiz-back').addEventListener('click', () => {
    if (wizStep > 1) setWizardStep(wizStep - 1);
  });

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
      renderApp(state, activeTrackerTab);
      showToast(`Welcome, ${state.profile.name}! You start at LV.1 · Rank 1.`);
    }
    document.getElementById('modal-setup').classList.remove('open');
  });

  // Global delegated clicks
  document.body.addEventListener('click', e => {
    // Wizard skill preset toggle
    const presetBtn = e.target.closest('[data-preset-skill]');
    if (presetBtn) {
      const [name, icon, linkedAbility] = presetBtn.dataset.presetSkill.split('|');
      const existsIdx = wizSkills.findIndex(s => s.name === name);
      if (existsIdx >= 0) {
        wizSkills.splice(existsIdx, 1);
        presetBtn.classList.remove('selected-gold');
      } else {
        wizSkills.push({ name, icon, linkedAbility });
        presetBtn.classList.add('selected-gold');
      }
      renderWizSkills();
      return;
    }

    const wizRem = e.target.closest('[data-wiz-rem-skill]');
    if (wizRem) {
      const idx = Number(wizRem.dataset.wizRemSkill);
      const removed = wizSkills.splice(idx, 1)[0];
      if (removed) {
        document.querySelectorAll('#wiz-skill-presets .chip-option').forEach(c => {
          if (c.dataset.presetSkill.startsWith(removed.name + '|')) c.classList.remove('selected-gold');
        });
      }
      renderWizSkills();
      return;
    }

    // Weekday presets in New Task modal
    const dayPreset = e.target.closest('[data-day-preset]');
    if (dayPreset) {
      const p = dayPreset.dataset.dayPreset;
      const targetDays = p === 'weekdays' ? [1, 2, 3, 4, 5] : p === 'weekends' ? [6, 0] : [0, 1, 2, 3, 4, 5, 6];
      document.querySelectorAll('#task-weekday-chips .chip-option').forEach(c => {
        c.classList.toggle('selected', targetDays.includes(Number(c.dataset.weekday)));
      });
      return;
    }

    // Multi-select chip toggles
    const chip = e.target.closest('.chip-option');
    if (chip && !chip.dataset.presetSkill) {
      if (chip.dataset.skill) chip.classList.toggle('selected-gold');
      else chip.classList.toggle('selected');
      return;
    }

    // Tracker tab switch
    const tabBtn = e.target.closest('[data-tracker-tab]');
    if (tabBtn) {
      activeTrackerTab = tabBtn.dataset.trackerTab;
      renderApp(state, activeTrackerTab);
      return;
    }

    // Complete task (1-click)
    const completeBtn = e.target.closest('[data-complete-task]');
    if (completeBtn) {
      const res = completeTask(state, completeBtn.dataset.completeTask);
      if (!res) return;
      renderApp(state, activeTrackerTab);
      if (res.goalpostBonusTriggered) {
        showToast(`★ GOALPOST QUOTA REACHED! +${res.gainedTotalXp} XP (with Bonus!)`);
      } else {
        showToast(`+${res.gainedTotalXp} XP · ${res.taskTitle}`);
      }
      if (res.leveledUp) {
        setTimeout(() => showToast(`✦ LEVEL UP! You are now LV.${res.newLevel}!`), 350);
      }
      if (res.rankUps.length > 0) {
        setTimeout(() => showToast(`▲ RANK UP! ${res.rankUps.join(' · ')}`), 700);
      }
      return;
    }

    // Delete task
    const delTaskBtn = e.target.closest('[data-delete-task]');
    if (delTaskBtn) {
      if (confirm('Delete this task?')) {
        deleteTask(state, delTaskBtn.dataset.deleteTask);
        renderApp(state, activeTrackerTab);
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
        renderApp(state, activeTrackerTab);
        showToast(`Removed skill: ${sk.name}`);
      }
      return;
    }

    // Theme picker
    const themePick = e.target.closest('[data-theme-pick]');
    if (themePick) {
      state.settings.theme = themePick.dataset.themePick;
      saveState(state);
      renderApp(state, activeTrackerTab);
      populateConfigPage();
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
    renderApp(state, activeTrackerTab);
    showToast(`Added task: "${title}"`);
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
    closeAllModals();
    renderApp(state, activeTrackerTab);
    showToast(`−${res.penaltyXp} XP applied for "${title}"`, 'danger');
    if (res.rankDowns.length > 0) {
      setTimeout(() => showToast(`▼ RANK DOWN: ${res.rankDowns.join(' · ')}`, 'danger'), 350);
    }
  });

  // Add Skill
  document.getElementById('form-skill').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('skill-name').value.trim();
    const icon = document.getElementById('skill-icon').value.trim() || '✦';
    const linkedAbility = document.getElementById('skill-ability').value;
    if (!name) return;
    state.skills.push({ id: 'sk_' + Date.now(), name, icon, linkedAbility, xp: 0 });
    saveState(state);
    closeAllModals();
    renderApp(state, activeTrackerTab);
    showToast(`Added skill: ${icon} ${name}`);
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
    saveState(state);
    closeAllModals();
    renderApp(state, activeTrackerTab);
    showToast('Profile saved!');
  });

  // Live Custom Color Pickers
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
    renderApp(state, activeTrackerTab);
    populateConfigPage();
  });

  // Decay Settings
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
      renderApp(state, activeTrackerTab);
      populateConfigPage();
      showToast(`Health Connect linked! Imported ${summary.workoutsImported} workout(s).`);
    } catch (err) {
      showToast(err.message || 'Could not connect to Health Connect.', 'danger');
    }
  });

  document.getElementById('btn-hc-sync').addEventListener('click', async () => {
    try {
      const summary = await syncHealthConnect(state, 7);
      renderApp(state, activeTrackerTab);
      populateConfigPage();
      const parts = [];
      if (summary.weightUpdated) parts.push(`Weight → ${summary.newWeightKg}kg`);
      if (summary.bodyFatPct) parts.push(`BF ${summary.bodyFatPct}%`);
      if (summary.workoutsImported > 0) parts.push(`+${summary.workoutsImported} workout(s) (+${summary.totalFitnessXp} XP)`);
      showToast(parts.length ? `Health Connect: ${parts.join(' · ')}` : 'Health Connect synced — already up to date!');
    } catch (err) {
      showToast(err.message || 'Install Android APK for live Health Connect sync.', 'danger');
    }
  });

  document.getElementById('btn-hc-simulate').addEventListener('click', () => {
    const summary = applyHealthConnectData(state, {
      latestWeightKg: state.profile.weightKg || 72.4,
      latestBodyFatPct: 14.8,
      workouts: [
        {
          id: 'sim_hevy_' + Date.now(),
          title: 'Hevy — Push Day',
          durationMinutes: 62,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
        },
      ],
    });
    renderApp(state, activeTrackerTab);
    populateConfigPage();
    showToast(`Test Sync: BF ${summary.bodyFatPct}% · +${summary.workoutsImported} Hevy workout (+${summary.totalFitnessXp} Fitness XP)`);
  });

  // Optional Backup Inputs
  document.getElementById('backup-email').addEventListener('change', e => {
    state.settings.backup.email = e.target.value.trim();
    saveState(state);
  });
  document.getElementById('backup-drive-client').addEventListener('change', e => {
    state.settings.backup.driveClientId = e.target.value.trim();
    saveState(state);
  });

  // Email Backup
  document.getElementById('btn-backup-email').addEventListener('click', () => {
    const email = document.getElementById('backup-email').value.trim();
    state.settings.backup.email = email;
    state.settings.backup.lastBackupAt = new Date().toISOString();
    saveState(state);
    const filename = triggerEmailBackup(state, email);
    populateConfigPage();
    showToast(`Downloaded ${filename} & opened email draft!`);
  });

  // Zero-setup Google Drive Backup
  document.getElementById('btn-drive-quick').addEventListener('click', () => {
    const filename = downloadJsonBackup(state);
    state.settings.backup.lastBackupAt = new Date().toISOString();
    saveState(state);
    populateConfigPage();
    window.open('https://drive.google.com/drive/my-drive', '_blank', 'noopener');
    showToast(`Downloaded ${filename} — drop it into Google Drive!`);
  });

  // Optional Direct Google Drive OAuth Sync
  document.getElementById('btn-drive-upload').addEventListener('click', async () => {
    const clientId = document.getElementById('backup-drive-client').value.trim();
    state.settings.backup.driveClientId = clientId;
    saveState(state);
    try {
      await uploadBackupToDrive(state, clientId);
      state.settings.backup.lastBackupAt = new Date().toISOString();
      saveState(state);
      populateConfigPage();
      showToast('☁ Synced backup to Google Drive!');
    } catch (err) {
      showToast(err.message || 'Drive sync failed.', 'danger');
    }
  });

  document.getElementById('btn-drive-restore').addEventListener('click', async () => {
    const clientId = document.getElementById('backup-drive-client').value.trim();
    try {
      const restored = await restoreBackupFromDrive(clientId);
      state = restored;
      saveState(state);
      renderApp(state, activeTrackerTab);
      populateConfigPage();
      showToast('☁ Restored save from Google Drive!');
    } catch (err) {
      showToast(err.message || 'Drive restore failed.', 'danger');
    }
  });

  // Local JSON & Quick Transfer Code
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const filename = downloadJsonBackup(state);
    state.settings.backup.lastBackupAt = new Date().toISOString();
    saveState(state);
    populateConfigPage();
    showToast(`Exported ${filename}`);
  });

  document.getElementById('btn-copy-code').addEventListener('click', async () => {
    try {
      const code = encodeBackupCode(state);
      await navigator.clipboard.writeText(code);
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
      renderApp(state, activeTrackerTab);
      populateConfigPage();
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
        renderApp(state, activeTrackerTab);
        populateConfigPage();
        showToast('Save imported!');
      } catch {
        showToast('Invalid JSON file.', 'danger');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-fresh-start').addEventListener('click', () => {
    if (!confirm('Reset all stats, skills, and tasks back to Rank 1 & re-run setup?')) return;
    state = createFreshState(state.settings);
    saveState(state);
    switchPage('status');
    renderApp(state, activeTrackerTab);
    openSetupWizard(false);
  });
}

// =========================================================================
// STARTUP + SERVICE WORKER (OFFLINE CACHE & LIVE UPDATES)
// =========================================================================
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

bindEvents();
const decayEvents = runAutoDecayCheck(state);
renderApp(state, activeTrackerTab);

if (!state.setupCompleted) {
  openSetupWizard(false);
} else {
  if (decayEvents.length > 0) {
    const summary = decayEvents.map(d => `${d.ability} (−${d.loss} XP)`).join(', ');
    showToast(`▼ Auto-Decay triggered: ${summary}`, 'danger');
  }
  if (isNativeAndroid() && state.healthConnect?.connected) {
    syncHealthConnect(state, 7)
      .then(s => {
        if (s.weightUpdated || s.workoutsImported > 0) {
          renderApp(state, activeTrackerTab);
          showToast(`Health Connect auto-synced (+${s.workoutsImported} workout(s))`);
        }
      })
      .catch(() => {});
  }
}
