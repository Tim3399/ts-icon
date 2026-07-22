import { useAuth } from './AuthProvider';
import {
  KEYCLOAK_ENABLED,
  KEYCLOAK_ADMIN_ROLE,
  KEYCLOAK_EDITOR_ROLE,
} from '../config';

// Realm roles that grant upload permission in the Keycloak realm this
// project uses. Configurable (VITE_KEYCLOAK_EDITOR_ROLE/VITE_KEYCLOAK_ADMIN_ROLE,
// see config.ts) rather than hardcoded, since the actual role names in a
// given realm may not be the ts-icon-* defaults. Both are treated equally
// here: an admin can do anything an editor can.
const UPLOAD_ROLES = [KEYCLOAK_EDITOR_ROLE, KEYCLOAK_ADMIN_ROLE];

/**
 * Pure role check: does this set of Keycloak realm roles include one that
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

/**
 * Pure role check: does this set of Keycloak realm roles include the admin
 * role specifically? Unlike `hasUploadPermission`, the editor role does not
 * satisfy this -- used to gate the banner-URL management page to admins
 * only. The backend's banner-url endpoints require the admin role too (not
 * just editor, unlike every other write endpoint), since a bulk write across
 * every real TeamSpeak channel is more consequential than a routine banner
 * upload -- this frontend check mirrors that real server-side boundary
 * rather than being the only thing enforcing it.
 */
export function hasAdminPermission(roles: string[]): boolean {
  return roles.includes(KEYCLOAK_ADMIN_ROLE);
}

/**
 * Whether the current user is an admin. Same local-dev bypass as
 * `useCanUpload()` when Keycloak is disabled, for the same reason (that mode
 * treats the whole app as fully-trusted local development). Frontend
 * convenience only, not a security boundary.
 */
export function useIsAdmin(): boolean {
  const { roles } = useAuth();
  if (!KEYCLOAK_ENABLED) return true;
  return hasAdminPermission(roles);
}
