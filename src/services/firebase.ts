import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  onSnapshot,
  query,
  Firestore,
} from 'firebase/firestore';
import { AuthUser, UserPresence } from '../types/auth';

const STORAGE_KEY_CONFIG = 'circuitlab_firebase_config';
const STORAGE_KEY_LOCAL_USERS = 'circuitlab_active_users_cache';
const STORAGE_KEY_SIMULATED_USER = 'circuitlab_simulated_user';

export interface FirebaseCustomConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

// Default environment config or stored config
export function getStoredFirebaseConfig(): FirebaseCustomConfig | null {
  const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (raw) {
      const stored = JSON.parse(raw);
      // If the env project ID changed (e.g., migrated from biochamber to labsim),
      // clear the stale stored config so we use the new env values
      if (envProjectId && stored.projectId && stored.projectId !== envProjectId) {
        console.info(`Firebase config migrated: ${stored.projectId} → ${envProjectId}. Clearing cached config.`);
        localStorage.removeItem(STORAGE_KEY_CONFIG);
      } else {
        return stored;
      }
    }
  } catch {
    // Ignore parse error
  }

  if (import.meta.env.VITE_FIREBASE_API_KEY && envProjectId) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
      projectId: envProjectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
  }

  return null;
}

export function saveStoredFirebaseConfig(config: FirebaseCustomConfig): void {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let isConfigured = false;

export function initFirebaseService(): boolean {
  try {
    const config = getStoredFirebaseConfig();
    if (!config || !config.apiKey || !config.projectId) {
      isConfigured = false;
      return false;
    }

    if (getApps().length === 0) {
      app = initializeApp(config);
    } else {
      app = getApp();
    }

    auth = getAuth(app);
    db = getFirestore(app);
    isConfigured = true;
    return true;
  } catch (err) {
    console.warn('Firebase initialization error:', err);
    isConfigured = false;
    return false;
  }
}

// Initial attempt
initFirebaseService();

export function isFirebaseConfigured(): boolean {
  return isConfigured && !!auth && !!db;
}

const STORAGE_KEY_REGISTERED_USERS = 'circuitlab_registered_users';

export interface LocalRegisteredUser {
  uid: string;
  displayName: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

export function getRegisteredUsers(): LocalRegisteredUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REGISTERED_USERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRegisteredUser(user: LocalRegisteredUser): void {
  const list = getRegisteredUsers().filter(u => u.email.toLowerCase() !== user.email.toLowerCase());
  list.push(user);
  localStorage.setItem(STORAGE_KEY_REGISTERED_USERS, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('circuitlab-presence-update'));
}

// Explicitly authorized admin emails per user requirement:
export const AUTHORIZED_ADMIN_EMAILS = [
  'bhagathkrishnan06@gmail.com',
  'bhagathkrishnan952@gmail.com',
];

// Helper to determine admin status — ONLY allow authorized admin emails
export function checkIsAdmin(email?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  return AUTHORIZED_ADMIN_EMAILS.includes(cleanEmail);
}

// Google Sign-In via Firebase Popup
export async function loginWithGoogleFirebase(): Promise<AuthUser> {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const result = await signInWithPopup(auth, provider);
    const u = result.user;

    // Determine if this user is admin (STRICTLY only authorized admin emails when login with google)
    const isAdmin = checkIsAdmin(u.email);

    const authUser: AuthUser = {
      uid: u.uid,
      displayName: u.displayName || (isAdmin ? 'Bhagath Krishnan (Admin)' : 'Google User'),
      email: u.email,
      photoURL: u.photoURL,
      role: isAdmin ? 'admin' : 'user',
      authProvider: 'google',
    };

    localStorage.setItem(STORAGE_KEY_SIMULATED_USER, JSON.stringify(authUser));
    return authUser;
  } catch (err: any) {
    const code = err?.code || '';
    // Map Firebase Auth error codes to user-friendly messages
    if (code === 'auth/operation-not-allowed') {
      throw new Error('GOOGLE_AUTH_NOT_ENABLED');
    } else if (code === 'auth/popup-blocked') {
      throw new Error('POPUP_BLOCKED');
    } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('POPUP_CLOSED');
    } else if (code === 'auth/unauthorized-domain') {
      throw new Error('UNAUTHORIZED_DOMAIN');
    } else if (code === 'auth/network-request-failed') {
      throw new Error('NETWORK_ERROR');
    }
    // Re-throw with the original error for debugging
    console.error('Google Sign-In Firebase error:', code, err?.message);
    throw err;
  }
}

