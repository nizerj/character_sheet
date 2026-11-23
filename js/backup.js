import { todayKey } from './state.js';

const DRIVE_FILENAME = 'status-sheet-backup.json';

export function downloadJsonBackup(state) {
  const filename = `status-sheet-${todayKey()}.json`;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return filename;
}

export function encodeBackupCode(state) {
  // Exclude large avatar data URL if > 60KB to keep text code copy-friendly, or keep full JSON if small
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach(b => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export function decodeBackupCode(code) {
  const clean = code.trim();
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json);
  if (!parsed || !parsed.profile || !parsed.abilities) {
    throw new Error('Invalid backup code structure');
  }
  return parsed;
}

export function triggerEmailBackup(state, email) {
  const filename = downloadJsonBackup(state);
  const to = encodeURIComponent((email || '').trim());
  const subject = encodeURIComponent(`Character Sheet Backup — ${todayKey()}`);

  // If save is small enough (< 1500 chars without photo), include compact code in email body too
  const liteCopy = { ...state, profile: { ...state.profile, avatarDataUrl: null } };
  const liteCode = encodeBackupCode(liteCopy);

  let bodyText =
    `Character Sheet Backup (${todayKey()})\n` +
    `Player: ${state.profile.name || 'Player'} | Total XP: ${state.totalXp}\n\n` +
    `1) Attach the downloaded file "${filename}" to this email to keep your full backup (including portrait photo).\n`;

  if (liteCode.length < 1600) {
    bodyText += `\n2) Or paste this quick restore code in Config -> Restore Backup Code (stats/skills/tasks without photo):\n\n${liteCode}\n`;
  }

  const mailto = `mailto:${to}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  window.location.href = mailto;
  return filename;
}

// --- OPTIONAL DIRECT GOOGLE DRIVE SYNC (GOOGLE IDENTITY SERVICES + DRIVE v3 REST) ---
let gsiLoaded = false;

function loadGsiScript() {
  if (gsiLoaded || window.google?.accounts?.oauth2) {
    gsiLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => {
      gsiLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error('Could not load Google Identity Services (check internet connection).'));
    document.head.appendChild(s);
  });
}

async function getDriveAccessToken(clientId) {
  if (!clientId || !clientId.trim()) {
    throw new Error('Enter a Google OAuth Client ID first, or use the zero-setup Download for Drive button.');
  }
  await loadGsiScript();
  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId.trim(),
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: resp => {
        if (resp.error) reject(new Error(resp.error));
        else resolve(resp.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

async function findDriveBackupFile(token) {
  const q = encodeURIComponent(`name='${DRIVE_FILENAME}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to query Google Drive.');
  const data = await res.json();
  return data.files?.[0] || null;
}

export async function uploadBackupToDrive(state, clientId) {
  const token = await getDriveAccessToken(clientId);
  const existing = await findDriveBackupFile(token);

  const metadata = { name: DRIVE_FILENAME, mimeType: 'application/json' };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  body.append('file', new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));

  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await fetch(url, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) throw new Error('Google Drive upload failed.');
  return await res.json();
}

export async function restoreBackupFromDrive(clientId) {
  const token = await getDriveAccessToken(clientId);
  const existing = await findDriveBackupFile(token);
  if (!existing) throw new Error(`No "${DRIVE_FILENAME}" found in your Google Drive.`);

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to download backup from Google Drive.');
  const parsed = await res.json();
  if (!parsed || !parsed.profile || !parsed.abilities) {
    throw new Error('Drive backup file is invalid.');
  }
  return parsed;
}
