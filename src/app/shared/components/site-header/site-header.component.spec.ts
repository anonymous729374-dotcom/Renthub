import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthUser } from '../../../core/auth/auth.models';
import { UnreadMessagesService } from '../../../features/inquiries/services/unread-messages.service';
import { SiteHeaderComponent } from './site-header.component';

@Component({ standalone: true, template: '' })
class EmptyRouteComponent {}

describe('SiteHeaderComponent', () => {
  async function setup(
    user: AuthUser | null,
    initialState: 'restoring' | 'ready' | 'error' = 'ready',
  ) {
    const userSubject = new BehaviorSubject<AuthUser | null>(user);
    const initializationSubject = new BehaviorSubject(initialState);
    const unreadCount = signal(0);
    const hasNewIncomingMessage = signal(false);
    TestBed.configureTestingModule({
      imports: [SiteHeaderComponent],
      providers: [
        provideRouter([
          { path: '', component: EmptyRouteComponent },
          { path: 'login', component: EmptyRouteComponent },
          { path: 'signup', component: EmptyRouteComponent },
          { path: 'admin', component: EmptyRouteComponent },
          { path: 'messages', component: EmptyRouteComponent },
        ]),
        {
          provide: AuthService,
          useValue: {
            get currentUser() { return userSubject.value; },
            get initializationState() { return initializationSubject.value; },
            user$: userSubject.asObservable(),
            initializationState$: initializationSubject.asObservable(),
            signOut: vi.fn(),
          },
        },
        { provide: UnreadMessagesService, useValue: { unreadCount, hasNewIncomingMessage } },
      ],
    });
    const fixture = TestBed.createComponent(SiteHeaderComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    return { fixture, router, userSubject, initializationSubject, unreadCount, hasNewIncomingMessage };
  }

  it('does not show logged-out navigation while the persisted session is restoring', async () => {
    const admin: AuthUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      role: 'admin',
      listerStatus: 'approved',
      isSuspended: false,
    };
    const { fixture, initializationSubject } = await setup(admin, 'restoring');
    expect(fixture.nativeElement.querySelector('.auth-restoring')?.textContent).toContain(
      'Loading your account',
    );
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();

    initializationSubject.next('ready');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a[href="/admin"]').length).toBe(1);
  });

  it('withholds role-specific links until trusted profile permissions are ready', async () => {
    const unresolved: AuthUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      role: null,
      listerStatus: null,
      isSuspended: null,
    };
    const { fixture, userSubject, initializationSubject } = await setup(unresolved, 'restoring');
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();

    userSubject.next({ ...unresolved, role: 'admin', listerStatus: 'approved', isSuspended: false });
    initializationSubject.next('ready');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a[href="/admin"]').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('a[href="/apartments/new"]').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('a[href="/my-apartments"]').length).toBe(1);
  });

  it('renders the admin link once for an admin and hides application links on login/signup routes', async () => {
    const admin: AuthUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      role: 'admin',
      listerStatus: 'approved',
      isSuspended: false,
    };
    const { fixture, router } = await setup(admin);
    expect(fixture.nativeElement.querySelectorAll('a[href="/admin"]').length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('a[href="/apartments/new"]').length).toBe(1);

    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('nav[aria-label="Public navigation"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('a[href="/admin"]').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('a[href="/my-apartments"]').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('a[href="/profile"]').length).toBe(0);

    await router.navigateByUrl('/signup');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('nav[aria-label="Public navigation"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('a[href="/admin"]').length).toBe(0);
  });

  it('does not render an admin link for a renter', async () => {
    const renter: AuthUser = {
      id: 'renter-1',
      email: 'renter@example.com',
      fullName: 'Renter',
      role: 'user',
      listerStatus: 'none',
      isSuspended: false,
    };
    const { fixture } = await setup(renter);
    expect(fixture.nativeElement.querySelectorAll('a[href="/admin"]').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('a[href="/messages"]').length).toBe(1);
  });

  it('shows a capped unread count next to Messages and hides it at zero', async () => {
    const renter: AuthUser = {
      id: 'renter-1',
      email: 'renter@example.com',
      fullName: 'Renter',
      role: 'user',
      listerStatus: 'none',
      isSuspended: false,
    };
    const { fixture, unreadCount } = await setup(renter);
    expect(fixture.nativeElement.querySelector('.unread-badge')).toBeNull();

    unreadCount.set(12);
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.unread-badge') as HTMLElement;
    expect(badge.textContent.trim()).toBe('9+');
    expect(badge.getAttribute('aria-label')).toBe('12 unread messages');

    unreadCount.set(0);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.unread-badge')).toBeNull();
  });

  it('highlights Messages immediately on an incoming event while the count refreshes', async () => {
    const renter: AuthUser = {
      id: 'renter-1',
      email: 'renter@example.com',
      fullName: 'Renter',
      role: 'user',
      listerStatus: 'none',
      isSuspended: false,
    };
    const { fixture, hasNewIncomingMessage } = await setup(renter);
    hasNewIncomingMessage.set(true);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a[href="/messages"]') as HTMLAnchorElement;
    expect(link.classList.contains('has-unread')).toBe(true);
    expect(link.querySelector('.unread-badge')?.textContent.trim()).toBe('New');
    expect(link.getAttribute('aria-label')).toContain('New message received');
  });

  it('switches to public navigation as soon as logout clears the auth observable', async () => {
    const admin: AuthUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      role: 'admin',
      listerStatus: 'approved',
      isSuspended: false,
    };
    const { fixture, userSubject } = await setup(admin);
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Logout');

    userSubject.next(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('a[href="/admin"]').length).toBe(0);
    expect(fixture.nativeElement.querySelector('a[href="/login"]')?.textContent).toContain('Login');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