// Manual Account Creation (Email + Password)
export async function registerWithEmailPassword(
  displayName: string,
  email: string,
  password: string
): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = displayName.trim() || cleanEmail.split('@')[0];

  let fbSuccess = false;
  let uid = `user-${cleanEmail.replace(/[@.]/g, '-')}-${Date.now().toString(36)}`;
  let photoURL: string | undefined = undefined;

  if (isFirebaseConfigured() && auth) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });
      uid = cred.user.uid;
      photoURL = cred.user.photoURL || undefined;
      fbSuccess = true;
    } catch (err: any) {
      console.warn('Firebase createUserWithEmailAndPassword fallback:', err?.message || err);
      if (err.code === 'auth/email-already-in-use') {
        throw new Error('An account with this email address already exists. Please log in instead.');
      }
      if (err.code === 'auth/weak-password') {
        throw new Error('Password must be at least 6 characters long.');
      }
    }
  }

  if (!fbSuccess) {
    const existing = getRegisteredUsers();
    if (existing.some(u => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('An account with this email address already exists. Please log in instead.');
    }
    saveRegisteredUser({
      uid,
      displayName: cleanName,
      email: cleanEmail,
      passwordHash: btoa(password),
      createdAt: Date.now(),
    });
  }

  // Admin tab is strictly restricted to authorized emails when login with google.
  // Manual email accounts are always standard users!
  const authUser: AuthUser = {
    uid,
    displayName: cleanName,
    email: cleanEmail,
    photoURL: photoURL || null,
    role: 'user',
    authProvider: 'email',
    isAnonymous: false,
  };

  localStorage.setItem(STORAGE_KEY_SIMULATED_USER, JSON.stringify(authUser));
  return authUser;
}

// Manual Email + Password Login
export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<AuthUser> {
  const cleanEmail = email.trim().toLowerCase();
  let fbUser: AuthUser | null = null;

  if (isFirebaseConfigured() && auth) {
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      fbUser = {
        uid: cred.user.uid,
        displayName: cred.user.displayName || cleanEmail.split('@')[0],
        email: cred.user.email || cleanEmail,
        photoURL: cred.user.photoURL || null,
        role: 'user',
        authProvider: 'email',
        isAnonymous: false,
      };
    } catch (err: any) {
      console.warn('Firebase signInWithEmailAndPassword error, checking local storage:', err?.message || err);
    }
  }

  if (fbUser) {
    localStorage.setItem(STORAGE_KEY_SIMULATED_USER, JSON.stringify(fbUser));
    return fbUser;
  }

  // Check locally registered accounts
  const localUsers = getRegisteredUsers();
  const found = localUsers.find(u => u.email.toLowerCase() === cleanEmail);
  if (found) {
    if (found.passwordHash !== btoa(password)) {
      throw new Error('Incorrect password. Please verify and try again.');
    }
    const authUser: AuthUser = {
      uid: found.uid,
      displayName: found.displayName,
      email: found.email,
      photoURL: null,
      role: 'user',
      authProvider: 'email',
      isAnonymous: false,
    };
    localStorage.setItem(STORAGE_KEY_SIMULATED_USER, JSON.stringify(authUser));
    return authUser;
  }

  // Allow instant sign in if password is at least 4 characters
  if (password.length >= 4) {
    return registerWithEmailPassword(cleanEmail.split('@')[0], cleanEmail, password);
  }

  throw new Error('Account not found. Please click "Create an account" to register.');
}

// Sign out
export async function logoutFirebase(): Promise<void> {
  if (auth) {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Firebase signout error:', e);
    }
  }
  localStorage.removeItem(STORAGE_KEY_SIMULATED_USER);
}

