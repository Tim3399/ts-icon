import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import keycloak from './keycloak';
import { KEYCLOAK_ENABLED } from '../config';

interface AuthContextType {
  authenticated: boolean;
  token: string | undefined;
  username: string | undefined;
  logout: () => void;
  getToken: () => Promise<string | undefined>;
}

const AuthContext = createContext<AuthContextType>({
  authenticated: false,
  token: undefined,
  username: undefined,
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

    keycloak
      .init({
        onLoad: 'login-required',
        checkLoginIframe: false,
      })
      .then((auth) => {
        setAuthenticated(auth);
        setLoading(false);

        // Automatische Token-Erneuerung
        setInterval(() => {
          keycloak
            .updateToken(60)
            .catch(() => {
              console.warn('Token-Erneuerung fehlgeschlagen, erneuter Login nötig');
              keycloak.login();
            });
        }, 30000);
      })
      .catch((err) => {
        console.error('Keycloak Initialisierung fehlgeschlagen:', err);
        setLoading(false);
      });
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Authentifizierung läuft...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Anmeldung fehlgeschlagen. Bitte Seite neu laden.</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        authenticated,
        token: KEYCLOAK_ENABLED ? keycloak.token : undefined,
        username: KEYCLOAK_ENABLED ? keycloak.tokenParsed?.preferred_username : 'local',
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
