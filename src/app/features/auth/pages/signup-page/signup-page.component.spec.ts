import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { SignupPageComponent } from './signup-page.component';

describe('SignupPageComponent', () => {
  function setup(signUp: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      imports: [SignupPageComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { signUp } }],
    });
    const fixture = TestBed.createComponent(SignupPageComponent);
    const component = fixture.componentInstance;
    component.form.setValue({ fullName: 'Renter Person', email: 'renter@example.com', password: 'valid-password' });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    return { component, navigate };
  }

  it('redirects to the same home destination as successful login when signup returns a session', async () => {
    const signUp = vi.fn().mockResolvedValue({ authenticated: true });
    const { component, navigate } = setup(signUp);
    await component.submit();
    expect(signUp).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(component.errorMessage()).toBe('');
    expect(component.loading()).toBe(false);
  });

  it('does not navigate or claim sign-in when signup returns no session', async () => {
    const signUp = vi.fn().mockResolvedValue({ authenticated: false });
    const { component, navigate } = setup(signUp);
    await component.submit();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.successMessage()).toContain('you are not signed in');
    expect(component.loading()).toBe(false);
  });

  it('prevents a second signup while the first request is pending', async () => {
    let finishSignup!: (value: { authenticated: boolean }) => void;
    const signUp = vi.fn(() => new Promise<{ authenticated: boolean }>(resolve => { finishSignup = resolve; }));
    const { component } = setup(signUp);
    const first = component.submit();
    await component.submit();
    expect(signUp).toHaveBeenCalledOnce();
    finishSignup({ authenticated: false });
    await first;
    expect(component.loading()).toBe(false);
  });

  it('clears loading and shows an error when signup fails', async () => {
    const signUp = vi.fn().mockRejectedValue(new Error('Supabase signup failed'));
    const { component } = setup(signUp);
    await component.submit();
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBe('Supabase signup failed');
  });

  it('reports a rejected router navigation without keeping the submit state active', async () => {
    const signUp = vi.fn().mockResolvedValue({ authenticated: true });
    const { component, navigate } = setup(signUp);
    navigate.mockResolvedValue(false);
    await component.submit();
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toContain('could not open the home page');
  });

  it.each(['demo@gmail', 'demo@', '@gmail.com', 'demo gmail.com', 'demo@gmail..com', 'demo@.com'])(
    'rejects malformed signup email %s before calling Supabase', async email => {
      const signUp = vi.fn();
      const { component } = setup(signUp);
      component.form.controls.email.setValue(email);
      expect(component.form.controls.email.invalid).toBe(true);
      await component.submit();
      expect(signUp).not.toHaveBeenCalled();
    },
  );

  it('trims outer whitespace from a valid signup email before submission', async () => {
    const signUp = vi.fn().mockResolvedValue({ authenticated: false });
    const { component } = setup(signUp);
    component.form.controls.email.setValue('  user.name@outlook.com  ');
    expect(component.form.controls.email.valid).toBe(true);
    await component.submit();
    expect(signUp.mock.calls[0][0].email).toBe('user.name@outlook.com');
  });
});
