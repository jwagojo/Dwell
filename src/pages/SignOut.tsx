import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../state/AppState';

/**
 * Clears the saved account, then sends the visitor to the landing page.
 * It is its own route so the page they were on has already unmounted when the account disappears. Otherwise a
 * guarded page (search, listing, session) would see "no user" first and redirect to sign-up instead of home.
 */
export default function SignOut() {
  const { signOut } = useApp();
  useEffect(() => {
    signOut();
  }, [signOut]);
  return <Navigate to="/" replace />;
}
