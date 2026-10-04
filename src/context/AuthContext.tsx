import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { AuthUser, UserPresence } from '../types/auth';
import {
  isFirebaseConfigured,
  loginWithGoogleFirebase,
  logoutFirebase,
  loginSimulatedGoogle,
  registerWithEmailPassword,
  loginWithEmailPassword,
  getSimulatedUser,
  syncUserPresence,
  onFirebaseAuthState,
  checkIsAdmin,
  FirebaseCustomConfig,
  saveStoredFirebaseConfig,
  initFirebaseService,
  getStoredFirebaseConfig,
} from '../services/firebase';
import { useStore } from '../store/CircuitStore';

interface AuthContextType {
  user: AuthUser | null;
  isAdmin: boolean;
  loading: boolean;
  isFirebaseReady: boolean;
  loginWithGoogle: () => Promise<void>;
  registerWithEmail: (displayName: string, email: string, pass: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  loginDemo: (email?: string) => void;
  logout: () => Promise<void>;
  toggleAdminRole: () => void;
  // Modals
  isLoginModalOpen: boolean;
  setLoginModalOpen: (open: boolean) => void;
  isAdminModalOpen: boolean;
  setAdminModalOpen: (open: boolean) => void;
  // Config
  firebaseConfig: FirebaseCustomConfig | null;
  saveConfig: (cfg: FirebaseCustomConfig) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirebaseReady, setIsFirebaseReady] = useState(isFirebaseConfigured());
  const [firebaseConfig, setFirebaseConfig] = useState<FirebaseCustomConfig | null>(
    getStoredFirebaseConfig()
  );

  // Modals state (persists admin modal open state across browser refresh)
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpenState] = useState(() => {
    try {
      return sessionStorage.getItem('circuitlab_admin_modal_open') === 'true';
    } catch {
      return false;
    }
  });

  const setAdminModalOpen = useCallback((open: boolean) => {
    setIsAdminModalOpenState(open);
    try {
      if (open) {
        sessionStorage.setItem('circuitlab_admin_modal_open', 'true');
      } else {
        sessionStorage.removeItem('circuitlab_admin_modal_open');
      }
    } catch {}
  }, []);

  const heartbeatTimer = useRef<number | null>(null);

  // Check initial user from simulated login or Firebase
  useEffect(() => {
    const simUser = getSimulatedUser();
    if (simUser) {
      setUser(simUser);
      setLoading(false);
    } else {
      setLoading(false);
    }

    // Subscribe to Firebase Auth state
    const unsubscribe = onFirebaseAuthState((fbUser) => {
      if (fbUser) {
        const isAdmin = Boolean(fbUser.email && checkIsAdmin(fbUser.email));
        setUser({
          uid: fbUser.uid,
          displayName: fbUser.displayName || (isAdmin ? 'Bhagath Krishnan (Admin)' : 'Google User'),
          email: fbUser.email,
          photoURL: fbUser.photoURL,
          role: isAdmin ? 'admin' : 'user',
          authProvider: 'google',
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Save custom Firebase config and re-initialize
  const saveConfig = useCallback((cfg: FirebaseCustomConfig) => {
    saveStoredFirebaseConfig(cfg);
    setFirebaseConfig(cfg);
    const success = initFirebaseService();
    setIsFirebaseReady(success);
    return success;
  }, []);

  // Login via Google Firebase Popup
  const loginWithGoogle = useCallback(async () => {
    try {
      const authUser = await loginWithGoogleFirebase();
      setUser(authUser);
      setLoginModalOpen(false);
    } catch (err: any) {
      if (err.message === 'FIREBASE_NOT_CONFIGURED') {
        throw err;
      }
      console.error('Google Sign-In Error:', err);
      throw err;
    }
  }, []);

  // Register via Email + Password
  const registerWithEmail = useCallback(async (displayName: string, email: string, pass: string) => {
    const authUser = await registerWithEmailPassword(displayName, email, pass);
    setUser(authUser);
    setLoginModalOpen(false);
  }, []);

  // Login via Email + Password
  const loginWithEmail = useCallback(async (email: string, pass: string) => {
    const authUser = await loginWithEmailPassword(email, pass);
    setUser(authUser);
    setLoginModalOpen(false);
  }, []);

  // Google Login Fallback / Account Selector
  const loginDemo = useCallback((email?: string) => {
    const u = loginSimulatedGoogle(email);
    setUser(u);
    setLoginModalOpen(false);
  }, []);

  // Logout
  const logout = useCallback(async () => {
    await logoutFirebase();
    if (user) {
      // Mark as offline in presence
      syncUserPresence({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
        status: 'offline',
        lastSeen: Date.now(),
      });
    }
    setUser(null);
  }, [user]);

  // Toggle admin for demo/testing convenience
  const toggleAdminRole = useCallback(() => {
    if (!user) return;
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    const updated = { ...user, role: nextRole as 'admin' | 'user' };
    setUser(updated);
    if (getSimulatedUser()) {
      localStorage.setItem('circuitlab_simulated_user', JSON.stringify(updated));
    }
  }, [user]);

  // Continuous Presence Heartbeat updating active project info
  const pushPresence = useCallback(() => {
    if (!user) return;

    const presence: UserPresence = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      role: user.role,
      status: 'online',
      lastSeen: Date.now(),
      activeProject: {
        id: state.name || 'default-proj',
        name: state.name || 'Untitled Circuit',
        componentCount: state.components.size,
        wireCount: state.wires.size,
        isSimulating: state.simulation.status === 'running',
        daqEnabled: state.instruments.daq?.enabled !== false,
        lastUpdated: Date.now(),
      },
      browserInfo: `${navigator.platform} • ${navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Browser'}`,
    };

    syncUserPresence(presence);
  }, [user, state.name, state.components.size, state.wires.size, state.simulation.status, state.instruments.daq?.enabled]);

  useEffect(() => {
    if (!user) return;

    // Immediately push on user or project change
    pushPresence();

    // Heartbeat every 20 seconds
    const interval = window.setInterval(pushPresence, 20000);
    heartbeatTimer.current = interval;

    // Offline on page unload
    const handleUnload = () => {
      syncUserPresence({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        role: user.role,
        status: 'offline',
        lastSeen: Date.now(),
      });
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [user, pushPresence]);

  // Strict admin check: ONLY visible to authorized emails when login with google
  const isAdmin = Boolean(
    user &&
    user.authProvider === 'google' &&
    user.email &&
    checkIsAdmin(user.email)
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        isFirebaseReady,
        loginWithGoogle,
        registerWithEmail,
        loginWithEmail,
        loginDemo,
        logout,
        toggleAdminRole,
        isLoginModalOpen,
        setLoginModalOpen,
        isAdminModalOpen,
        setAdminModalOpen,
        firebaseConfig,
        saveConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
