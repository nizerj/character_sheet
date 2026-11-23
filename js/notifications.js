// Native Android Local Notifications (Capacitor) + Web Notification Fallback

function getNativeNotif() {
  return window.Capacitor?.Plugins?.LocalNotifications || null;
}

export async function configureDailyReminder(enabled, timeStr = '20:00') {
  const native = getNativeNotif();
  const [hourStr, minStr] = (timeStr || '20:00').split(':');
  const hour = Math.max(0, Math.min(23, Number(hourStr) || 20));
  const minute = Math.max(0, Math.min(59, Number(minStr) || 0));

  if (native) {
    try {
      await native.cancel({ notifications: [{ id: 1001 }] });
      if (!enabled) return { ok: true, message: 'Daily reminder disabled.' };

      const perm = await native.requestPermissions();
      if (perm.display !== 'granted') {
        return { ok: false, message: 'Notification permission denied in Android settings.' };
      }

      await native.schedule({
        notifications: [
          {
            id: 1001,
            title: 'Life Sheet · Daily Check-In',
            body: 'Log your completed tasks, protect your streak, and avoid stat decay!',
            schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
          },
        ],
      });
      return { ok: true, message: `Daily Android reminder scheduled for ${timeStr}.` };
    } catch (err) {
      return { ok: false, message: err?.message || 'Could not schedule Android reminder.' };
    }
  }

  // Desktop Browser Web Notification fallback
  if (!enabled) return { ok: true, message: 'Reminder disabled.' };
  if ('Notification' in window) {
    const res = await Notification.requestPermission();
    if (res === 'granted') {
      return { ok: true, message: `Browser notifications enabled (active while tab is open; Android APK supports native daily push at ${timeStr}).` };
    }
  }
  return { ok: true, message: `Saved reminder preference (${timeStr}) — native daily push activates automatically on the Android APK.` };
}
