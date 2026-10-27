import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { UnreadMessagesService } from '../../../features/inquiries/services/unread-messages.service';

@Component({
  selector: 'app-site-header',
  standalone: true,
  imports: [AsyncPipe, RouterLink, RouterLinkActive],
  template: `
    <header class="header">
      <a class="brand" routerLink="/" aria-label="RentHub home">Rent<span>Hub</span></a>
      <div class="header-content">
        @if (auth.initializationState$ | async; as authState) {
          @if (authState === 'restoring') {
            <span class="auth-restoring" role="status" aria-live="polite"
              >Restoring your session…</span
            >
          } @else if (isAuthRoute()) {
            <nav aria-label="Public navigation">
              <a
                routerLink="/"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
                >Home</a
              >
              <a routerLink="/login" routerLinkActive="active">Sign in</a>
              <a class="signup" routerLink="/signup" routerLinkActive="active">Sign up</a>
            </nav>
          } @else {
            <nav aria-label="Main navigation">
              <a
                routerLink="/"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
                >Home</a
              >
              @if (auth.user$ | async; as user) {
                @if (!user.isSuspended && user.role === 'user') {
                  <a routerLink="/profile">{{
                    user.listerStatus === 'pending'
                      ? 'Lister Request Pending'
                      : user.listerStatus === 'rejected'
                        ? 'Reapply to List'
                        : 'Become a Lister'
                  }}</a>
                }
                @if (
                  !user.isSuspended &&
                  ((user.role === 'lister' && user.listerStatus === 'approved') ||
                    user.role === 'admin')
                ) {
                  <a routerLink="/apartments/new">List an Apartment</a>
                  <a routerLink="/my-apartments">My Listings</a>
                }
                @if (!user.isSuspended && user.role === 'admin') {
                  <a routerLink="/admin">Admin</a>
                }
                @if (!user.isSuspended) {
                  <a routerLink="/favourites">Favourites</a>
                  <a routerLink="/messages" class="messages-link">
                    Messages
                    @if (unreadMessages.unreadCount() > 0) {
                      <span class="unread-badge" [attr.aria-label]="unreadBadgeLabel()">
                        {{ unreadBadgeText() }}
                      </span>
                    }
                  </a>
                }
                <a routerLink="/profile">Profile</a>
                <span class="welcome">{{ user.fullName || user.email }}</span>
                <button type="button" (click)="logout()">Logout</button>
              } @else {
                <a routerLink="/login" routerLinkActive="active">Login</a>
                <a class="signup" routerLink="/signup">Signup</a>
              }
            </nav>
          }
        }
        @if (logoutError()) {
          <p class="logout-error" role="alert">{{ logoutError() }}</p>
        }
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 18px max(20px, calc((100% - 1200px) / 2));
        border-bottom: 1px solid #e2e8f0;
        background: #fff;
      }
      .brand {
        color: #172554;
        font-size: 25px;
        font-weight: 850;
        letter-spacing: -1px;
        text-decoration: none;
      }
      .brand span {
        color: #2563eb;
      }
      .header-content {
        display: grid;
        justify-items: end;
        gap: 5px;
      }
      nav {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 16px;
      }
      nav a,
      nav button {
        color: #475569;
        font: inherit;
        font-size: 13px;
        text-decoration: none;
      }
      nav a:hover,
      nav a.active {
        color: #2563eb;
      }
      nav button {
        padding: 8px 12px;
        border: 0;
        border-radius: 8px;
        background: #eff6ff;
        color: #1d4ed8;
        font-weight: 700;
        cursor: pointer;
      }
      .signup {
        padding: 9px 13px;
        border-radius: 8px;
        background: #2563eb;
        color: #fff !important;
        font-weight: 700;
      }
      .welcome {
        color: #64748b;
        font-size: 13px;
      }
      .messages-link {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .unread-badge {
        display: inline-grid;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        box-sizing: border-box;
        place-items: center;
        border-radius: 999px;
        background: #2563eb;
        color: #fff;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
      }
      .auth-restoring {
        color: #64748b;
        font-size: 13px;
      }
      .logout-error {
        margin: 0;
        color: #b91c1c;
        font-size: 12px;
      }
      @media (max-width: 720px) {
        .header {
          align-items: flex-start;
          flex-direction: column;
        }
        .header-content {
          justify-items: start;
        }
        nav {
          justify-content: flex-start;
        }
      }
    `,
  ],
})
export class SiteHeaderComponent {
  readonly auth = inject(AuthService);
  readonly unreadMessages = inject(UnreadMessagesService);
  private readonly router = inject(Router);
  readonly isAuthRoute = signal(this.isAuthRouteUrl(this.router.url));
  readonly logoutError = signal('');

  unreadBadgeText(): string {
    const count = this.unreadMessages.unreadCount();
    return count > 9 ? '9+' : String(count);
  }

  unreadBadgeLabel(): string {
    const count = this.unreadMessages.unreadCount();
    return `${count} unread ${count === 1 ? 'message' : 'messages'}`;
  }

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.isAuthRoute.set(this.isAuthRouteUrl(event.urlAfterRedirects)));
  }

  private isAuthRouteUrl(url: string): boolean {
    const path = url.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
    return path === '/login' || path === '/signup';
  }

  async logout(): Promise<void> {
    this.logoutError.set('');
    try {
      await this.auth.signOut();
    } catch (error: unknown) {
      this.logoutError.set(
        error instanceof Error ? error.message : 'Unable to sign out right now.',
      );
    }
  }
}
