// Built-In Focus / Pomodoro Timer Engine

let timerInterval = null;
let totalSeconds = 25 * 60;
let remainingSeconds = 25 * 60;
let running = false;
let currentConfig = {
  minutes: 25,
  label: 'Deep Focus Session',
  abilityId: 'productivity',
  skillId: '',
  taskId: '',
};
let onTickCb = null;
let onCompleteCb = null;

export function formatTime(sec) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.floor(Math.max(0, sec) % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getTimerState() {
  return {
    running,
    totalSeconds,
    remainingSeconds,
    elapsedMinutes: Math.max(1, Math.round((totalSeconds - remainingSeconds) / 60)),
    pct: totalSeconds > 0 ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0,
    config: { ...currentConfig },
  };
}

export function configureTimer({ minutes = 25, label = 'Deep Focus Session', abilityId = 'productivity', skillId = '', taskId = '' }) {
  stopTimer();
  const mins = Math.max(1, Math.min(180, Number(minutes) || 25));
  currentConfig = { minutes: mins, label, abilityId, skillId, taskId };
  totalSeconds = mins * 60;
  remainingSeconds = totalSeconds;
  if (onTickCb) onTickCb(getTimerState());
}

export function startTimer(onTick, onComplete) {
  onTickCb = onTick;
  onCompleteCb = onComplete;
  if (running) return;
  if (remainingSeconds <= 0) remainingSeconds = totalSeconds;
  running = true;
  if (onTickCb) onTickCb(getTimerState());

  timerInterval = setInterval(() => {
    remainingSeconds = Math.max(0, remainingSeconds - 1);
    document.title = `${formatTime(remainingSeconds)} · Focus — STATUS`;
    if (onTickCb) onTickCb(getTimerState());
    if (remainingSeconds <= 0) {
      finishTimer(true);
    }
  }, 1000);
}

export function pauseTimer() {
  running = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  document.title = 'STATUS — Character Sheet';
  if (onTickCb) onTickCb(getTimerState());
}

export function stopTimer() {
  pauseTimer();
  remainingSeconds = totalSeconds;
  if (onTickCb) onTickCb(getTimerState());
}

export function finishTimer(completedFull = false) {
  const elapsedSec = totalSeconds - remainingSeconds;
  const minsDone = completedFull ? currentConfig.minutes : Math.max(1, Math.round(elapsedSec / 60));
  pauseTimer();
  remainingSeconds = totalSeconds;
  if (onTickCb) onTickCb(getTimerState());
  if (onCompleteCb) {
    onCompleteCb({
      ...currentConfig,
      minutesCompleted: minsDone,
      completedFull,
    });
  }
}
