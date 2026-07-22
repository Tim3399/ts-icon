import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import keycloak from './keycloak';
import { KEYCLOAK_ENABLED } from '../config';
import { ToastProvider } from '../components/Toast';

interface AuthContextType {
  authenticated: boolean;
  token: string | undefined;
  username: string | undefined;
  roles: string[];
  logout: () => void;
  getToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  token: undefined,
  username: undefined,
  roles: [],
  logout: () => {},
  getToken: async () => undefined,
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: React.ReactNode;
}

// `keycloak-js` allows exactly one `init()` call for the lifetime of a given
// `Keycloak` instance; a second call throws "A 'Keycloak' instance can only
// be initialized once." The imported `keycloak` object is a module-level
// singleton (one instance for the whole page), so the promise returned by
// its first `init()` call is cached here at module scope too. Any mount of
// AuthProvider reuses that same in-flight-or-resolved promise instead of
// calling `.init()` again: this covers React StrictMode's development-only
// double-invoke of effects (mount, cleanup, mount again, all synchronously
// before the promise can resolve), and it also covers a genuine later
// unmount/remount on the same page, since calling `.init()` a second time
// on the same instance would throw regardless of the reason. Re-deriving
// `authenticated`/`loading` from the cached promise's outcome on a real
// remount is correct either way, successful or failed: the underlying
// Keycloak instance cannot be re-initialized, so there is no fresher result
// to wait for.
let keycloakInitPromise: Promise<boolean> | null = null;

function initializeKeycloakOnce(): Promise<boolean> {
  if (!keycloakInitPromise) {
    keycloakInitPromise = keycloak.init({
      onLoad: 'login-required',
      checkLoginIframe: false,
      pkceMethod: 'S256',
    });
  }
  return keycloakInitPromise;
}

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(!KEYCLOAK_ENABLED);
  const [loading, setLoading] = useState(KEYCLOAK_ENABLED);

  useEffect(() => {
    if (!KEYCLOAK_ENABLED) return;

    let cancelled = false;
    let refreshIntervalId: ReturnType<typeof setInterval> | undefined;

    initializeKeycloakOnce()
      .then((auth) => {
        if (cancelled) return;
        setAuthenticated(auth);
        setLoading(false);

        // Automatic token refresh
        refreshIntervalId = setInterval(() => {
          keycloak
            .updateToken(60)
            .catch(() => {
              console.warn('Token refresh failed, login required again');
              keycloak.login();
            });
        }, 30000);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Keycloak initialization failed:', err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (refreshIntervalId !== undefined) {
        clearInterval(refreshIntervalId);
      }
    };
  }, []);

  const logout = useCallback(() => {
    if (KEYCLOAK_ENABLED) {
      keycloak.logout({ redirectUri: window.location.origin });
    }
  }, []);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!KEYCLOAK_ENABLED) return undefined;
    try {
      await keycloak.updateToken(30);
      return keycloak.token;
    } catch {
      keycloak.login();
      return undefined;
    }
  }, []);

  if (loading) {
    return (
      <ToastProvider>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p>Authenticating...</p>
        </div>
      </ToastProvider>
    );
  }

  if (!authenticated) {
    return (
      <ToastProvider>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p>Login failed. Please reload the page.</p>
        </div>
      </ToastProvider>
    );
  }

  const roles: string[] = KEYCLOAK_ENABLED
    ? keycloak.tokenParsed?.realm_access?.roles ?? []
    : [];

  return (
    <ToastProvider>
      <AuthContext.Provider
        value={{
          authenticated,
          token: KEYCLOAK_ENABLED ? keycloak.token : undefined,
          username: KEYCLOAK_ENABLED ? keycloak.tokenParsed?.preferred_username : 'local',
          roles,
          logout,
          getToken,
        }}
      >
        {children}
      </AuthContext.Provider>
    </ToastProvider>
  );
};

export default AuthProvider;
