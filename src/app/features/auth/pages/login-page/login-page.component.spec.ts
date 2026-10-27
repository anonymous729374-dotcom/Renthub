import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { LoginPageComponent } from './login-page.component';

describe('LoginPageComponent', () => {
  function setup(signIn: ReturnType<typeof vi.fn>) {
    TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { signIn } }],
    });
    const fixture = TestBed.createComponent(LoginPageComponent);
    const component = fixture.componentInstance;
    component.form.setValue({ email: 'jayant@gmail.com', password: 'valid-password' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    return { component, fixture, navigate };
  }

  it('explains that an existing email may still need confirmation', async () => {
    const signIn = vi.fn().mockRejectedValue({ code: 'email_not_confirmed', message: 'Email not confirmed' });
    const { component, navigate } = setup(signIn);
    await component.submit();
    expect(component.errorMessage()).toContain('does not necessarily confirm an account created earlier');
    expect(component.loading()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('explains invalid credentials', async () => {
    const { component } = setup(vi.fn().mockRejectedValue(new Error('Invalid login credentials')));
    await component.submit();
    expect(component.errorMessage()).toContain('Email or password is incorrect');
  });

  it('explains rate limits without retrying', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('Too many requests'));
    const { component } = setup(signIn);
    await component.submit();
    expect(component.errorMessage()).toContain('wait a few minutes');
    expect(signIn).toHaveBeenCalledOnce();
  });

  it('preserves successful login navigation', async () => {
    const { component, navigate } = setup(vi.fn().mockResolvedValue(undefined));
    await component.submit();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(component.errorMessage()).toBe('');
    expect(component.loading()).toBe(false);
  });

  it('disables the button only for an invalid form or while login is pending', async () => {
    let finishSignIn!: () => void;
    const { component, fixture } = setup(vi.fn(() => new Promise<void>(resolve => { finishSignIn = resolve; })));
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    const request = component.submit();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    finishSignIn();
    await request;
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBe('false');

    component.form.controls.email.setValue('');
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });

  it.each(['demo@gmail', 'demo@', '@gmail.com', 'demo gmail.com', 'demo@gmail..com', 'demo@.com'])(
    'rejects malformed login email %s before calling Supabase', async email => {
      const signIn = vi.fn();
      const { component } = setup(signIn);
      component.form.controls.email.setValue(email);
      expect(component.form.controls.email.invalid).toBe(true);
      await component.submit();
      expect(signIn).not.toHaveBeenCalled();
    },
  );

  it.each(['demo@gmail.com', 'user.name@outlook.com', 'first.last@example.co.in'])(
    'accepts valid login email %s', email => {
      const { component } = setup(vi.fn());
      component.form.controls.email.setValue(email);
      expect(component.form.controls.email.valid).toBe(true);
    },
  );

  it('trims outer whitespace from a valid login email before submission', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    const { component } = setup(signIn);
    component.form.controls.email.setValue('  first.last@example.co.in  ');
    expect(component.form.controls.email.valid).toBe(true);
    await component.submit();
    expect(signIn.mock.calls[0][0].email).toBe('first.last@example.co.in');
  });
});
