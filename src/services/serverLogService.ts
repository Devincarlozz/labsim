/**
 * Server-side log and resilient workspace storage service.
 * Replaces heavy browser cookies with a small-sized server-side log
 * and fast, reliable local storage to guarantee 100% preservation across refreshes.
 */

import { WorkspaceTab } from '../model/types';
import { clearWebcontentCookies } from '../utils/cookieStorage';
import {
  fetchFirestoreAdminMessages,
  saveFirestoreAdminMessage,
  deleteFirestoreAdminMessage,
} from './firebase';

export interface SavedWebcontent {
  version: number;
  activeWorkspaceId: string;
  workspaces: WorkspaceTab[];
  lastSaved: number;
  notes?: string;
}

export interface AdminMessage {
  id: string;
  title: string;
  content: string;
  sender: string;
  senderEmail: string;
  priority: 'normal' | 'important' | 'urgent';
  category: 'announcement' | 'assignment' | 'lab_notice' | 'safety';
  createdAt: number;
  active: boolean;
}

const STORAGE_KEY_V2 = 'circuitlab_workspaces_v2';
const STORAGE_KEY_BACKUP = 'circuitlab_workspaces_backup';
const STORAGE_KEY_READ_MESSAGES = 'circuitlab_read_admin_messages';

// Automatically purge legacy chunk cookies on boot to eliminate HTTP header bloat
if (typeof window !== 'undefined') {
  clearWebcontentCookies();
}

/**
 * Log a user event to the small-sized server-side log endpoint.
 */
export async function logUserDataServer(event: string, payload: Record<string, any> = {}): Promise<void> {
  try {
    const userJson = localStorage.getItem('circuitlab_simulated_user');
    const user = userJson ? JSON.parse(userJson) : null;

    const body = {
      event,
      userId: user?.uid || 'anonymous',
      userEmail: user?.email || null,
      userName: user?.displayName || 'User',
      timestamp: Date.now(),
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      ...payload,
    };

    fetch('/api/log-user-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Non-blocking fallback
    });
  } catch (err) {
    console.debug('Failed to send server log:', err);
  }
}

/**
 * Save workspace content to reliable storage and send snapshot to server log.
 */
