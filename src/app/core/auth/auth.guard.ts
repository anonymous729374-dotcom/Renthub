
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  try {
    await auth.initialize();
  } catch {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  if (auth.isAuthenticated) {
    if (auth.currentUser?.isSuspended && state.url !== '/profile') {
      return router.createUrlTree(['/profile'], { queryParams: { suspended: 'true' } });
    }
    return true;
  }

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

export const listerGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try { await auth.initialize(); } catch {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (!auth.isAuthenticated) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (auth.currentUser?.isSuspended && state.url !== '/profile') return router.createUrlTree(['/profile'], { queryParams: { suspended: 'true' } });
  const user = auth.currentUser;
  return user?.role === 'admin' || (user?.role === 'lister' && user.listerStatus === 'approved')
    ? true
    : router.createUrlTree(['/profile'], { queryParams: { applyLister: 'true' } });
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try { await auth.initialize(); } catch {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  if (!auth.isAuthenticated) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (auth.currentUser?.isSuspended) return router.createUrlTree(['/profile'], { queryParams: { suspended: 'true' } });
  return auth.currentUser?.role === 'admin' ? true : router.createUrlTree(['/'], { queryParams: { accessDenied: 'true' } });
};
