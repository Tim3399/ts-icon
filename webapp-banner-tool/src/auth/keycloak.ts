import Keycloak from 'keycloak-js';
import { KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } from '../config';

// NOTE: `pkceMethod` is not part of keycloak-js's constructor config type
// (KeycloakConfig only allows url/realm/clientId) — it belongs on the
// KeycloakInitOptions passed to `keycloak.init(...)` instead. It is set
// there (in AuthProvider.tsx) to enforce Authorization Code Flow + PKCE
// (S256), never implicit flow.
const keycloak = new Keycloak({
  url: KEYCLOAK_URL,
  realm: KEYCLOAK_REALM,
  clientId: KEYCLOAK_CLIENT_ID,
});

export default keycloak;
