export interface ActiveProjectSummary {
  id: string;
  name: string;
  componentCount: number;
  wireCount: number;
  isSimulating: boolean;
  daqEnabled: boolean;
  lastUpdated: number;
}

export interface UserPresence {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'user';
  status: 'online' | 'idle' | 'offline';
  lastSeen: number;
  activeProject?: ActiveProjectSummary;
  browserInfo?: string;
  authProvider?: 'google' | 'email' | 'system';
  createdAt?: number;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: 'admin' | 'user';
  authProvider?: 'google' | 'email';
  isAnonymous?: boolean;
}
