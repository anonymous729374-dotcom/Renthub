import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';
import { adminGuard, listerGuard } from './auth.guard';

describe('listerGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/apartments/new' } as RouterStateSnapshot;

  async function runGuard(user: { id: string; role: 'user' | 'lister' | 'admin'; listerStatus: 'none' | 'pending' | 'approved' | 'rejected'; isSuspended?: boolean } | null) {
    const routerStub = { createUrlTree: vi.fn((commands: string[], options?: unknown) => ({ commands, options })) };
    const authStub = {
      initialize: async () => undefined,
      get isAuthenticated() { return user !== null; },
      get currentUser() { return user ? { ...user, isSuspended: user.isSuspended ?? false, email: 'person@example.com', fullName: 'Person' } : null; },
    };
    await TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: Router, useValue: routerStub },
      ],
    });
    const result = await TestBed.runInInjectionContext(() => listerGuard(route, state));
    return { result, routerStub };
  }

  it('preserves the destination for a logged-out user', async () => {
    const { result, routerStub } = await runGuard(null);
    expect(result).not.toBe(true);
    expect(routerStub.createUrlTree).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: state.url } });
  });

  it('routes a renter to profile rather than granting listing access', async () => {
    const { result, routerStub } = await runGuard({ id: 'renter', role: 'user', listerStatus: 'pending' });
    expect(result).not.toBe(true);
    expect(routerStub.createUrlTree).toHaveBeenCalledWith(['/profile'], { queryParams: { applyLister: 'true' } });
  });

  it('allows a lister to access listing tools', async () => {
    const { result, routerStub } = await runGuard({ id: 'lister', role: 'lister', listerStatus: 'approved' });
    expect(result).toBe(true);
    expect(routerStub.createUrlTree).not.toHaveBeenCalled();
  });

  it('allows an admin through listing management routes', async () => {
    const { result } = await runGuard({ id: 'admin', role: 'admin', listerStatus: 'none' });
    expect(result).toBe(true);
  });

  it('restricts admin routes to admins', async () => {
    const routerStub = { createUrlTree: vi.fn((commands: string[], options?: unknown) => ({ commands, options })) };
    const authStub = { initialize: async () => undefined, isAuthenticated: true, currentUser: { id: 'renter', role: 'user', listerStatus: 'none', isSuspended: false } };
    await TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: authStub }, { provide: Router, useValue: routerStub }] });
    const result = await TestBed.runInInjectionContext(() => adminGuard(route, { url: '/admin' } as RouterStateSnapshot));
    expect(result).not.toBe(true);
    expect(routerStub.createUrlTree).toHaveBeenCalledWith(['/'], { queryParams: { accessDenied: 'true' } });
  });
});
