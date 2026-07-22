import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { hasUploadPermission, hasAdminPermission } from './permissions';

describe('hasUploadPermission', () => {
  it('grants permission for the ts-icon-editor role', () => {
    expect(hasUploadPermission(['ts-icon-editor'])).toBe(true);
  });

  it('grants permission for the ts-icon-admin role', () => {
    expect(hasUploadPermission(['ts-icon-admin'])).toBe(true);
  });

  it('grants permission when both roles are present', () => {
    expect(hasUploadPermission(['ts-icon-admin', 'ts-icon-editor'])).toBe(true);
  });

  it('denies permission for unrelated roles', () => {
    expect(hasUploadPermission(['ts-icon-viewer'])).toBe(false);
  });

  it('denies permission when the user has no roles at all', () => {
    expect(hasUploadPermission([])).toBe(false);
  });
});

describe('hasAdminPermission', () => {
  it('grants permission for the ts-icon-admin role', () => {
    expect(hasAdminPermission(['ts-icon-admin'])).toBe(true);
  });

  it('denies permission for the editor role alone -- unlike hasUploadPermission, editor does not imply admin here', () => {
    expect(hasAdminPermission(['ts-icon-editor'])).toBe(false);
  });

  it('denies permission when the user has no roles at all', () => {
    expect(hasAdminPermission([])).toBe(false);
  });
});

// useCanUpload wraps useAuth() and KEYCLOAK_ENABLED, both of which need to
// vary per test case (roles, and the Keycloak-disabled bypass). Each test
// mocks both dependencies fresh via vi.doMock + a dynamic import, since the
// static top-level import above would otherwise pick up whatever config/auth
// mock a previous test left in place.
describe('useCanUpload', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../config');
    vi.doUnmock('./AuthProvider');
  });

  it('allows uploads when Keycloak is disabled, regardless of roles', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: false,
      KEYCLOAK_EDITOR_ROLE: 'ts-icon-editor',
      KEYCLOAK_ADMIN_ROLE: 'ts-icon-admin',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: [] }) }));

    const { useCanUpload } = await import('./permissions');
    const { result } = renderHook(() => useCanUpload());

    expect(result.current).toBe(true);
  });

  it('denies uploads when Keycloak is enabled and the user lacks editor/admin roles', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: true,
      KEYCLOAK_EDITOR_ROLE: 'ts-icon-editor',
      KEYCLOAK_ADMIN_ROLE: 'ts-icon-admin',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: ['some-other-role'] }) }));

    const { useCanUpload } = await import('./permissions');
    const { result } = renderHook(() => useCanUpload());

    expect(result.current).toBe(false);
  });

  it('allows uploads when Keycloak is enabled and the user has the editor role', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: true,
      KEYCLOAK_EDITOR_ROLE: 'ts-icon-editor',
      KEYCLOAK_ADMIN_ROLE: 'ts-icon-admin',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: ['ts-icon-editor'] }) }));

    const { useCanUpload } = await import('./permissions');
    const { result } = renderHook(() => useCanUpload());

    expect(result.current).toBe(true);
  });

  it('allows uploads when Keycloak is enabled and the user has the admin role', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: true,
      KEYCLOAK_EDITOR_ROLE: 'ts-icon-editor',
      KEYCLOAK_ADMIN_ROLE: 'ts-icon-admin',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: ['ts-icon-admin'] }) }));

    const { useCanUpload } = await import('./permissions');
    const { result } = renderHook(() => useCanUpload());

    expect(result.current).toBe(true);
  });

  // Proves the role names actually come from config rather than being
  // hardcoded: a realm using entirely different role names (as this
  // project's real deployment does) is configured via
  // VITE_KEYCLOAK_EDITOR_ROLE/VITE_KEYCLOAK_ADMIN_ROLE, and once
  // overridden, the ts-icon-* default names no longer grant anything.
  it('respects overridden role names instead of the ts-icon-* defaults', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: true,
      KEYCLOAK_EDITOR_ROLE: 'b825_access',
      KEYCLOAK_ADMIN_ROLE: 'admin_access',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: ['b825_access'] }) }));

    const { useCanUpload } = await import('./permissions');
    const { result } = renderHook(() => useCanUpload());

    expect(result.current).toBe(true);
  });

  it('does not grant permission for the ts-icon-* defaults once roles are overridden', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: true,
      KEYCLOAK_EDITOR_ROLE: 'b825_access',
      KEYCLOAK_ADMIN_ROLE: 'admin_access',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: ['ts-icon-editor'] }) }));

    const { useCanUpload } = await import('./permissions');
    const { result } = renderHook(() => useCanUpload());

    expect(result.current).toBe(false);
  });
});

describe('useIsAdmin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../config');
    vi.doUnmock('./AuthProvider');
  });

  it('treats local dev (Keycloak disabled) as admin, same bypass as useCanUpload', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: false,
      KEYCLOAK_ADMIN_ROLE: 'ts-icon-admin',
      KEYCLOAK_EDITOR_ROLE: 'ts-icon-editor',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: [] }) }));

    const { useIsAdmin } = await import('./permissions');
    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(true);
  });

  it('denies admin status to an editor-only user when Keycloak is enabled', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: true,
      KEYCLOAK_ADMIN_ROLE: 'ts-icon-admin',
      KEYCLOAK_EDITOR_ROLE: 'ts-icon-editor',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: ['ts-icon-editor'] }) }));

    const { useIsAdmin } = await import('./permissions');
    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(false);
  });

  it('grants admin status to a user holding the admin role when Keycloak is enabled', async () => {
    vi.doMock('../config', () => ({
      KEYCLOAK_ENABLED: true,
      KEYCLOAK_ADMIN_ROLE: 'ts-icon-admin',
      KEYCLOAK_EDITOR_ROLE: 'ts-icon-editor',
    }));
    vi.doMock('./AuthProvider', () => ({ useAuth: () => ({ roles: ['ts-icon-admin'] }) }));

    const { useIsAdmin } = await import('./permissions');
    const { result } = renderHook(() => useIsAdmin());

    expect(result.current).toBe(true);
  });
});
