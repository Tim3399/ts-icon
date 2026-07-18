const PUBLIC_API_URL = import.meta.env.VITE_PUBLIC_API_URL || "http://localhost:3000";
const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || "http://localhost:3001";

export const API_URL = `${ADMIN_API_URL}/images-local/`;
export const VIEW_IMAGE_URL = `${PUBLIC_API_URL}/images/`;
export const GET_IMAGE_URL = `${ADMIN_API_URL}/images-local/img-from-url`;
export const GET_CHANNELS_LIST_URL = `${ADMIN_API_URL}/images-local/channels`;

// Keycloak Configuration
//
// Keycloak can only be turned off when actually running on localhost (local
// development without a Keycloak instance at hand). On any other hostname,
// VITE_KEYCLOAK_ENABLED is ignored and authentication is always required.
const HOSTNAME = typeof window !== 'undefined' ? window.location.hostname : '';
const IS_LOCALHOST = HOSTNAME === 'localhost' || HOSTNAME === '127.0.0.1' || HOSTNAME === '::1';

export const KEYCLOAK_ENABLED = IS_LOCALHOST
  ? import.meta.env.VITE_KEYCLOAK_ENABLED !== 'false'
  : true;
export const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080";
export const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || "ts-icon";
export const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "webapp-banner-tool";