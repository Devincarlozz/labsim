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
  getDocs,
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

  // Sync to Firestore 'users' collection
  if (db && isConfigured) {
    try {
      const userRef = doc(db, 'users', user.uid);
      setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        role: checkIsAdmin(user.email) ? 'admin' : 'user',
        status: 'offline',
        createdAt: user.createdAt,
        lastSeen: user.createdAt,
        authProvider: 'email',
        browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Web Browser',
      }, { merge: true }).catch(() => {});
    } catch {}
  }
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

    // Save to Firestore 'users' collection so it appears on the Admin Panel
    if (db && isConfigured) {
      try {
        await setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          displayName: authUser.displayName,
          email: u.email,
          photoURL: u.photoURL,
          role: authUser.role,
          authProvider: 'google',
          status: 'online',
          lastSeen: Date.now(),
          browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Web Browser',
        }, { merge: true });
      } catch (e) {
        console.warn('Firestore write error on Google login:', e);
      }
    }

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

  // Save to Firestore 'users' collection
  if (db && isConfigured) {
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        displayName: cleanName,
        email: cleanEmail,
        photoURL: photoURL || null,
        role: 'user',
        status: 'online',
        lastSeen: Date.now(),
        createdAt: Date.now(),
        authProvider: 'email',
        browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Web Browser',
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore write error on email registration:', e);
    }
  }

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

    if (db && isConfigured) {
      try {
        await setDoc(doc(db, 'users', fbUser.uid), {
          uid: fbUser.uid,
          displayName: fbUser.displayName,
          email: fbUser.email,
          photoURL: fbUser.photoURL,
          role: fbUser.role,
          status: 'online',
          lastSeen: Date.now(),
          authProvider: 'email',
          browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Web Browser',
        }, { merge: true });
      } catch {}
    }

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

    if (db && isConfigured) {
      try {
        await setDoc(doc(db, 'users', authUser.uid), {
          uid: authUser.uid,
          displayName: authUser.displayName,
          email: authUser.email,
          photoURL: null,
          role: 'user',
          status: 'online',
          lastSeen: Date.now(),
          authProvider: 'email',
          browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Web Browser',
        }, { merge: true });
      } catch {}
    }

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
  const emailToUse = (customEmail || 'bhagathkrishnan06@gmail.com').trim().toLowerCase();
  const isAdminCalculated = checkIsAdmin(emailToUse);

  const simulated: AuthUser = {
    uid: isAdminCalculated ? `admin-${emailToUse.replace(/[@.]/g, '-')}` : `user-${emailToUse.replace(/[@.]/g, '-')}`,
    displayName: isAdminCalculated ? `Bhagath Krishnan (Admin)` : emailToUse.split('@')[0],
    email: emailToUse,
    photoURL: isAdminCalculated
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face'
      : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face',
    role: isAdminCalculated ? 'admin' : 'user',
    authProvider: 'google',
    isAnonymous: false,
  };

  localStorage.setItem(STORAGE_KEY_SIMULATED_USER, JSON.stringify(simulated));

  // Sync to Firestore 'users' collection if connected
  if (db && isConfigured) {
    try {
      setDoc(doc(db, 'users', simulated.uid), {
        uid: simulated.uid,
        displayName: simulated.displayName,
        email: simulated.email,
        photoURL: simulated.photoURL,
        role: simulated.role,
        authProvider: 'google',
        status: 'online',
        lastSeen: Date.now(),
        browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Web Browser',
      }, { merge: true }).catch(() => {});
    } catch {}
  }

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

// Dummy user check to filter out any lingering seed student profiles
const DUMMY_EMAILS = new Set([
  'm.thorne@mit.edu',
  'elena.rostova@stanford.edu',
  'david.park@berkeley.edu',
  'amina.mansoor@oxford.ac.uk',
  'sarah.chen@university.edu',
  'alex.rivera@polytech.edu',
  'priya.sharma@iitd.ac.in',
  'liam.oconnor@tcd.ie',
]);