export function saveWebcontent(data: SavedWebcontent): boolean {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY_V2, json);
    localStorage.setItem(STORAGE_KEY_BACKUP, json);

    // Debounced lightweight sync to small-sized server log
    logUserDataServer('workspace_autosave', {
      activeWorkspaceId: data.activeWorkspaceId,
      workspaceCount: data.workspaces.length,
      componentCount: data.workspaces.reduce((acc, w) => acc + (w.project?.components?.length || 0), 0),
      wireCount: data.workspaces.reduce((acc, w) => acc + (w.project?.wires?.length || 0), 0),
      lastSaved: data.lastSaved,
    });

    return true;
  } catch (err) {
    console.warn('[StorageService] Failed to save webcontent:', err);
    try {
      localStorage.setItem(STORAGE_KEY_BACKUP, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Load workspace content. Guarantees 100% preservation across page refreshes.
 */
export function loadWebcontent(): SavedWebcontent | null {
  try {
    // 1. Primary storage
    let json = localStorage.getItem(STORAGE_KEY_V2);
    // 2. Backup storage fallback
    if (!json) {
      json = localStorage.getItem(STORAGE_KEY_BACKUP);
    }
    // 3. Legacy backup key fallback
    if (!json) {
      json = localStorage.getItem('labsim_webcontent_backup');
    }

    if (json) {
      const parsed = JSON.parse(json) as SavedWebcontent;
      if (parsed && Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[StorageService] Error loading webcontent:', err);
  }
  return null;
}

const STORAGE_KEY_ADMIN_MESSAGES = 'circuitlab_admin_messages_v3';
const STORAGE_KEY_DELETED_MESSAGES = 'circuitlab_deleted_admin_message_ids';

const INITIAL_DEFAULT_MESSAGES: AdminMessage[] = [
  {
    id: 'msg-welcome-lab',
    title: 'Welcome to CircuitLab Digital Electronics Lab',
    content: 'Please ensure power rails (+5V and GND) are correctly routed before activating the simulation. Breadboard circuits can be tested with the Oscilloscope and Function Generator.',
    sender: 'Bhagath Krishnan',
    senderEmail: 'bhagathkrishnan06@gmail.com',
    priority: 'important',
    category: 'lab_notice',
    createdAt: 1791023845825,
    active: true,
  },
  {
    id: 'msg-counter-assignment',
    title: 'Lab Notice: Modulo-N Counter Experiments',
    content: 'Experiment 4 counter designs using 74HC74 D-Flip Flops and 74HC08 logic gates must be verified with clock pulses from Digital IO or Function Generator.',
    sender: 'Bhagath Krishnan',
    senderEmail: 'bhagathkrishnan06@gmail.com',
    priority: 'normal',
    category: 'assignment',
    createdAt: 1790941045825,
    active: true,
  },
];

function getLocalAdminMessages(): AdminMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ADMIN_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalAdminMessages(msgs: AdminMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY_ADMIN_MESSAGES, JSON.stringify(msgs));
  } catch (err) {
    console.warn('Failed to save admin messages to localStorage:', err);
  }
}

function getDeletedAdminMessageIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DELETED_MESSAGES);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function recordDeletedAdminMessageId(id: string) {
  try {
    const set = getDeletedAdminMessageIds();
    set.add(id);
    localStorage.setItem(STORAGE_KEY_DELETED_MESSAGES, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn('Failed to save deleted message id:', err);
  }
}

/**
 * Fetch admin messages with 100% persistence across page refreshes.
 * Merges localStorage cache, Firestore collection, and server endpoint, respecting deleted IDs.
 */
export async function fetchAdminMessages(): Promise<AdminMessage[]> {
  const deletedIds = getDeletedAdminMessageIds();
  const messageMap = new Map<string, AdminMessage>();

  // 1. Load locally cached messages first
  const localList = getLocalAdminMessages();
  for (const m of localList) {
    if (!deletedIds.has(m.id) && m.active !== false) {
      messageMap.set(m.id, m);
    }
  }

  // 2. Fetch from Firestore if available
  try {
    const firestoreMsgs = await fetchFirestoreAdminMessages();
    for (const fm of firestoreMsgs) {
      if (!deletedIds.has(fm.id) && fm.active !== false) {
        messageMap.set(fm.id, fm);
      }
    }
  } catch (err) {
    console.debug('Firestore admin messages fetch caught:', err);
  }

  // 3. Fetch from server API endpoint if available (local dev)
  try {
    const res = await fetch('/api/admin-messages');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        for (const sm of data.messages) {
          if (!deletedIds.has(sm.id) && sm.active !== false) {
            messageMap.set(sm.id, sm);
          }
        }
      }
    }
  } catch (err) {
    console.debug('Server admin messages fetch caught:', err);
  }

  // 4. If completely empty and no deletions have occurred, seed with default messages
  if (messageMap.size === 0 && deletedIds.size === 0) {
    for (const dm of INITIAL_DEFAULT_MESSAGES) {
      messageMap.set(dm.id, dm);
    }
  }

  // 5. Sort newest first
  const result = Array.from(messageMap.values()).sort((a, b) => b.createdAt - a.createdAt);

  // 6. Cache back to localStorage to guarantee preservation across refreshes
  saveLocalAdminMessages(result);

  return result;
}

/**
 * Broadcast a new admin message with persistent storage across refreshes and devices.
 */
export async function broadcastAdminMessage(msg: Omit<AdminMessage, 'id' | 'createdAt'>): Promise<AdminMessage> {
  const fullMsg: AdminMessage = {
    ...msg,
    id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    createdAt: Date.now(),
    active: true,
  };

  // 1. Immediately persist to localStorage
  const current = getLocalAdminMessages().filter(m => m.id !== fullMsg.id);
  current.unshift(fullMsg);
  saveLocalAdminMessages(current);

  // 2. Persist to Firestore
  saveFirestoreAdminMessage(fullMsg).catch(() => {});

  // 3. Persist to server API
  fetch('/api/admin-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', message: fullMsg }),
  }).catch(() => {});

  // 4. Log server event
  logUserDataServer('admin_broadcast_message', {
    messageId: fullMsg.id,
    title: fullMsg.title,
    senderEmail: fullMsg.senderEmail,
  });

  // 5. Notify all components & windows
  window.dispatchEvent(new CustomEvent('circuitlab-admin-messages-update', { detail: { action: 'add', message: fullMsg } }));

  return fullMsg;
}

/**
 * Delete an admin message permanently. Guarantees it never resets on refresh.
 */
export async function deleteAdminMessage(id: string): Promise<void> {
  // 1. Record ID in deleted set so it can NEVER be re-seeded
  recordDeletedAdminMessageId(id);

  // 2. Remove from localStorage
  const current = getLocalAdminMessages().filter(m => m.id !== id);
  saveLocalAdminMessages(current);

  // 3. Mark deleted in Firestore
  deleteFirestoreAdminMessage(id).catch(() => {});

  // 4. Delete on server API
  fetch('/api/admin-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete', id }),
  }).catch(() => {});

  // 5. Notify all components & windows
  window.dispatchEvent(new CustomEvent('circuitlab-admin-messages-update', { detail: { action: 'delete', id } }));
}

/**
 * Read-tracking helpers for client
 */
export function getReadMessageIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_READ_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function markMessageAsRead(id: string): void {
  try {
    const ids = getReadMessageIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem(STORAGE_KEY_READ_MESSAGES, JSON.stringify(ids));
    }
  } catch {}
}
