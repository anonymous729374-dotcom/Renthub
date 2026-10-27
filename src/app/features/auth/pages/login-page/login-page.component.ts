import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { emailAddressValidator } from '../../../../shared/validators/custom-validators';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-page">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <a class="back-link" routerLink="/">← Back to RentHub</a>
        <p class="eyebrow">Welcome back</p>
        <h1>Sign in to your account</h1>
        <p class="description">Continue your home search with RentHub.</p>

        <label for="email">Email address</label>
        <input id="email" type="email" formControlName="email" autocomplete="email" />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <small>Enter a valid email address.</small>
        }

        <label for="password">Password</label>
        <input id="password" type="password" formControlName="password" autocomplete="current-password" />
        @if (form.controls.password.touched && form.controls.password.invalid) {
          <small>Password is required.</small>
        }

        @if (errorMessage()) {
          <p class="error" role="alert">{{ errorMessage() }}</p>
        }

        <button type="submit" [disabled]="!form.valid || loading()" [attr.aria-busy]="loading()">
          {{ loading() ? 'Signing in…' : 'Sign in' }}
        </button>

        <p class="switch">
          Don't have an account? <a routerLink="/signup">Create one</a>
        </p>
      </form>
    </section>
  `,
  styles: `
    :host { display: block; }
    .auth-page { min-height: 75vh; display: grid; place-items: center; padding: 2rem 1rem; background: #f8fafc; }
    .auth-card { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: .75rem; padding: 2rem; border: 1px solid #e2e8f0; border-radius: 1rem; background: white; box-shadow: 0 12px 40px #0f172a0a; }
    .back-link, .switch a { color: #2563eb; text-decoration: none; }
    .eyebrow { margin: 1rem 0 0; color: #2563eb; font-size: .8rem; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; }
    h1 { margin: 0; color: #172554; font-size: 1.8rem; }
    .description, .switch { color: #64748b; }
    label { margin-top: .5rem; color: #334155; font-weight: 600; }
    input { width: 100%; box-sizing: border-box; padding: .8rem; border: 1px solid #cbd5e1; border-radius: .5rem; font: inherit; }
    input:focus { outline: 2px solid #93c5fd; border-color: #2563eb; }
    small, .error { color: #b91c1c; }
    button { margin-top: .75rem; padding: .9rem; border: 0; border-radius: .6rem; background: #2563eb; color: white; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .switch { text-align: center; font-size: .9rem; }
  `,
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group({
    email: ['', emailAddressValidator()],
    password: ['', Validators.required],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const values = this.form.getRawValue();
      await this.auth.signIn({ ...values, email: values.email.trim() });
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const isSafeInternalUrl = !!returnUrl
        && /^\/(?![\\/])/.test(returnUrl)
        && !returnUrl.includes('\\')
        && !/[\u0000-\u001f]/.test(returnUrl);
      await this.router.navigateByUrl(
        isSafeInternalUrl
          ? returnUrl
          : '/',
      );
    } catch (error) {
      this.errorMessage.set(this.loginErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private loginErrorMessage(error: unknown): string {
    const value = error as { code?: unknown; message?: unknown } | null;
    const code = typeof value?.code === 'string' ? value.code.toLowerCase() : '';
    const message = typeof value?.message === 'string' ? value.message : '';
    const normalized = `${code} ${message}`.toLowerCase();

    if (normalized.includes('invalid email') || normalized.includes('email address is invalid')) {
      return 'Enter a valid email address.';
    }

    if (normalized.includes('email_not_confirmed') || normalized.includes('email not confirmed')) {
      return 'This account’s email is not confirmed. In Supabase Dashboard, open Authentication → Users, select the account, and use the available confirmation action. Then try signing in again. Turning off confirmation does not necessarily confirm an account created earlier.';
    }
    if (normalized.includes('rate limit') || normalized.includes('too many requests') || normalized.includes('over_request_rate_limit')) {
      return 'Too many sign-in attempts. Please wait a few minutes before trying again.';
    }
    if (normalized.includes('invalid login credentials') || normalized.includes('invalid_credentials')) {
      return 'Email or password is incorrect. Check both and try again.';
    }
    return message || 'Unable to sign in. Please try again.';
  }
}
