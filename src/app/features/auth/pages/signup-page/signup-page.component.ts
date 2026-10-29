
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { emailAddressValidator } from '../../../../shared/validators/custom-validators';

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-page">
      <form class="auth-card" [formGroup]="form" (ngSubmit)="submit()">
        <a class="back-link" routerLink="/">← Back to RentHub</a>
        <p class="eyebrow">Get started</p>
        <h1>Create your account</h1>
        <p class="description">Join RentHub as a renter. You can request approval to list apartments from your profile.</p>

        <label for="fullName">Full name</label>
        <input id="fullName" type="text" formControlName="fullName" autocomplete="name" />
        @if (form.controls.fullName.touched && form.controls.fullName.invalid) {
          <small>Please enter your name (at least 2 characters).</small>
        }

        <label for="email">Email address</label>
        <input id="email" type="email" formControlName="email" autocomplete="email" />
        @if (form.controls.email.touched && form.controls.email.invalid) {
          <small>Enter a valid email address.</small>
        }

        <label for="password">Password</label>
        <input id="password" type="password" formControlName="password" autocomplete="new-password" />
        @if (form.controls.password.touched && form.controls.password.invalid) {
          <small>Password must contain at least 8 characters.</small>
        }

        @if (errorMessage()) {
          <p class="error" role="alert">{{ errorMessage() }}</p>
        }

        @if (successMessage()) {
          <p class="success" role="status">{{ successMessage() }}</p>
        }

        <button type="submit" [disabled]="form.invalid || loading() || !!successMessage()">
          {{ loading() ? 'Creating account…' : 'Create account' }}
        </button>

        <p class="switch">
          Already registered? <a routerLink="/login">Sign in</a>
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
    .success { color: #15803d; }
    button { margin-top: .75rem; padding: .9rem; border: 0; border-radius: .6rem; background: #2563eb; color: white; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    .switch { text-align: center; font-size: .9rem; }
  `,
})
export class SignupPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', emailAddressValidator()],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const values = this.form.getRawValue();
      const result = await this.auth.signUp(
        { ...values, email: values.email.trim() },
        { waitForProfile: false },
      );

      if (result.authenticated) {
        const navigated = await this.router.navigateByUrl('/');
        if (!navigated) this.errorMessage.set('Your account was created and you are signed in, but RentHub could not open the home page. Please use the navigation links to continue.');
      } else {
        this.successMessage.set('Supabase did not return an active session, so you are not signed in. Try signing in; if email confirmation is enabled, confirm your address first.');
      }
    } catch (error) {
      this.errorMessage.set(this.signupErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private signupErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid email') || normalized.includes('email address is invalid')) {
      return 'Enter a valid email address.';
    }
    if (normalized.includes('rate limit') || normalized.includes('too many requests') || normalized.includes('over_email_send_rate_limit')) {
      return 'Signup is temporarily rate-limited by Supabase. Please wait before trying again; RentHub will not retry automatically.';
    }
    return message || 'Unable to create your account. Please check your details and try again.';
  }
}
