import React from 'react';
import { useAuth } from '../auth/AuthProvider';

// Every route in this app (channel list, upload, gallery) requires at
// least the editor role on the backend -- there is currently no
// viewer-only mode, so a user with neither editor nor admin genuinely has
// nothing they can do here. Shown by App.tsx in place of the normal routes
// rather than letting each page render its own broken-looking, half-denied
// UI.
const AccessDenied: React.FC = () => {
  const { username, logout } = useAuth();

  return (
    <div className="access-denied">
      <div className="card">
        <div className="access-denied-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>
        <h1>Access denied</h1>
        <p>
          {username ? <>Signed in as <strong>{username}</strong>, but this </> : 'This '}
          account doesn't have permission to use this application. Contact an
          administrator if you believe this is a mistake.
        </p>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          Log out
        </button>
      </div>
    </div>
  );
};

export default AccessDenied;
