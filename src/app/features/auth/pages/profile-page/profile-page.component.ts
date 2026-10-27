import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-profile-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="page">
      <a routerLink="/" class="back">← Home</a>
      <h1>Profile</h1>
      <section class="section" aria-labelledby="account-heading">
        <h2 id="account-heading">Account information</h2>
        <dl>
          <div>
            <dt>Full name</dt>
            <dd>{{ auth.currentUser?.fullName || 'Not provided' }}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{{ auth.currentUser?.email }}</dd>
          </div>
          <div>
            <dt>Account role</dt>
            <dd>{{ roleLabel }}</dd>
          </div>
        </dl>
      </section>
      @if (auth.currentUser?.isSuspended) {
        <p class="suspended" role="alert">
          This account is suspended. Listing and management actions are unavailable. Contact the
          RentHub administrator for help.
        </p>
      }
      @if (auth.currentUser?.role === 'user') {
        <section class="section" aria-labelledby="lister-heading">
          <h2 id="lister-heading">Apartment lister access</h2>
          @if (auth.currentUser?.listerStatus === 'pending') {
            <p class="status pending" role="status">Request Pending</p>
            <p>Your request to become an apartment lister is awaiting administrator review.</p>
          } @else if (auth.currentUser?.listerStatus === 'rejected') {
            <div class="rejected-panel" role="status" aria-labelledby="rejected-heading">
              <p id="rejected-heading" class="status rejected">Application Rejected</p>
              <p>
                Your request to become an apartment lister was reviewed and rejected by an
                administrator. You can submit a new application if you would still like to list
                apartments.
              </p>
            </div>
            <button
              type="button"
              (click)="applyForLister()"
              [disabled]="isSubmittingListerRequest() || auth.currentUser?.isSuspended"
            >
              {{
                isSubmittingListerRequest()
                  ? 'Submitting…'
                  : 'Request to Become an Apartment Lister'
              }}
            </button>
          } @else {
            <p>
              Request admin approval to create and manage apartment listings. Your renter features
              will remain available.
            </p>
            <button
              type="button"
              (click)="applyForLister()"
              [disabled]="isSubmittingListerRequest() || auth.currentUser?.isSuspended"
            >
              {{
                isSubmittingListerRequest()
                  ? 'Submitting…'
                  : 'Request to Become an Apartment Lister'
              }}
            </button>
          }
          @if (listerError()) {
            <p class="error" role="alert">{{ listerError() }}</p>
          }
          @if (listerSuccess()) {
            <p class="success" role="status">{{ listerSuccess() }}</p>
          }
        </section>
      }
      @if (auth.currentUser?.role === 'lister' && auth.currentUser?.listerStatus === 'approved') {
        <section class="section" aria-labelledby="lister-heading">
          <h2 id="lister-heading">Lister status</h2>
          <p class="status approved">Lister Approved</p>
          @if (auth.currentUser?.isSuspended) {
            <p>
              Your lister approval remains in place, but listing and inquiry-management access is
              unavailable while this account is suspended.
            </p>
          } @else {
            <p>You can manage your own apartments and respond to inquiries.</p>
          }
        </section>
      }
      @if (notice()) {
        <p class="notice" role="status">{{ notice() }}</p>
      }
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .page {
        width: min(100% - 32px, 640px);
        margin: 0 auto;
        padding: 22px 0 40px;
      }
      .back {
        color: #2563eb;
        text-decoration: none;
        font-size: 13px;
        font-weight: 650;
      }
      h1 {
        margin: 14px 0 16px;
        color: #172033;
        font-size: 25px;
      }
      .section {
        padding: 16px 0;
        border-top: 1px solid #e2e8f0;
      }
      h2 {
        margin: 0 0 12px;
        color: #172033;
        font-size: 16px;
      }
      dl {
        display: grid;
        gap: 10px;
        margin: 0;
      }
      dl > div {
        display: grid;
        grid-template-columns: 120px minmax(0, 1fr);
        gap: 12px;
      }
      dt {
        color: #64748b;
        font-size: 13px;
      }
      dd {
        min-width: 0;
        margin: 0;
        color: #172033;
        font-size: 14px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .section p {
        margin: 7px 0 12px;
        color: #64748b;
        font-size: 13px;
        line-height: 1.5;
      }
      .section .status {
        margin: 0 0 6px;
        font-weight: 700;
      }
      .pending {
        color: #92400e !important;
      }
      .approved {
        color: #15803d !important;
      }
      .rejected {
        color: #b91c1c !important;
      }
      .rejected-panel {
        margin: 0 0 12px;
        padding: 11px 12px;
        border: 1px solid #fecaca;
        border-radius: 8px;
        background: #fef2f2;
      }
      .section .rejected-panel p {
        margin: 0;
        color: #7f1d1d;
      }
      .section .rejected-panel .status {
        margin: 0 0 5px;
        color: #b91c1c !important;
      }
      button {
        padding: 9px 13px;
        border: 0;
        border-radius: 7px;
        background: #2563eb;
        color: #fff;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.55;
        cursor: wait;
      }
      .suspended {
        margin: 14px 0 0;
        padding: 11px 12px;
        border-radius: 8px;
        background: #fef2f2;
        color: #b91c1c;
        font-size: 13px;
        line-height: 1.5;
      }
      .error {
        color: #b91c1c !important;
      }
      .success,
      .notice {
        color: #15803d !important;
        font-size: 13px;
      }
      @media (max-width: 420px) {
        .page {
          width: calc(100% - 24px);
        }
        dl > div {
          grid-template-columns: 100px minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly isSubmittingListerRequest = signal(false);
  readonly listerError = signal('');
  readonly listerSuccess = signal('');
  readonly notice = signal(
    this.route.snapshot.queryParamMap.has('applyLister')
      ? 'Submit a lister approval request below.'
      : this.route.snapshot.queryParamMap.has('suspended')
        ? 'This account is suspended.'
        : '',
  );

  get roleLabel(): string {
    const user = this.auth.currentUser;
    if (user?.role === 'admin') return 'Admin';
    if (user?.role === 'lister' && user.listerStatus === 'approved')
      return 'Apartment Lister and Renter';
    return 'Normal User / Renter';
  }

  async applyForLister(): Promise<void> {
    if (this.isSubmittingListerRequest() || this.auth.currentUser?.isSuspended) return;
    this.isSubmittingListerRequest.set(true);
    this.listerError.set('');
    this.listerSuccess.set('');
    try {
      await this.auth.applyForListerApproval();
      this.listerSuccess.set(
        'Your lister application was submitted and is pending admin approval.',
      );
    } catch (error: unknown) {
      this.listerError.set(
        error instanceof Error
          ? error.message
          : 'Unable to submit your application. Apply the RentHub role migration and try again.',
      );
    } finally {
      this.isSubmittingListerRequest.set(false);
    }
  }
}
