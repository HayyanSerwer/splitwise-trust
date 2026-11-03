// Remembers the last server opened so a fresh launch of the app goes straight
// back to it. localStorage survives the app being closed; the sessionStorage
// flag means it only happens once per launch, so "all servers" still works.
const KEY = 'hb_last_guild';
const RESTORED = 'hb_restored';

export function rememberServer(guildId) {
  try { localStorage.setItem(KEY, guildId); } catch {}
}

export function forgetServer() {
  try { localStorage.removeItem(KEY); } catch {}
}

// Returns the server to reopen, or null if this launch already restored one.
export function serverToRestore() {
  try {
    if (sessionStorage.getItem(RESTORED)) return null;
    sessionStorage.setItem(RESTORED, '1');
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
