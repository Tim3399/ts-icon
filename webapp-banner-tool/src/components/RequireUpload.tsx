import React from 'react';
import { Navigate } from 'react-router-dom';
import { useCanUpload } from '../auth/permissions';

interface RequireUploadProps {
  children: React.ReactNode;
}

// Wraps a route element and redirects to /access-denied instead of
// rendering it when the current user lacks upload permission -- defense in
// depth per-route, rather than relying solely on a single top-level check
// in App.tsx. Someone navigating (or deep-linking) directly to a protected
// route never sees its contents mount at all.
const RequireUpload: React.FC<RequireUploadProps> = ({ children }) => {
  const canUpload = useCanUpload();
  if (!canUpload) {
    return <Navigate to="/access-denied" replace />;
  }
  return <>{children}</>;
};

export default RequireUpload;
