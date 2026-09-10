import React, { useEffect, useState, useCallback } from "react";
import keycloak from "./keycloak";
import { KEYCLOAK_ENABLED } from "../config";
import { ToastProvider } from "../components/Toast";

import { AuthContext } from "./AuthContext";
import { ApiError } from "../api/client";

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
      onLoad: "login-required",
      checkLoginIframe: false,
      pkceMethod: "S256",
    });
  }
  return keycloakInitPromise;
}

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(!KEYCLOAK_ENABLED);
  const [loading, setLoading] = useState(KEYCLOAK_ENABLED);
  const [snapshot, setSnapshot] = useState(() => ({
    token: keycloak.token,
    username: keycloak.tokenParsed?.preferred_username,
    roles: keycloak.tokenParsed?.realm_access?.roles ?? [],
  }));
  const syncSnapshot = useCallback(
    () =>
      setSnapshot({
        token: keycloak.token,
        username: keycloak.tokenParsed?.preferred_username,
        roles: [...(keycloak.tokenParsed?.realm_access?.roles ?? [])],
      }),
    [],
  );

  useEffect(() => {
    if (!KEYCLOAK_ENABLED) return;

    let cancelled = false;
    let refreshIntervalId: ReturnType<typeof setInterval> | undefined;

    initializeKeycloakOnce()
      .then((auth) => {
        if (cancelled) return;
        setAuthenticated(auth);
        syncSnapshot();
        setLoading(false);

        // Automatic token refresh
        refreshIntervalId = setInterval(() => {
          keycloak
            .updateToken(60)
            .then(() => {
              if (!cancelled) syncSnapshot();
            })
            .catch(() => {
              if (cancelled) return;
              console.warn("Token refresh failed, login required again");
              keycloak.login();
            });
        }, 30000);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Keycloak initialization failed:", err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (refreshIntervalId !== undefined) {
        clearInterval(refreshIntervalId);
      }
    };
  }, [syncSnapshot]);

  const logout = useCallback(() => {
    if (KEYCLOAK_ENABLED) {
      keycloak.logout({ redirectUri: window.location.origin });
    }
  }, []);

  const getToken = useCallback(async (): Promise<string | undefined> => {
    if (!KEYCLOAK_ENABLED) return undefined;
    try {
      await keycloak.updateToken(30);
      syncSnapshot();
      return keycloak.token;
    } catch {
      void keycloak.login();
      throw new ApiError("Your session expired. Sign in again.", "unauthorized");
    }
  }, [syncSnapshot]);

  if (loading) {
    return (
      <ToastProvider>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
          }}
        >
          <p>Authenticating...</p>
        </div>
      </ToastProvider>
    );
  }

  if (!authenticated) {
    return (
      <ToastProvider>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
          }}
        >
          <p>Login failed. Please reload the page.</p>
        </div>
      </ToastProvider>
    );
  }

  const roles: string[] = KEYCLOAK_ENABLED ? snapshot.roles : [];

  return (
    <ToastProvider>
      <AuthContext.Provider
        value={{
          authenticated,
          token: KEYCLOAK_ENABLED ? snapshot.token : undefined,
          username: KEYCLOAK_ENABLED ? snapshot.username : "local",
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