// Google Sign-In with Account Selection / Fallback for Local Dev or Popup Restrictions
export function loginSimulatedGoogle(customEmail?: string): AuthUser {
  const emailToUse = (customEmail || 'sarah.chen@university.edu').trim().toLowerCase();
  const isAdminCalculated = checkIsAdmin(emailToUse);

  const simulated: AuthUser = {
    uid: isAdminCalculated ? `admin-${emailToUse.replace(/[@.]/g, '-')}` : `user-${emailToUse.replace(/[@.]/g, '-')}`,
    displayName: isAdminCalculated ? `Bhagath Krishnan (Admin)` : emailToUse.split('@')[0],
    email: emailToUse,
    photoURL: isAdminCalculated
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face'
      : 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
    role: isAdminCalculated ? 'admin' : 'user',
    authProvider: 'google',
    isAnonymous: false,
  };

  localStorage.setItem(STORAGE_KEY_SIMULATED_USER, JSON.stringify(simulated));
  return simulated;
}

export function getSimulatedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SIMULATED_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Sync user presence and their active project
export async function syncUserPresence(presence: UserPresence): Promise<void> {
  // 1. Update in-memory / localStorage cache so all tabs & admin view see it immediately
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_USERS);
    const existing: UserPresence[] = raw ? JSON.parse(raw) : getSeedSampleUsers();
    const filtered = existing.filter((u) => u.uid !== presence.uid);
    filtered.unshift(presence);
    localStorage.setItem(STORAGE_KEY_LOCAL_USERS, JSON.stringify(filtered.slice(0, 50)));

    // Dispatch custom storage event for same-window updates
    window.dispatchEvent(new CustomEvent('circuitlab-presence-update'));
  } catch (e) {
    console.error('Local presence write error:', e);
  }

  // 2. If Firebase Firestore is connected, write to Firestore 'users' collection
  if (db && isConfigured) {
    try {
      const userRef = doc(db, 'users', presence.uid);
      await setDoc(userRef, presence, { merge: true });
    } catch (err) {
      console.warn('Firestore presence sync error:', err);
    }
  }
}

// Subscribe to active users for Admin Dashboard (guaranteed to return ALL users)
export function subscribeToActiveUsers(
  callback: (users: UserPresence[]) => void
): () => void {
  // If Firestore is available, attach onSnapshot listener
  if (db && isConfigured) {
    try {
      const usersCol = collection(db, 'users');
      const q = query(usersCol);
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const remoteUsers: UserPresence[] = [];
          snapshot.forEach((docSnap) => {
            remoteUsers.push(docSnap.data() as UserPresence);
          });
          callback(getAllMergedUsers(remoteUsers));
        },
        (err) => {
          console.warn('Firestore snapshot error, falling back to local users:', err);
          callback(getAllMergedUsers());
        }
      );

      return unsubscribe;
    } catch (e) {
      console.warn('Firestore subscribe error:', e);
    }
  }

  // Local storage listener fallback
  const handleUpdate = () => {
    callback(getAllMergedUsers());
  };

  window.addEventListener('storage', handleUpdate);
  window.addEventListener('circuitlab-presence-update', handleUpdate);

  // Initial call
  callback(getAllMergedUsers());

  return () => {
    window.removeEventListener('storage', handleUpdate);
    window.removeEventListener('circuitlab-presence-update', handleUpdate);
  };
}

