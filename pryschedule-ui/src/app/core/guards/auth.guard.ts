import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  return router.parseUrl('/login');
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  return router.parseUrl('/dashboard');
};

/**
 * Platform-level admin only. Gates /admin/* routes (global form templates,
 * cross-tenant browse). A practice Admin who tries to navigate here is
 * bounced back to their dashboard rather than getting a 403, since they
 * can still do useful things at /dashboard.
 *
 * NOTE: Server-side authorization policies ("SuperAdmin", "ManageGlobals")
 * are the real gate — this guard is just a UX nicety to keep practice admins
 * from getting empty 403 pages.
 */
export const superAdminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isSuperAdmin()) return true;
  if (auth.isLoggedIn()) return router.parseUrl('/dashboard');
  return router.parseUrl('/login');
};

/** Any authenticated user (client or admin) may pass. */
export const clientGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  return router.parseUrl('/login');
};
