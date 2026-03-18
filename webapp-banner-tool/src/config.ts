export const API_URL = "http://localhost:3001/images-local/";
export const VIEW_IMAGE_URL = "http://localhost:3000/images/";
export const GET_IMAGE_URL = "http://localhost:3001/images-local/img-from-url";
export const GET_CHANNELS_LIST_URL = "http://localhost:3001/images-local/channels";

// Keycloak Configuration
export const KEYCLOAK_ENABLED = import.meta.env.VITE_KEYCLOAK_ENABLED !== 'false';
export const KEYCLOAK_URL = "http://localhost:8080";
export const KEYCLOAK_REALM = "ts-icon";
export const KEYCLOAK_CLIENT_ID = "webapp-banner-tool";