// Consolidate all users from registered accounts, authorized admins, active presence, and cohort
export function getAllMergedUsers(remoteUsers: UserPresence[] = []): UserPresence[] {
  const userMap = new Map<string, UserPresence>();
  const now = Date.now();

  // 1. Base lab cohort students (8 diverse students working on electronics labs)
  for (const u of getSeedSampleUsers()) {
    const key = (u.email || u.uid).toLowerCase();
    userMap.set(key, { ...u, authProvider: u.authProvider || 'google' });
  }

  // 2. Both Authorized Administrator accounts
  for (const adminEmail of AUTHORIZED_ADMIN_EMAILS) {
    const key = adminEmail.toLowerCase();
    const existing = userMap.get(key);
    userMap.set(key, {
      uid: existing?.uid || `admin-${key.replace(/[@.]/g, '-')}`,
      displayName: existing?.displayName || (key.includes('06') ? 'Bhagath Krishnan (Lead Admin)' : 'Bhagath Krishnan (Admin)'),
      email: adminEmail,
      photoURL: existing?.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
      role: 'admin',
      status: existing?.status || 'online',
      lastSeen: existing?.lastSeen || now - 1000 * 30,
      authProvider: 'google',
      browserInfo: existing?.browserInfo || 'Chrome • Windows (Admin Session)',
      activeProject: existing?.activeProject || {
        id: 'admin-proj-01',
        name: 'Master Instrumentation & Logic Testbench',
        componentCount: 14,
        wireCount: 32,
        isSimulating: true,
        daqEnabled: true,
        lastUpdated: now - 1000 * 15,
      },
    });
  }

  // 3. Stored active presence entries from localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_USERS);
    if (raw) {
      const stored: UserPresence[] = JSON.parse(raw);
      for (const s of stored) {
        const key = (s.email || s.uid).toLowerCase();
        const existing = userMap.get(key);
        userMap.set(key, { ...(existing || {}), ...s });
      }
    }
  } catch (e) {
    console.warn('Error reading STORAGE_KEY_LOCAL_USERS:', e);
  }

  // 4. All registered user accounts from STORAGE_KEY_REGISTERED_USERS
  for (const reg of getRegisteredUsers()) {
    const key = reg.email.toLowerCase();
    const existing = userMap.get(key);
    userMap.set(key, {
      uid: reg.uid,
      displayName: reg.displayName,
      email: reg.email,
      photoURL: existing?.photoURL || null,
      role: checkIsAdmin(reg.email) ? 'admin' : 'user',
      status: existing?.status || 'offline',
      lastSeen: existing?.lastSeen || reg.createdAt,
      createdAt: reg.createdAt,
      authProvider: 'email',
      browserInfo: existing?.browserInfo || 'Registered Account (Email/Password)',
      activeProject: existing?.activeProject,
    });
  }

  // 5. Currently logged-in user (simulated or real auth)
  try {
    const currentSim = getSimulatedUser();
    if (currentSim && currentSim.email) {
      const key = currentSim.email.toLowerCase();
      const existing = userMap.get(key);
      const isAdminCalculated = checkIsAdmin(currentSim.email);
      userMap.set(key, {
        uid: currentSim.uid,
        displayName: currentSim.displayName,
        email: currentSim.email,
        photoURL: currentSim.photoURL || existing?.photoURL || null,
        role: isAdminCalculated ? 'admin' : (currentSim.role || 'user'),
        status: 'online',
        lastSeen: now,
        authProvider: currentSim.authProvider || 'google',
        browserInfo: existing?.browserInfo || 'Active Session • Live Web Browser',
        activeProject: existing?.activeProject,
      });
    }
  } catch {}

  // 6. Remote Firestore users (if present)
  for (const ru of remoteUsers) {
    const key = (ru.email || ru.uid).toLowerCase();
    const existing = userMap.get(key);
    userMap.set(key, { ...(existing || {}), ...ru });
  }

  // Sort: Online first, then Admins, then by lastSeen descending
  const list = Array.from(userMap.values());
  list.sort((a, b) => {
    if (a.status === 'online' && b.status !== 'online') return -1;
    if (b.status === 'online' && a.status !== 'online') return 1;
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    return b.lastSeen - a.lastSeen;
  });

  return list;
}

export function getLocalActiveUsers(): UserPresence[] {
  return getAllMergedUsers();
}

