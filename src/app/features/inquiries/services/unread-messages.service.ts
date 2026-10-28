import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  EMPTY,
  catchError,
  distinctUntilChanged,
  exhaustMap,
  finalize,
  from,
  interval,
  map,
  startWith,
  switchMap,
} from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';
import { InquiryService } from './inquiry.service';

@Injectable({ providedIn: 'root' })
export class UnreadMessagesService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly inquiries = inject(InquiryService);
  private readonly destroyRef = inject(DestroyRef);
  private realtimeChannel: RealtimeChannel | null = null;
  private realtimeUserId: string | null = null;

  readonly unreadCount = signal(0);
  readonly hasNewIncomingMessage = signal(false);

  constructor() {
    this.auth.user$
      .pipe(
        map((user) =>
          user ? `${user.id}:${user.role}:${user.listerStatus}:${user.isSuspended}` : null,
        ),
        distinctUntilChanged(),
        switchMap((userKey) => {
          const user = this.auth.currentUser;
          if (!userKey || !user || user.role === null || user.isSuspended !== false) {
            this.stopRealtime();
            this.unreadCount.set(0);
            this.hasNewIncomingMessage.set(false);
            return EMPTY;
          }

          this.startRealtime(user.id);
          return interval(10_000).pipe(
            startWith(0),
            exhaustMap(() =>
              from(this.inquiries.getUnreadMessageCount()).pipe(
                catchError((error: unknown) => {
                  console.error('Unable to refresh the server unread-message count:', error);
                  return EMPTY;
                }),
              ),
            ),
            map((count) => ({ userId: user.id, count })),
            // Realtime is the fast path; polling repairs missed events and handles
            // projects where the Realtime publication has not been enabled yet.
            finalize(() => this.stopRealtime()),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ userId, count }) => {
        if (this.auth.currentUser?.id === userId) {
          this.unreadCount.set(count);
          if (count === 0) this.hasNewIncomingMessage.set(false);
        }
      });
  }

  async refreshNow(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || user.role === null || user.isSuspended !== false) {
      this.unreadCount.set(0);
      this.hasNewIncomingMessage.set(false);
      return;
    }
    try {
      const count = await this.inquiries.getUnreadMessageCount();
      if (this.auth.currentUser?.id === user.id) {
        this.unreadCount.set(count);
        if (count === 0) this.hasNewIncomingMessage.set(false);
      }
    } catch (error: unknown) {
      // Keep the last server-derived count when the network is temporarily unavailable.
      console.error('Unable to refresh the server unread-message count:', error);
    }
  }

  private startRealtime(userId: string): void {
    if (this.realtimeUserId === userId && this.realtimeChannel) return;
    this.stopRealtime();
    this.realtimeUserId = userId;
    this.realtimeChannel = this.supabase
      .channel(`renthub-unread-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inquiry_messages' },
        (payload) => {
          const senderId = payload.new?.['sender_id'];
          if (typeof senderId === 'string' && senderId !== this.auth.currentUser?.id) {
            this.hasNewIncomingMessage.set(true);
            void this.refreshNow();
          }
        },
      )
      .subscribe();
  }

  private stopRealtime(): void {
    const channel = this.realtimeChannel;
    this.realtimeChannel = null;
    this.realtimeUserId = null;
    if (channel) void this.supabase.removeChannel(channel).catch(() => undefined);
  }
}