export function isDummyUser(u?: { uid?: string; email?: string | null }): boolean {
  if (!u) return false;
  if (u.uid && u.uid.startsWith('user-active-')) return true;
  if (u.email && DUMMY_EMAILS.has(u.email.toLowerCase())) return true;
  return false;
}

// Purge any stale dummy user accounts from localStorage caches
export function cleanupDummyUsers(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_USERS);
    if (raw) {
      const stored: UserPresence[] = JSON.parse(raw);
      const clean = stored.filter((u) => !isDummyUser(u));
      localStorage.setItem(STORAGE_KEY_LOCAL_USERS, JSON.stringify(clean));
    }
  } catch {}
}

// Sync user presence and their active project
export async function syncUserPresence(presence: UserPresence): Promise<void> {
  if (isDummyUser(presence)) return;

  // 1. Update in-memory / localStorage cache
  try {
    cleanupDummyUsers();
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_USERS);
    const existing: UserPresence[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter((u) => u.uid !== presence.uid && !isDummyUser(u));
    filtered.unshift(presence);
    localStorage.setItem(STORAGE_KEY_LOCAL_USERS, JSON.stringify(filtered.slice(0, 50)));

    // Dispatch custom storage event for same-window updates
    window.dispatchEvent(new CustomEvent('circuitlab-presence-update'));
  } catch (e) {
    console.error('Local presence write error:', e);
  }

  // 2. If Firebase Firestore is connected, write directly to Firestore 'users' collection
  if (db && isConfigured) {
    try {
      const userRef = doc(db, 'users', presence.uid);
      await setDoc(userRef, presence, { merge: true });
    } catch (err) {
      console.warn('Firestore presence sync error:', err);
    }
  }
}

// Normalize any document from Firebase Firestore database into UserPresence format
export function normalizeUserPresence(data: any, docId: string): UserPresence {
  const email = data.email || null;
  const uid = data.uid || docId;
  const isAdmin = checkIsAdmin(email);

  return {
    uid,
    displayName: data.displayName || (email ? email.split('@')[0] : 'User'),
    email,
    photoURL: data.photoURL || null,
    role: isAdmin ? 'admin' : (data.role === 'admin' ? 'admin' : 'user'),
    status: data.status || 'offline',
    lastSeen: data.lastSeen || data.updatedAt || data.createdAt || Date.now(),
    createdAt: data.createdAt,
    authProvider: data.authProvider || (isAdmin ? 'google' : 'email'),
    browserInfo: data.browserInfo || 'Firebase User Account',
    activeProject: data.activeProject || undefined,
  };
}

// Fetch all users directly from Firebase Firestore database collection('users')
export async function fetchAllFirebaseUsers(): Promise<UserPresence[]> {
  cleanupDummyUsers();
  const remoteUsers: UserPresence[] = [];

  if (db && isConfigured) {
    try {
      const usersCol = collection(db, 'users');
      const snap = await getDocs(usersCol);
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (!isDummyUser({ uid: docSnap.id, email: data.email })) {
          remoteUsers.push(normalizeUserPresence(data, docSnap.id));
        }
      });
    } catch (err) {
      console.warn('Firestore fetch all users error:', err);
    }
  }

  return getAllMergedUsers(remoteUsers);
}

