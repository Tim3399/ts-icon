import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import keycloak from './keycloak';
import { KEYCLOAK_ENABLED, KEYCLOAK_CLIENT_ID } from '../config';
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

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(!KEYCLOAK_ENABLED);
  const [loading, setLoading] = useState(KEYCLOAK_ENABLED);

  useEffect(() => {
    if (!KEYCLOAK_ENABLED) return;

    let refreshIntervalId: ReturnType<typeof setInterval> | undefined;

    keycloak
      .init({
        onLoad: 'login-required',
        checkLoginIframe: false,
        pkceMethod: 'S256',
      })
      .then((auth) => {
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
        console.error('Keycloak initialization failed:', err);
        setLoading(false);
      });

    return () => {
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
    ? keycloak.tokenParsed?.resource_access?.[KEYCLOAK_CLIENT_ID]?.roles ?? []
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
