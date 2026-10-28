import { DestroyRef, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../config/supabase.client';
import {
  ApplicationRole,
  AuthCredentials,
  AuthUser,
  ListerApplicationStatus,
  SignupCredentials,
} from './auth.models';

type ProfileRecord = {
  full_name: string | null;
  role: ApplicationRole;
  lister_status: ListerApplicationStatus;
  is_suspended: boolean;
};
export type AdminProfileRecord = {
  id: string;
  email: string;
  full_name: string;
  role: ApplicationRole;
  lister_status: ListerApplicationStatus;
  is_suspended: boolean;
  created_at: string;
};
export type AuthInitializationState = 'restoring' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(null);
  readonly user$ = this.userSubject.asObservable();
  private readonly initializationStateSubject = new BehaviorSubject<AuthInitializationState>(
    'restoring',
  );
  readonly initializationState$ = this.initializationStateSubject.asObservable();
  private initialization: Promise<void> | null = null;
  private profileResolution: Promise<void> | null = null;
  private profileResolutionUserId: string | null = null;
  private authGeneration = 0;

  constructor() {
    const { data } = this.supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        const user = session?.user ?? null;
        if (event === 'INITIAL_SESSION') return;
        if (!user) {
          this.authGeneration++;
          this.profileResolution = null;
          this.profileResolutionUserId = null;
          this.initialization = null;
          this.setUser(null);
          this.markInitialized();
          return;
        }
        if (event === 'TOKEN_REFRESHED' && this.currentUser?.id === user.id) return;
        if (
          this.currentUser?.id === user.id &&
          this.profileResolutionUserId === user.id &&
          this.profileResolution !== null &&
          this.initializationState === 'restoring'
        ) {
          return;
        }
        if (
          this.currentUser?.id === user.id &&
          this.currentUser.role !== null &&
          this.initializationState === 'ready'
        ) {
          return;
        }
        this.authGeneration++;
        this.profileResolution = null;
        this.profileResolutionUserId = null;
        this.initialization = null;
        this.initializationStateSubject.next('restoring');
        this.setUser(user, null);
        queueMicrotask(() => void this.resolveUserProfile(user));
      },
    );
    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
    void this.initialize().catch(() => undefined);
  }

  get currentUser(): AuthUser | null {
    return this.userSubject.value;
  }
  get isAuthenticated(): boolean {
    return this.currentUser !== null;
  }
  get initializationState(): AuthInitializationState {
    return this.initializationStateSubject.value;
  }

  initialize(): Promise<void> {
    if (this.initializationState === 'ready' || this.initializationState === 'error')
      return Promise.resolve();
    if (this.profileResolution && this.initializationState === 'restoring')
      return this.profileResolution;
    if (!this.initialization) {
      this.initializationStateSubject.next('restoring');
      this.initialization = this.restoreUser().catch((error: unknown) => {
        this.initializationStateSubject.next('error');
        throw error;
      });
    }
    return this.initialization;
  }

  private async restoreUser(): Promise<void> {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      if (this.profileResolution && this.initializationState === 'restoring') {
        await this.profileResolution;
      } else {
        this.setUser(null);
        this.markInitialized();
      }
      return;
    }
    // getSession() restores the SDK-managed persisted session (and refreshes it
    // when needed). Avoid a second auth network request here: transient getUser
    // failures must not turn a valid restored session into a logged-out UI.
    await this.resolveUserProfile(data.session.user);
  }

  async signUp(credentials: SignupCredentials): Promise<{ authenticated: boolean }> {
    const email = credentials.email.trim();
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password: credentials.password,
      options: { data: { full_name: credentials.fullName.trim() } },
    });
    if (error) throw error;

    // Confirmation settings are controlled by Supabase. Trust the response, not
    // an assumption that signup always creates an authenticated session.
    if (!data.session || !data.user) {
      this.authGeneration++;
      this.profileResolution = null;
      this.profileResolutionUserId = null;
      this.initialization = null;
      this.setUser(null);
      this.markInitialized();
      return { authenticated: false };
    }

    // Resolve trusted profile permissions before exposing role-based navigation.
    await this.resolveUserProfile(data.user);
    return { authenticated: true };
  }

  async signIn(credentials: AuthCredentials): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      ...credentials,
      email: credentials.email.trim(),
    });
    if (error) throw error;
    if (!data.session || !data.user)
      throw new Error('Supabase did not return an active session. Please try signing in again.');
    await this.resolveUserProfile(data.user);
  }

  async signOut(): Promise<void> {
    try {
      const { error } = await this.supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } finally {
      // Clear local app state even if a remote auth request fails.
      this.authGeneration++;
      this.profileResolution = null;
      this.profileResolutionUserId = null;
      this.initialization = null;
      this.setUser(null);
      this.markInitialized();
      await this.router.navigate(['/login']);
    }
  }

  async applyForListerApproval(): Promise<void> {
    const user = this.currentUser;
    if (!user) throw new Error('Please sign in to apply to become a lister.');
    const { data, error } = await this.supabase.rpc('apply_for_lister_approval');
    if (error) throw error;
    if (data !== true)
      throw new Error(
        'The lister application was not accepted. Please refresh your profile and try again.',
      );
    // The trusted RPC returns true only after changing this user's request to
    // pending. Avoid a second auth/profile network read before completing UI.
    if (this.currentUser?.id === user.id) {
      this.userSubject.next({ ...user, listerStatus: 'pending' });
    }
  }

  async adminReviewLister(userId: string, approve: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('admin_review_lister_application', {
      p_user_id: userId,
      p_approve: approve,
    });
    if (error) throw error;
  }

  async adminSetSuspended(userId: string, suspended: boolean): Promise<void> {
    const { error } = await this.supabase.rpc('admin_set_user_suspended', {
      p_user_id: userId,
      p_suspended: suspended,
    });
    if (error) throw error;
  }

  async getAdminProfiles(page = 1, pageSize = 10): Promise<{ items: AdminProfileRecord[]; total: number }> {
    const safePage = Math.max(1, Math.floor(page)), safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const from = (safePage - 1) * safeSize;
    const { data, error, count } = await this.supabase
      .from('profiles')
      .select('id,email,full_name,role,lister_status,is_suspended,created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, from + safeSize - 1);
    if (error) throw error;
    return { items: (data ?? []) as AdminProfileRecord[], total: count ?? 0 };
  }

  async getPendingAdminProfiles(page = 1, pageSize = 10): Promise<{ items: AdminProfileRecord[]; total: number }> {
    const safePage = Math.max(1, Math.floor(page)), safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const from = (safePage - 1) * safeSize;
    const { data, error, count } = await this.supabase.from('profiles')
      .select('id,email,full_name,role,lister_status,is_suspended,created_at', { count: 'exact' })
      .eq('role', 'user').eq('lister_status', 'pending')
      .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, from + safeSize - 1);
    if (error) throw error;
    return { items: (data ?? []) as AdminProfileRecord[], total: count ?? 0 };
  }

  private resolveUserProfile(user: User): Promise<void> {
    if (
      this.profileResolution &&
      this.profileResolutionUserId === user.id &&
      this.initializationState === 'restoring'
    ) {
      return this.profileResolution;
    }

    if (
      this.currentUser?.id === user.id &&
      this.currentUser.role !== null &&
      this.initializationState === 'ready'
    ) {
      return Promise.resolve();
    }

    const generation = ++this.authGeneration;
    this.initializationStateSubject.next('restoring');
    this.profileResolutionUserId = user.id;
    this.setUser(user, null);
    const resolution = (async () => {
      try {
        const profile = await this.readProfile(user.id);
        if (generation !== this.authGeneration) return;
        if (
          !profile ||
          !profile.role ||
          !profile.lister_status ||
          typeof profile.is_suspended !== 'boolean'
        ) {
          this.setUser(user, null);
          this.initializationStateSubject.next('error');
          return;
        }
        this.setUser(user, profile);
        this.markInitialized();
      } catch {
        if (generation !== this.authGeneration) return;
        // Keep the authenticated identity, but leave role/approval/suspension
        // unknown so the UI and guards fail closed instead of assuming renter.
        this.setUser(user, null);
        this.initializationStateSubject.next('error');
      }
    })();
    this.profileResolution = resolution;
    this.initialization = resolution;
    return resolution;
  }

  private async readProfile(userId: string): Promise<ProfileRecord | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('full_name,role,lister_status,is_suspended')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return data as ProfileRecord;
  }

  private setUser(user: User | null, profile?: ProfileRecord | null): void {
    if (!user) {
      this.userSubject.next(null);
      return;
    }
    this.userSubject.next({
      id: user.id,
      email: user.email ?? '',
      fullName:
        profile?.full_name ?? (user.user_metadata?.['full_name'] as string | undefined) ?? '',
      role: profile?.role ?? null,
      listerStatus: profile?.lister_status ?? null,
      isSuspended: profile?.is_suspended ?? null,
    });
  }

  private markInitialized(): void {
    this.initializationStateSubject.next('ready');
  }
}
