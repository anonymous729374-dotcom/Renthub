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
    <header class="header" (keydown.escape)="closeMenu()">
      <a class="brand" routerLink="/" aria-label="RentHub home">Rent<span>Hub</span></a>
      <div class="header-content">
        @if (auth.initializationState$ | async; as authState) {
          @if (isAuthRoute()) {
            <nav aria-label="Public navigation">
              <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
              <a routerLink="/login" routerLinkActive="active">Sign in</a>
              <a class="signup" routerLink="/signup" routerLinkActive="active">Sign up</a>
            </nav>
          } @else if (authState === 'restoring') {
            <span class="auth-restoring" role="status" aria-live="polite">Loading your account…</span>
          } @else {
            <button
              #menuButton
              class="menu-toggle"
              type="button"
              [attr.aria-expanded]="menuOpen()"
              aria-controls="site-navigation"
              [attr.aria-label]="menuOpen() ? 'Close navigation menu' : 'Open navigation menu'"
              (click)="toggleMenu()"
            >
              <span></span><span></span><span></span>
            </button>
            <nav
              id="site-navigation"
              [class.open]="menuOpen()"
              [attr.aria-label]="isAuthRoute() ? 'Public navigation' : 'Main navigation'"
              (keydown.escape)="closeMenu(menuButton)"
              (click)="closeMenu()"
            >
              <a
                routerLink="/"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
                >Home</a
              >
              @if (auth.user$ | async; as user) {
                @if (authState === 'ready') {
                  @if (user.isSuspended === false && user.role === 'user') {
                    <a routerLink="/profile" routerLinkActive="active">{{
                      user.listerStatus === 'pending'
                        ? 'Lister Request Pending'
                        : user.listerStatus === 'rejected'
                          ? 'Reapply to List'
                          : 'Become a Lister'
                    }}</a>
                  }
                  @if (
                    user.isSuspended === false &&
                    ((user.role === 'lister' && user.listerStatus === 'approved') ||
                      user.role === 'admin')
                  ) {
                    <a routerLink="/apartments/new" routerLinkActive="active">List an Apartment</a>
                    <a routerLink="/my-apartments" routerLinkActive="active">My Listings</a>
                  }
                  @if (user.isSuspended === false && user.role === 'admin') {
                    <a routerLink="/admin" routerLinkActive="active">Admin</a>
                  }
                  @if (user.isSuspended === false) {
                    <a routerLink="/favourites" routerLinkActive="active">Favourites</a>
                    <a
                      routerLink="/messages"
                      routerLinkActive="active"
                      class="messages-link"
                      [class.has-unread]="hasUnreadMessages()"
                      [attr.aria-label]="hasUnreadMessages() ? 'Messages, ' + unreadBadgeLabel() : null"
                    >
                      Messages
                      @if (hasUnreadMessages()) {
                        <span class="unread-badge" [attr.aria-label]="unreadBadgeLabel()" aria-live="polite" aria-atomic="true">
                          {{ unreadBadgeText() }}
                        </span>
                      }
                    </a>
                  }
                }
                <a routerLink="/profile" routerLinkActive="active">Profile</a>
                <button type="button" (click)="logout()">Logout</button>
              } @else {
                <a routerLink="/login" routerLinkActive="active">Login</a>
                <a class="signup" routerLink="/signup" routerLinkActive="active">Signup</a>
              }
            </nav>
          }
        }
        @if (auth.initializationState === 'error' && auth.currentUser) {
          <p class="auth-restoring" role="status">
            Account permissions are unavailable. Role-specific navigation is hidden.
          </p>
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
        position: relative;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        min-width: 0;
        flex: 1;
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
      .menu-toggle {
        display: none;
        width: 38px;
        height: 36px;
        flex: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 0;
        border: 1px solid #e3e7ed;
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
      }
      .menu-toggle span {
        display: block;
        width: 17px;
        height: 2px;
        border-radius: 2px;
        background: #455166;
      }
      @media (max-width: 1000px) {
        .header {
          position: relative;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
        }
        .header-content {
          flex: 0 0 auto;
          margin-left: auto;
        }
        .menu-toggle {
          display: inline-flex;
        }
        nav {
          display: none;
          position: absolute;
          z-index: 20;
          top: calc(100% + 10px);
          right: 0;
          width: min(320px, calc(100vw - 32px));
          max-height: min(75vh, 560px);
          overflow-y: auto;
          align-items: stretch;
          flex-direction: column;
          flex-wrap: nowrap;
          gap: 3px;
          padding: 8px;
          border: 1px solid #e3e7ed;
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 8px 24px rgb(25 39 58 / 10%);
        }
        nav.open {
          display: flex;
        }
        nav a,
        nav button {
          width: 100%;
          min-height: 38px;
          justify-content: flex-start;
          padding: 9px 10px;
          text-align: left;
        }
        nav .signup {
          width: auto;
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
  readonly menuOpen = signal(false);

  unreadBadgeText(): string {
    const count = this.unreadMessages.unreadCount();
    return count > 0 ? (count > 9 ? '9+' : String(count)) : 'New';
  }

  unreadBadgeLabel(): string {
    const count = this.unreadMessages.unreadCount();
    if (count === 0) return 'New message received';
    return `${count} unread ${count === 1 ? 'message' : 'messages'}`;
  }

  hasUnreadMessages(): boolean {
    return this.unreadMessages.unreadCount() > 0 || this.unreadMessages.hasNewIncomingMessage();
  }

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.isAuthRoute.set(this.isAuthRouteUrl(event.urlAfterRedirects));
        this.closeMenu();
      });
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(trigger?: HTMLButtonElement): void {
    this.menuOpen.set(false);
    trigger?.focus();
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
