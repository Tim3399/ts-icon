const PUBLIC_API_URL = import.meta.env.VITE_PUBLIC_API_URL || "http://localhost:3000";
const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || "http://localhost:3001";

export const API_URL = `${ADMIN_API_URL}/images-local/`;
export const VIEW_IMAGE_URL = `${PUBLIC_API_URL}/images/`;
export const GET_IMAGE_URL = `${ADMIN_API_URL}/images-local/img-from-url`;
export const GET_CHANNELS_LIST_URL = `${ADMIN_API_URL}/images-local/channels`;

// Keycloak Configuration
export const KEYCLOAK_ENABLED = import.meta.env.VITE_KEYCLOAK_ENABLED !== 'false';
export const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:8080";
export const KEYCLOAK_REALM = import.meta.env.VITE_KEYCLOAK_REALM || "ts-icon";
export const KEYCLOAK_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "webapp-banner-tool";