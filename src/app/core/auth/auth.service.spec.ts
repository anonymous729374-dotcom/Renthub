import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SUPABASE_CLIENT } from '../config/supabase.client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('restores the authenticated user from the Supabase session', async () => {
    const user = {
      id: 'user-1',
      email: 'renter@example.com',
      user_metadata: { full_name: 'Renter' },
    };
    const client = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({
          data: { session: { user, access_token: 'valid-test-token' } },
          error: null,
        }),
        getUser: async () => ({ data: { user }, error: null }),
        signOut: async () => ({ error: null }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                full_name: 'Renter',
                role: 'user',
                lister_status: 'none',
                is_suspended: false,
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(AuthService);
    await service.initialize();
    expect(service.currentUser).toEqual({
      id: 'user-1',
      email: 'renter@example.com',
      fullName: 'Renter',
      role: 'user',
      listerStatus: 'none',
      isSuspended: false,
    });
    expect(service.isAuthenticated).toBe(true);
    expect(service.initializationState).toBe('ready');
  });

  it('always creates a normal-user signup without sending a role', async () => {
    let submittedMetadata: Record<string, unknown> | undefined;
    const user = {
      id: 'new-user',
      email: 'renter@example.com',
      user_metadata: { full_name: 'Renter Person' },
    };
    const client = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signUp: async (input: {
          email: string;
          password: string;
          options: { data: Record<string, unknown> };
        }) => {
          submittedMetadata = input.options.data;
          expect(input.email).toBe('renter@example.com');
          expect(input.password).toBe('valid-password');
          return { data: { user, session: { user, access_token: 'new-token' } }, error: null };
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                full_name: 'Renter Person',
                role: 'user',
                lister_status: 'none',
                is_suspended: false,
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(AuthService);
    const result = await service.signUp({
      fullName: ' Renter Person ',
      email: 'renter@example.com',
      password: 'valid-password',
    });
    expect(submittedMetadata).toEqual({ full_name: 'Renter Person' });
    expect(submittedMetadata).not.toHaveProperty('admin');
    expect(submittedMetadata).not.toHaveProperty('role');
    expect(result.authenticated).toBe(true);
    expect(service.currentUser?.role).toBe('user');
    expect(service.isAuthenticated).toBe(true);
  });

  it('does not authenticate when signup returns a user without a session', async () => {
    const user = {
      id: 'pending-user',
      email: 'renter@example.com',
      user_metadata: { full_name: 'Renter' },
    };
    const client = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signUp: async () => ({ data: { user, session: null }, error: null }),
      },
    };
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(AuthService);
    const result = await service.signUp({
      fullName: 'Renter',
      email: 'renter@example.com',
      password: 'valid-password',
    });
    expect(result.authenticated).toBe(false);
    expect(service.currentUser).toBeNull();
    expect(service.isAuthenticated).toBe(false);
  });

  it('keeps role-dependent state unresolved until the trusted profile query settles', async () => {
    const user = {
      id: 'new-user',
      email: 'renter@example.com',
      user_metadata: { full_name: 'Renter' },
    };
    let resolveProfile!: (result: {
      data: { full_name: string; role: string; lister_status: string; is_suspended: boolean };
      error: null;
    }) => void;
    const client = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user }, error: null }),
        signUp: async () => ({
          data: { user, session: { user, access_token: 'new-token' } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => new Promise((resolve) => { resolveProfile = resolve; }),
          }),
        }),
      }),
    };
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(AuthService);
    const signup = service.signUp({
      fullName: 'Renter',
      email: 'renter@example.com',
      password: 'valid-password',
    });
    await Promise.resolve();
    expect(service.currentUser?.role).toBeNull();
    expect(service.initializationState).toBe('restoring');
    resolveProfile({ data: { full_name: 'Renter', role: 'user', lister_status: 'none', is_suspended: false }, error: null });
    const result = await signup;
    expect(result.authenticated).toBe(true);
    expect(service.isAuthenticated).toBe(true);
    expect(service.currentUser?.role).toBe('user');
  });

  it('restores the persisted session without a second auth request that can fail transiently', async () => {
    const user = {
      id: 'persisted-user',
      email: 'renter@example.com',
      user_metadata: { full_name: 'Renter' },
    };
    const getUser = vi.fn(async () => ({
      data: { user: null },
      error: new Error('temporary network error'),
    }));
    const client = {
      auth: {
        onAuthStateChange: (_callback: (event: string, session: unknown) => void) => ({
          data: { subscription: { unsubscribe: () => undefined } },
        }),
        getSession: async () => ({
          data: { session: { user, access_token: 'expired-token' } },
          error: null,
        }),
        getUser,
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                full_name: 'Renter',
                role: 'user',
                lister_status: 'none',
                is_suspended: false,
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(AuthService);
    await service.initialize();
    expect(service.isAuthenticated).toBe(true);
    expect(service.currentUser?.id).toBe('persisted-user');
    expect(getUser).not.toHaveBeenCalled();
  });

  it('requires an active Supabase session for login and restores profile role safely', async () => {
    const user = {
      id: 'approved-lister',
      email: 'lister@example.com',
      user_metadata: { full_name: 'Lister' },
    };
    const client = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithPassword: async () => ({
          data: { user, session: { user, access_token: 'login-token' } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                full_name: 'Lister',
                role: 'lister',
                lister_status: 'approved',
                is_suspended: false,
              },
              error: null,
            }),
          }),
        }),
      }),
    };
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(AuthService);
    await service.signIn({ email: 'lister@example.com', password: 'valid-password' });
    expect(service.currentUser?.role).toBe('lister');
    expect(service.currentUser?.listerStatus).toBe('approved');
  });

  it('uses the trusted lister RPC result without promoting the user or extra profile requests', async () => {
    const user = {
      id: 'renter-43',
      email: 'renter@example.com',
      user_metadata: { full_name: 'Renter' },
    };
    const authGetUser = vi.fn();
    const rpc = vi.fn(async (name: string) => {
      expect(name).toBe('apply_for_lister_approval');
      return { data: true, error: null };
    });
    const client = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: authGetUser,
        signInWithPassword: async () => ({
          data: { user, session: { user, access_token: 'login-token' } },
          error: null,
        }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                full_name: 'Renter',
                role: 'user',
                lister_status: 'none',
                is_suspended: false,
              },
              error: null,
            }),
          }),
        }),
      }),
      rpc,
    };
    TestBed.configureTestingModule({
      providers: [AuthService, provideRouter([]), { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(AuthService);
    await service.signIn({ email: user.email, password: 'valid-password' });
    await service.applyForListerApproval();
    expect(rpc).toHaveBeenCalledOnce();
    expect(service.currentUser?.role).toBe('user');
    expect(service.currentUser?.listerStatus).toBe('pending');
    expect(authGetUser).not.toHaveBeenCalled();
  });

  it('clears local authentication state on logout', async () => {
    const user = {
      id: 'user-1',
      email: 'renter@example.com',
      user_metadata: { full_name: 'Renter' },
    };
    const client = {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        getSession: async () => ({
          data: { session: { user, access_token: 'valid-test-token' } },
          error: null,
        }),
        getUser: async () => ({ data: { user }, error: null }),
        signOut: async (options: { scope: string }) => {
          expect(options.scope).toBe('local');
          return { error: null };
        },
      },
    };
    const router = { navigate: vi.fn(async () => true) };
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: router },
        { provide: SUPABASE_CLIENT, useValue: client },
      ],
    });
    const service = TestBed.inject(AuthService);
    await service.initialize();
    await service.signOut();
    expect(service.currentUser).toBeNull();
    expect(service.isAuthenticated).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
