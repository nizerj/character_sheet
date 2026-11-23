// Pure Web Audio API RPG Sound Effects & Edgy Cut-In Banner Controller

let audioCtx = null;
let muted = false;

function ctx() {
  if (muted) return null;
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

export function setAudioMuted(isMuted) {
  muted = Boolean(isMuted);
}

function tone(freq, startOffset, duration, type = 'triangle', gainPeak = 0.12) {
  const c = ctx();
  if (!c) return;
  const now = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export const sfx = {
  click() {
    tone(640, 0, 0.045, 'square', 0.04);
  },
  taskDone() {
    tone(523.25, 0, 0.09, 'triangle', 0.11);
    tone(659.25, 0.07, 0.11, 'triangle', 0.11);
    tone(783.99, 0.14, 0.16, 'triangle', 0.12);
  },
  bossHit() {
    tone(190, 0, 0.08, 'sawtooth', 0.14);
    tone(120, 0.05, 0.12, 'square', 0.12);
    tone(440, 0.08, 0.09, 'triangle', 0.08);
  },
  bossWin() {
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, i * 0.08, 0.22, 'triangle', 0.13);
    });
  },
  levelUp() {
    [440, 554.37, 659.25, 880, 1108.73].forEach((f, i) => {
      tone(f, i * 0.075, 0.24, 'triangle', 0.14);
    });
  },
  rankUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(f, i * 0.09, 0.26, 'sawtooth', 0.09);
    });
  },
  achievement() {
    tone(587.33, 0, 0.1, 'triangle', 0.11);
    tone(880, 0.09, 0.12, 'triangle', 0.12);
    tone(1174.66, 0.18, 0.24, 'triangle', 0.13);
  },
  penalty() {
    tone(220, 0, 0.14, 'sawtooth', 0.1);
    tone(165, 0.12, 0.22, 'sawtooth', 0.1);
  },
  timerDone() {
    tone(659.25, 0, 0.14, 'sine', 0.14);
    tone(880, 0.16, 0.14, 'sine', 0.14);
    tone(1046.5, 0.32, 0.35, 'sine', 0.15);
  },
};

// Stylized non-blocking Cut-In Banner
const cutInQueue = [];
let cutInActive = false;

export function showCutIn({ kicker = 'MILESTONE', title, subtitle = '', variant = 'gold', badgeUrl = null }) {
  cutInQueue.push({ kicker, title, subtitle, variant, badgeUrl });
  if (!cutInActive) playNextCutIn();
}

function playNextCutIn() {
  if (cutInQueue.length === 0) {
    cutInActive = false;
    return;
  }
  cutInActive = true;
  const item = cutInQueue.shift();
  const el = document.getElementById('cutin-overlay');
  if (!el) {
    cutInActive = false;
    return;
  }

  el.className = `cutin-overlay open variant-${item.variant}`;
  document.getElementById('cutin-kicker').textContent = item.kicker;
  document.getElementById('cutin-title').textContent = item.title;
  document.getElementById('cutin-sub').textContent = item.subtitle;

  const badgeImg = document.getElementById('cutin-badge');
  if (item.badgeUrl) {
    badgeImg.src = item.badgeUrl;
    badgeImg.style.display = 'block';
  } else {
    badgeImg.style.display = 'none';
  }

  const dismiss = () => {
    el.classList.remove('open');
    el.onclick = null;
    setTimeout(playNextCutIn, 240);
  };

  el.onclick = dismiss;
  setTimeout(() => {
    if (el.classList.contains('open')) dismiss();
  }, 2600);
}