// Subscribe to real-time users directly from Firebase Firestore database
export function subscribeToActiveUsers(
  callback: (users: UserPresence[]) => void
): () => void {
  cleanupDummyUsers();

  const handleUpdate = () => {
    callback(getAllMergedUsers([]));
  };

  let firestoreUnsubscribe: (() => void) | null = null;

  // If Firestore is available, attach onSnapshot listener to the 'users' collection
  if (db && isConfigured) {
    try {
      const usersCol = collection(db, 'users');
      const q = query(usersCol);
      firestoreUnsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const remoteUsers: UserPresence[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!isDummyUser({ uid: docSnap.id, email: data.email })) {
              remoteUsers.push(normalizeUserPresence(data, docSnap.id));
            }
          });
          callback(getAllMergedUsers(remoteUsers));
        },
        (err) => {
          console.warn('Firestore snapshot error, falling back to local users:', err);
          callback(getAllMergedUsers([]));
        }
      );
    } catch (e) {
      console.warn('Firestore subscribe error:', e);
    }
  }

  // ALWAYS listen to local storage & presence events for immediate same-device / multi-tab updates
  window.addEventListener('storage', handleUpdate);
  window.addEventListener('circuitlab-presence-update', handleUpdate);

  // Periodic heartbeat timer (every 5 seconds) to refresh online/offline status live
  const timer = window.setInterval(handleUpdate, 5000);

  // Trigger initial fetch
  fetchAllFirebaseUsers().then(callback).catch(() => {
    callback(getAllMergedUsers([]));
  });

  return () => {
    if (firestoreUnsubscribe) firestoreUnsubscribe();
    window.removeEventListener('storage', handleUpdate);
    window.removeEventListener('circuitlab-presence-update', handleUpdate);
    window.clearInterval(timer);
  };
}

// Real authenticated accounts in the Firebase project
export const FIREBASE_DATABASE_ACCOUNTS: UserPresence[] = [
  {
    uid: 'HrwYlg6k8wWHimkK16YaL4Xvalh2',
    displayName: 'Anegha Manoj',
    email: 'aneghamanoj@gmail.com',
    photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocKsnFK7ylFkK687KnOYCYuqD45VAhrhPRizCIfhXELVHJbmo2NR=s96-c',
    role: 'user',
    status: 'offline',
    authProvider: 'google',
    createdAt: 1791097794696,
    lastSeen: 1791097794697,
    browserInfo: 'Chrome • Google Account',
  },
  {
    uid: 'eZ1bVK6Hh7cmc3H70MgKZzDn17C2',
    displayName: 'Sirin Devassia',
    email: 'sirindevassia@gmail.com',
    photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocJY6BUEdd7Aff2oPxYDhy2rhw3oYcaqpJafCRqU7E5aFC7WR6c=s96-c',
    role: 'user',
    status: 'offline',
    authProvider: 'google',
    createdAt: 1790960976872,
    lastSeen: 1790961293629,
    browserInfo: 'Chrome • Google Account',
  },
  {
    uid: 'eAJKjiKkxhSzzXDbvEbSPu1nTkS2',
    displayName: 'Jyothi Lekshmi',
    email: '2020narasimham25@gmail.com',
    photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocJa5yrYf9rxfdwT8WJGJzI_8jgZsGmm_nQnHPCEDJWNM0pCaRc=s96-c',
    role: 'user',
    status: 'offline',
    authProvider: 'google',
    createdAt: 1790960868759,
    lastSeen: 1790960868759,
    browserInfo: 'Chrome • Google Account',
  },
  {
    uid: 'qd422AauGKN8ffovuTdor6PRjSY2',
    displayName: 'Bhagath Krishnan',
    email: '25bb17346@rit.ac.in',
    photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocKFTv6gP5Mf8nahDYUBvEA-f6-wMcB7LlRNslIZp1D4Kc1ci9Q=s96-c',
    role: 'user',
    status: 'offline',
    authProvider: 'google',
    createdAt: 1790963640546,
    lastSeen: 1790963640547,
    browserInfo: 'Chrome • Google Account',
  },
  {
    uid: 'UpyD7wQXTJRZX8LifWZeL78NguK2',
    displayName: 'bhagath',
    email: 'bhagath@example.com',
    photoURL: null,
    role: 'user',
    status: 'offline',
    authProvider: 'email',
    createdAt: 1791030622464,
    lastSeen: 1791030622464,
    browserInfo: 'Registered Account (Email/Password)',
  },
  {
    uid: 'zIxbfvNEETNIkNLT7LF54sLUqRQ2',
    displayName: 'test',
    email: 'test@example.com',
    photoURL: null,
    role: 'user',
    status: 'offline',
    authProvider: 'email',
    createdAt: 1791033415812,
    lastSeen: 1791033415812,
    browserInfo: 'Registered Account (Email/Password)',
  },
  {
    uid: 'zVwCFSGoSASnYN2AAVFd09hNdRm2',
    displayName: 'Bhagath Krishnan (Lead Admin)',
    email: 'bhagathkrishnan06@gmail.com',
    photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocI4jkINOK5sWHL6SxmDmeytDqihd4KMRKm84UKhQuUR-4EtR-4=s96-c',
    role: 'admin',
    status: 'offline',
    authProvider: 'google',
    createdAt: 1790959812787,
    lastSeen: 1790963656813,
    browserInfo: 'Chrome • Windows (Admin)',
  },
  {
    uid: 'admin-bhagathkrishnan952-gmail-com',
    displayName: 'Bhagath Krishnan (Admin)',
    email: 'bhagathkrishnan952@gmail.com',
    photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    role: 'admin',
    status: 'offline',
    authProvider: 'google',
    createdAt: 1790959812787,
    lastSeen: 1790963656813,
    browserInfo: 'Chrome • Windows (Admin)',
  },
];

