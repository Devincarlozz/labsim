/**
 * Cookie-based webcontent storage utility.
 * Supports chunking for payloads exceeding browser per-cookie size limits (4KB),
 * safe URI encoding, expiration management, and local fallback mirroring.
 */

import { WorkspaceTab } from '../model/types';

export interface SavedWebcontent {
  version: number;
  activeWorkspaceId: string;
  workspaces: WorkspaceTab[];
  lastSaved: number;
  notes?: string;
}

const CHUNK_SIZE = 2800; // Safe length per cookie under the 4096-byte limit
const CHUNK_PREFIX = 'labsim_chunk_';
const META_COOKIE = 'labsim_meta';
const BACKUP_STORAGE_KEY = 'labsim_webcontent_backup';

/**
 * Standard cookie setter with path, expiration, and SameSite attribute.
 */
export function setCookie(name: string, value: string, days = 365): void {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (err) {
    console.warn(`[CookieStorage] Failed to set cookie "${name}":`, err);
  }
}

/**
 * Standard cookie getter.
 */
export function getCookie(name: string): string | null {
  try {
    const prefix = `${name}=`;
    const cookies = document.cookie.split(';');
    for (let c of cookies) {
      c = c.trim();
      if (c.startsWith(prefix)) {
        return decodeURIComponent(c.substring(prefix.length));
      }
    }
  } catch (err) {
    console.warn(`[CookieStorage] Failed to get cookie "${name}":`, err);
  }
  return null;
}

/**
 * Delete a cookie by setting expiration in the past.
 */
export function deleteCookie(name: string): void {
  try {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch (err) {
    console.warn(`[CookieStorage] Failed to delete cookie "${name}":`, err);
  }
}

/**
 * Clean, lightweight serialization of saved webcontent.
 */
export function saveWebcontentToCookies(data: SavedWebcontent): boolean {
  try {
    const json = JSON.stringify(data);
    const totalLength = json.length;
    const chunkCount = Math.ceil(totalLength / CHUNK_SIZE);

    // Read previous chunk count to clean up any obsolete chunk cookies
    const oldMeta = getCookie(META_COOKIE);
    if (oldMeta) {
      try {
        const metaObj = JSON.parse(oldMeta);
        const oldChunks = typeof metaObj.chunks === 'number' ? metaObj.chunks : 0;
        for (let i = chunkCount; i < oldChunks; i++) {
          deleteCookie(`${CHUNK_PREFIX}${i}`);
        }
      } catch {
        // Old meta wasn't JSON, clean first 10 just in case
        for (let i = chunkCount; i < 10; i++) {
          deleteCookie(`${CHUNK_PREFIX}${i}`);
        }
      }
    }

    // Write chunks to document.cookie
    for (let i = 0; i < chunkCount; i++) {
      const chunk = json.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      setCookie(`${CHUNK_PREFIX}${i}`, chunk);
    }

    // Save metadata cookie
    const metaPayload = JSON.stringify({
      chunks: chunkCount,
      bytes: totalLength,
      lastSaved: data.lastSaved,
      activeWorkspaceId: data.activeWorkspaceId,
      workspaceCount: data.workspaces.length,
    });
    setCookie(META_COOKIE, metaPayload);
    setCookie('labsim_saved_timestamp', String(data.lastSaved));

    // Secondary backup in localStorage for resiliency
    try {
      localStorage.setItem(BACKUP_STORAGE_KEY, json);
    } catch {
      // Ignore localStorage quotas if restricted
    }

    return true;
  } catch (err) {
    console.error('[CookieStorage] Failed to save webcontent to cookies:', err);
    return false;
  }
}

/**
 * Load and reassemble saved webcontent from document.cookie chunks.
 */
export function loadWebcontentFromCookies(): SavedWebcontent | null {
  try {
    const metaStr = getCookie(META_COOKIE);
    let json = '';

    if (metaStr) {
      try {
        const meta = JSON.parse(metaStr);
        const chunkCount = typeof meta.chunks === 'number' ? meta.chunks : 1;
        let allChunksFound = true;

        for (let i = 0; i < chunkCount; i++) {
          const chunk = getCookie(`${CHUNK_PREFIX}${i}`);
          if (chunk === null) {
            allChunksFound = false;
            break;
          }
          json += chunk;
        }

        if (!allChunksFound) {
          json = '';
        }
      } catch {
        // meta was invalid
      }
    }

    // Fallback: check unchunked legacy cookie
    if (!json) {
      const legacy = getCookie('labsim_webcontent');
      if (legacy) json = legacy;
    }

    // Resiliency fallback: check localStorage mirror
    if (!json) {
      try {
        const backup = localStorage.getItem(BACKUP_STORAGE_KEY);
        if (backup) json = backup;
      } catch {
        // Ignore
      }
    }

    if (!json) return null;

    const parsed = JSON.parse(json) as SavedWebcontent;
    if (parsed && Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('[CookieStorage] Failed to parse webcontent from cookies:', err);
  }
  return null;
}

/**
 * Delete all cookies associated with labsim webcontent.
 */
export function clearWebcontentCookies(): void {
  try {
    const metaStr = getCookie(META_COOKIE);
    let chunkCount = 10;
    if (metaStr) {
      try {
        const meta = JSON.parse(metaStr);
        if (typeof meta.chunks === 'number') chunkCount = meta.chunks;
      } catch {
        // ignore
      }
    }

    for (let i = 0; i < Math.max(chunkCount, 15); i++) {
      deleteCookie(`${CHUNK_PREFIX}${i}`);
    }
    deleteCookie(META_COOKIE);
    deleteCookie('labsim_saved_timestamp');
    deleteCookie('labsim_webcontent');

    try {
      localStorage.removeItem(BACKUP_STORAGE_KEY);
    } catch {
      // ignore
    }
  } catch (err) {
    console.warn('[CookieStorage] Error clearing cookies:', err);
  }
}

/**
 * Quick status helper about cookies.
 */
export function getCookieStorageStatus(): {
  isSupported: boolean;
  hasSavedData: boolean;
  lastSaved: number | null;
  chunkCount: number;
} {
  const isSupported = typeof document !== 'undefined' && typeof document.cookie === 'string';
  const metaStr = getCookie(META_COOKIE);
  let hasSavedData = false;
  let lastSaved: number | null = null;
  let chunkCount = 0;

  if (metaStr) {
    try {
      const meta = JSON.parse(metaStr);
      hasSavedData = true;
      lastSaved = typeof meta.lastSaved === 'number' ? meta.lastSaved : null;
      chunkCount = typeof meta.chunks === 'number' ? meta.chunks : 1;
    } catch {
      hasSavedData = true;
    }
  }

  return { isSupported, hasSavedData, lastSaved, chunkCount };
}