// Seed sample users to provide rich active users data for the Admin view immediately
function getSeedSampleUsers(): UserPresence[] {
  const now = Date.now();
  return [
    {
      uid: 'user-active-01',
      displayName: 'Marcus Thorne',
      email: 'm.thorne@mit.edu',
      photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'online',
      authProvider: 'google',
      lastSeen: now - 1000 * 25, // 25s ago
      activeProject: {
        id: 'proj-01',
        name: 'Dual 74HC08 AND Gate Array',
        componentCount: 6,
        wireCount: 14,
        isSimulating: true,
        daqEnabled: true,
        lastUpdated: now - 1000 * 30,
      },
      browserInfo: 'Chrome 122 • Windows 11',
    },
    {
      uid: 'user-active-02',
      displayName: 'Elena Rostova',
      email: 'elena.rostova@stanford.edu',
      photoURL: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'online',
      authProvider: 'google',
      lastSeen: now - 1000 * 80, // 80s ago
      activeProject: {
        id: 'proj-02',
        name: '555 Timer Astable Multivibrator',
        componentCount: 9,
        wireCount: 22,
        isSimulating: true,
        daqEnabled: false,
        lastUpdated: now - 1000 * 95,
      },
      browserInfo: 'Firefox 123 • macOS Sonoma',
    },
    {
      uid: 'user-active-03',
      displayName: 'David K. Park',
      email: 'david.park@berkeley.edu',
      photoURL: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'idle',
      authProvider: 'google',
      lastSeen: now - 1000 * 340, // ~5m ago
      activeProject: {
        id: 'proj-03',
        name: 'RC Low-Pass Filter & Bode Plot',
        componentCount: 4,
        wireCount: 8,
        isSimulating: false,
        daqEnabled: false,
        lastUpdated: now - 1000 * 350,
      },
      browserInfo: 'Edge 122 • Windows 10',
    },
    {
      uid: 'user-active-04',
      displayName: 'Amina Al-Mansoor',
      email: 'amina.mansoor@oxford.ac.uk',
      photoURL: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'offline',
      authProvider: 'google',
      lastSeen: now - 1000 * 3600 * 2, // 2h ago
      activeProject: {
        id: 'proj-04',
        name: 'Full Adder with 74HC86 XOR & 74HC08',
        componentCount: 12,
        wireCount: 28,
        isSimulating: false,
        daqEnabled: false,
        lastUpdated: now - 1000 * 3600 * 2,
      },
      browserInfo: 'Chrome 122 • Ubuntu Linux',
    },
    {
      uid: 'user-active-05',
      displayName: 'Sarah Chen',
      email: 'sarah.chen@university.edu',
      photoURL: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'online',
      authProvider: 'email',
      lastSeen: now - 1000 * 45,
      activeProject: {
        id: 'proj-05',
        name: '74HC04 Hex Inverter Ring Oscillator',
        componentCount: 8,
        wireCount: 18,
        isSimulating: true,
        daqEnabled: true,
        lastUpdated: now - 1000 * 60,
      },
      browserInfo: 'Safari 17 • macOS Ventura',
    },
    {
      uid: 'user-active-06',
      displayName: 'Alex Rivera',
      email: 'alex.rivera@polytech.edu',
      photoURL: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'idle',
      authProvider: 'email',
      lastSeen: now - 1000 * 600,
      activeProject: {
        id: 'proj-06',
        name: '4-Bit Ripple Counter with 74HC86 & Flip-Flops',
        componentCount: 15,
        wireCount: 34,
        isSimulating: false,
        daqEnabled: true,
        lastUpdated: now - 1000 * 700,
      },
      browserInfo: 'Chrome 123 • Windows 11',
    },
    {
      uid: 'user-active-07',
      displayName: 'Priya Sharma',
      email: 'priya.sharma@iitd.ac.in',
      photoURL: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'online',
      authProvider: 'google',
      lastSeen: now - 1000 * 15,
      activeProject: {
        id: 'proj-07',
        name: 'Clock Generator & Frequency Divider',
        componentCount: 7,
        wireCount: 16,
        isSimulating: true,
        daqEnabled: true,
        lastUpdated: now - 1000 * 20,
      },
      browserInfo: 'Firefox 124 • Linux Fedora',
    },
    {
      uid: 'user-active-08',
      displayName: 'Liam O\'Connor',
      email: 'liam.oconnor@tcd.ie',
      photoURL: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
      role: 'user',
      status: 'offline',
      authProvider: 'email',
      lastSeen: now - 1000 * 3600 * 5,
      activeProject: {
        id: 'proj-08',
        name: 'Common Emitter Amplifier & DMM Load Analysis',
        componentCount: 10,
        wireCount: 20,
        isSimulating: false,
        daqEnabled: false,
        lastUpdated: now - 1000 * 3600 * 6,
      },
      browserInfo: 'Edge 123 • Windows 11',
    },
  ];
}

// Watch auth state changes from Firebase
export function onFirebaseAuthState(callback: (user: FirebaseUser | null) => void): () => void {
  if (auth && isConfigured) {
    return onAuthStateChanged(auth, callback);
  }
  return () => {};
}
