import React from 'react';
import { Navigate } from 'react-router-dom';
import { useIsAdmin } from '../auth/permissions';

interface RequireAdminProps {
  children: React.ReactNode;
}

// Same redirect pattern as RequireUpload, but gated to the admin role
// specifically rather than editor-or-admin -- used for the banner-URL
// management page, a deliberate UI-level restriction (see permissions.ts's
// useIsAdmin doc comment for why).
const RequireAdmin: React.FC<RequireAdminProps> = ({ children }) => {
  const isAdmin = useIsAdmin();
  if (!isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }
  return <>{children}</>;
};

export default RequireAdmin;