// Consolidate real users from Firebase Firestore database, authorized admins, and active sessions
// (NO DUMMY USERS)
export function getAllMergedUsers(remoteUsers: UserPresence[] = []): UserPresence[] {
  const userMap = new Map<string, UserPresence>();
  const now = Date.now();

  // 1. Authenticated accounts in Firebase database (Sirin Devassia, Jyothi Lekshmi, etc.)
  for (const acc of FIREBASE_DATABASE_ACCOUNTS) {
    const key = acc.email!.toLowerCase();
    userMap.set(key, { ...acc });
  }

  // 2. All real users from Firebase Firestore database collection('users')
  for (const ru of remoteUsers) {
    if (isDummyUser(ru)) continue;
    const key = (ru.email || ru.uid).toLowerCase();
    const isAdmin = checkIsAdmin(ru.email);
    const existing = userMap.get(key);
    userMap.set(key, {
      ...(existing || {}),
      ...ru,
      role: isAdmin ? 'admin' : (ru.role || existing?.role || 'user'),
    });
  }

  // 3. Both Authorized Administrator accounts
  for (const adminEmail of AUTHORIZED_ADMIN_EMAILS) {
    const key = adminEmail.toLowerCase();
    const existing = userMap.get(key);
    userMap.set(key, {
      uid: existing?.uid || `admin-${key.replace(/[@.]/g, '-')}`,
      displayName: existing?.displayName || (key.includes('06') ? 'Bhagath Krishnan (Lead Admin)' : 'Bhagath Krishnan (Admin)'),
      email: adminEmail,
      photoURL: existing?.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
      role: 'admin',
      status: existing?.status || 'offline',
      lastSeen: existing?.lastSeen || 1790963656813,
      authProvider: 'google',
      browserInfo: existing?.browserInfo || 'Chrome • Windows (Admin)',
      activeProject: existing?.activeProject,
    });
  }

  // 4. Stored active presence entries from localStorage (non-dummy)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOCAL_USERS);
    if (raw) {
      const stored: UserPresence[] = JSON.parse(raw);
      for (const s of stored) {
        if (isDummyUser(s)) continue;
        const key = (s.email || s.uid).toLowerCase();
        const existing = userMap.get(key);
        userMap.set(key, { ...(existing || {}), ...s });
      }
    }
  } catch (e) {
    console.warn('Error reading STORAGE_KEY_LOCAL_USERS:', e);
  }

  // 5. Any locally registered accounts
  for (const reg of getRegisteredUsers()) {
    if (isDummyUser(reg)) continue;
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

  // 6. Currently logged-in user session in this browser
  let currentUid: string | undefined = undefined;
  let currentEmail: string | undefined = undefined;
  try {
    const currentSim = getSimulatedUser();
    if (currentSim && currentSim.email && !isDummyUser(currentSim)) {
      currentUid = currentSim.uid;
      currentEmail = currentSim.email.toLowerCase();
      const key = currentEmail;
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
        browserInfo: existing?.browserInfo || 'Active Session',
        activeProject: existing?.activeProject,
      });
    }
  } catch {}

  // 7. Precise Real-Time Status Calculation (active in last 120s = online, else offline)
  for (const [key, u] of userMap.entries()) {
    const isCurrentActiveSession =
      (currentUid && u.uid === currentUid) ||
      (currentEmail && u.email && u.email.toLowerCase() === currentEmail);

    if (isCurrentActiveSession) {
      u.status = 'online';
      u.lastSeen = now;
      continue;
    }

    if (u.status === 'offline') {
      continue;
    }

    const lastSeenTime = u.lastSeen || u.createdAt || 0;
    if (now - lastSeenTime <= 120000) {
      u.status = 'online';
    } else {
      u.status = 'offline';
    }
  }

  // Sort: Online first, then Admins, then by lastSeen descending
  const list = Array.from(userMap.values());
  list.sort((a, b) => {
    if (a.status === 'online' && b.status !== 'online') return -1;
    if (b.status === 'online' && a.status !== 'online') return 1;
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (b.role === 'admin' && a.role !== 'admin') return 1;
    return (b.lastSeen || 0) - (a.lastSeen || 0);
  });

  return list;
}

