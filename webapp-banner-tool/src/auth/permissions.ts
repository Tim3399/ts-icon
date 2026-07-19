import { useAuth } from './AuthProvider';
import { KEYCLOAK_ENABLED } from '../config';

// Client roles that grant upload permission in the Keycloak realm this
// project uses. Both are treated equally here: an admin can do anything an
// editor can.
const UPLOAD_ROLES = ['ts-icon-editor', 'ts-icon-admin'];

/**
 * Pure role check: does this set of Keycloak client roles include one that
 * grants upload permission?
 *
 * This does not know about `KEYCLOAK_ENABLED` — callers that need the "local
 * dev without Keycloak is fully trusted" behavior should use `useCanUpload()`
 * instead, or apply that check themselves before calling this.
 */
export function hasUploadPermission(roles: string[]): boolean {
  return UPLOAD_ROLES.some((role) => roles.includes(role));
}

/**
 * Whether the current user can use upload functionality (file upload, load
 * image from URL, crop & send). When Keycloak is disabled (local development
 * without a Keycloak instance), this always returns true, matching how the
 * rest of the app treats that mode as fully-trusted local development.
 *
 * This is a frontend convenience check only, so users don't fill out a whole
 * form only to hit a permission error on submit. It is not a security
 * boundary — that is enforced server-side.
 */
export function useCanUpload(): boolean {
  const { roles } = useAuth();
  if (!KEYCLOAK_ENABLED) return true;
  return hasUploadPermission(roles);
}
