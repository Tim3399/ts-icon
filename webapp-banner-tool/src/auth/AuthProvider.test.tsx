import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AuthProvider from './AuthProvider';

// Regression test for a real bug: React StrictMode double-invokes effects in
// development (mount, cleanup, mount again, synchronously before any promise
// settles). `keycloak-js`'s `Keycloak.init()` throws "A 'Keycloak' instance
// can only be initialized once." on a second call on the same instance, so
// calling it directly from AuthProvider's effect broke every StrictMode dev
// session. The fix caches the first call's promise at module scope
// (`initializeKeycloakOnce()` in AuthProvider.tsx) so a second effect run
// reuses it instead of re-invoking `init()`. This mock reproduces the real
// library's one-shot-init contract to verify the guard actually prevents the
// second call, rather than just asserting the UI looks fine.
const { initMock } = vi.hoisted(() => {
  let didInitialize = false;
  const initMock = vi.fn(() => {
    if (didInitialize) {
      return Promise.reject(
        new Error("A 'Keycloak' instance can only be initialized once.")
      );
    }
    didInitialize = true;
    return Promise.resolve(true);
  });
  return { initMock };
});

// AuthProvider reads `KEYCLOAK_ENABLED` from `../config`, which in turn
// depends on `window.location.hostname` and `VITE_KEYCLOAK_ENABLED` (this
// repo's local `.env` sets that to `false` as a local-dev convenience, see
// `config.ts`). Mocking `../config` directly means this test always
// exercises the real init path regardless of whatever a developer's local
// `.env` happens to be set to.
vi.mock('../config', () => ({
  KEYCLOAK_ENABLED: true,
  KEYCLOAK_CLIENT_ID: 'test-client',
  KEYCLOAK_URL: 'https://example.test',
  KEYCLOAK_REALM: 'test-realm',
}));

vi.mock('keycloak-js', () => ({
  // `keycloak.ts` calls `new Keycloak(...)`, so the mock must be usable as a
  // constructor. An arrow function can't be invoked with `new`; a plain
  // `function` that returns an object works because `new` on a function
  // returning an object uses that returned object instead of `this`.
  default: vi.fn().mockImplementation(function KeycloakMock() {
    return {
      init: initMock,
      updateToken: vi.fn().mockResolvedValue(true),
      login: vi.fn(),
      logout: vi.fn(),
      token: 'fake-token',
      tokenParsed: { preferred_username: 'tester', realm_access: { roles: [] } },
    };
  }),
}));

describe('AuthProvider under React.StrictMode', () => {
  it('calls keycloak.init() only once despite StrictMode double-invoking the effect', async () => {
    render(
      <React.StrictMode>
        <AuthProvider>
          <div>authenticated content</div>
        </AuthProvider>
      </React.StrictMode>
    );

    await waitFor(() => screen.getByText('authenticated content'));

    expect(initMock).toHaveBeenCalledTimes(1);
  });
});