export function getLocalActiveUsers(): UserPresence[] {
  cleanupDummyUsers();
  return getAllMergedUsers([]);
}

// ─── Firestore Admin Messages Persistence Helpers ───────────────────────────

export async function fetchFirestoreAdminMessages(): Promise<any[]> {
  if (!db || !isConfigured) return [];
  try {
    const colRef = collection(db, 'admin_messages');
    const snap = await getDocs(colRef);
    const list: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (!data.deleted && data.active !== false) {
        list.push({ id: docSnap.id, ...data });
      }
    });
    return list;
  } catch (err) {
    console.debug('Failed to fetch admin messages from Firestore:', err);
    return [];
  }
}

export async function saveFirestoreAdminMessage(msg: any): Promise<void> {
  if (!db || !isConfigured) return;
  try {
    const docRef = doc(db, 'admin_messages', msg.id);
    await setDoc(docRef, msg, { merge: true });
  } catch (err) {
    console.warn('Failed to save admin message to Firestore:', err);
  }
}

export async function deleteFirestoreAdminMessage(id: string): Promise<void> {
  if (!db || !isConfigured) return;
  try {
    const docRef = doc(db, 'admin_messages', id);
    await setDoc(docRef, { deleted: true, active: false }, { merge: true });
  } catch (err) {
    console.warn('Failed to delete admin message from Firestore:', err);
  }
}

// Watch auth state changes from Firebase
export function onFirebaseAuthState(callback: (user: FirebaseUser | null) => void): () => void {
  if (auth && isConfigured) {
    return onAuthStateChanged(auth, (user) => {
      if (user && db) {
        try {
          const isAdmin = checkIsAdmin(user.email);
          const isGoogle = user.providerData && user.providerData.some((p) => p.providerId === 'google.com');
          setDoc(
            doc(db, 'users', user.uid),
            {
              uid: user.uid,
              displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'User'),
              email: user.email,
              photoURL: user.photoURL || null,
              role: isAdmin ? 'admin' : 'user',
              status: 'online',
              lastSeen: Date.now(),
              authProvider: isGoogle ? 'google' : 'email',
              browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Web Browser',
            },
            { merge: true }
          ).catch(() => {});
        } catch {}
      }
      callback(user);
    });
  }
  return () => {};
}
