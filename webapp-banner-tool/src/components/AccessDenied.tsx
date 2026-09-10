import React from "react";
import { useAuth } from "../auth/AuthContext";
import Icon from "./ui/Icon";

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
          <Icon name="lock" size={22} />
        </div>
        <h1>Access denied</h1>
        <p>
          {username ? (
            <>
              Signed in as <strong>{username}</strong>, but this{" "}
            </>
          ) : (
            "This "
          )}
          account doesn't have permission to use this application. Contact an administrator if you
          believe this is a mistake.
        </p>
        <button type="button" className="btn btn-secondary" onClick={logout}>
          <Icon name="logout" size={15} />
          Log out
        </button>
      </div>
    </div>
  );
};

export default AccessDenied;
