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
  private initialized = false;
  private initialization: Promise<void> | null = null;
  private authEventObserved = false;

  constructor() {
    const { data } = this.supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        this.authEventObserved = true;
        const user = session?.user ?? null;
        this.setUser(user);
        if (user) queueMicrotask(() => void this.hydrateProfile(user.id));
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
    if (this.initialized) return Promise.resolve();
    if (!this.initialization) {
      this.initializationStateSubject.next('restoring');
      this.initialization = this.restoreUser().catch((error: unknown) => {
        this.initialization = null;
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
      if (!this.authEventObserved) this.setUser(null);
      this.markInitialized();
      return;
    }
    // getSession() restores the SDK-managed persisted session (and refreshes it
    // when needed). Avoid a second auth network request here: transient getUser
    // failures must not turn a valid restored session into a logged-out UI.
    const restoredUser = data.session.user;
    const profile = await this.readProfile(restoredUser.id);
    if (!this.authEventObserved || this.currentUser?.id === restoredUser.id)
      this.setUser(restoredUser, profile);
    this.markInitialized();
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
      this.markInitialized();
      return { authenticated: false };
    }

    // Establish the authenticated renter immediately. Profile lookup is
    // secondary metadata and must not hold up header state or signup routing.
    this.setUser(data.user);
    this.markInitialized();
    void this.hydrateProfile(data.user.id);
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
    this.setUser(data.user, await this.readProfile(data.user.id));
    this.markInitialized();
  }

  async signOut(): Promise<void> {
    try {
      const { error } = await this.supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } finally {
      // Clear local app state even if a remote auth request fails.
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

  private async hydrateProfile(userId: string): Promise<void> {
    try {
      if (this.currentUser?.id !== userId) return;
      const { data } = await this.supabase.auth.getUser();
      if (data.user?.id === userId) this.setUser(data.user, await this.readProfile(userId));
    } catch {
      // Keep the safe renter defaults already set from the authenticated user.
    }
  }

  private async readProfile(userId: string): Promise<ProfileRecord | null> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('full_name,role,lister_status,is_suspended')
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) return null;
      return data as ProfileRecord;
    } catch {
      return null;
    }
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
      role: profile?.role ?? 'user',
      listerStatus: profile?.lister_status ?? 'none',
      isSuspended: profile?.is_suspended ?? false,
    });
  }

  private markInitialized(): void {
    this.initialized = true;
    this.initializationStateSubject.next('ready');
  }
}
