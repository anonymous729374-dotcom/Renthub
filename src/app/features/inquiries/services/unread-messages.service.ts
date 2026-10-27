import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  catchError,
  distinctUntilChanged,
  exhaustMap,
  from,
  interval,
  map,
  startWith,
  switchMap,
} from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { InquiryService } from './inquiry.service';

@Injectable({ providedIn: 'root' })
export class UnreadMessagesService {
  private readonly auth = inject(AuthService);
  private readonly inquiries = inject(InquiryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly unreadCount = signal(0);

  constructor() {
    this.auth.user$
      .pipe(
        map((user) =>
          user ? `${user.id}:${user.role}:${user.listerStatus}:${user.isSuspended}` : null,
        ),
        distinctUntilChanged(),
        switchMap((userKey) => {
          const user = this.auth.currentUser;
          if (!userKey || !user || user.isSuspended) {
            this.unreadCount.set(0);
            return EMPTY;
          }

          return interval(10_000).pipe(
            startWith(0),
            exhaustMap(() =>
              from(this.inquiries.getUnreadMessageCount()).pipe(catchError(() => EMPTY)),
            ),
            map((count) => ({ userId: user.id, count })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ userId, count }) => {
        if (this.auth.currentUser?.id === userId) this.unreadCount.set(count);
      });
  }

  async refreshNow(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || user.isSuspended) {
      this.unreadCount.set(0);
      return;
    }
    try {
      const count = await this.inquiries.getUnreadMessageCount();
      if (this.auth.currentUser?.id === user.id) this.unreadCount.set(count);
    } catch {
      // Keep the last server-derived count when the network is temporarily unavailable.
    }
  }
}
