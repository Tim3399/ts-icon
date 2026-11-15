import React from "react";
// Product import, allowed for this pattern only (README, "Layers"): the page
// has no props today and shows who is signed in and a way out.
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../primitives/Button";
import { Notice } from "./Notice";

// Every route in this app (channel list, upload, gallery) requires at
// least the editor role on the backend -- there is currently no
// viewer-only mode, so a user with neither editor nor admin genuinely has
// nothing they can do here. Shown by App.tsx in place of the normal routes
// rather than letting each page render its own broken-looking, half-denied
// UI.
export const AccessDenied: React.FC = () => {
  const { username, logout } = useAuth();

  return (
    <Notice
      icon="lock"
      title="Access denied"
      actions={
        <Button icon="logout" onClick={logout}>
          Log out
        </Button>
      }
    >
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
    </Notice>
  );
};
