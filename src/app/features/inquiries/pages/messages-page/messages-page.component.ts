import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { Apartment } from '../../../apartments/models/apartment.model';
import { ApartmentService } from '../../../apartments/services/apartment.service';
import { Inquiry, InquiryMessage } from '../../models/inquiry.model';
import { InquiryService } from '../../services/inquiry.service';
import { UnreadMessagesService } from '../../services/unread-messages.service';
import { PaginationComponent } from '../../../home/components/pagination/pagination.component';

@Component({
  selector: 'app-messages-page',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterLink, PaginationComponent],
  templateUrl: './messages-page.component.html',
  styleUrl: './messages-page.component.css',
})
export class MessagesPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly inquiryService = inject(InquiryService);
  private readonly unreadMessages = inject(UnreadMessagesService);
  private readonly apartmentService = inject(ApartmentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly conversations = signal<Inquiry[]>([]);
  readonly selected = signal<Inquiry | null>(null);
  readonly pendingApartment = signal<Apartment | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly selectionError = signal('');
  readonly chatError = signal('');
  readonly refreshError = signal('');
  readonly isSending = signal(false);
  readonly participantNames = signal<Record<string, string>>({});
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 10;
  readonly hasActiveView = computed(() => !!this.selected() || !!this.pendingApartment());
  draft = '';
  private lastApartmentParam: string | null | undefined;
  private refreshing = false;
  private listRequestId = 0;
  private readonly inaccessibleConversationIds = new Set<string>();

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const conversationId = params.get('conversationId');
      const apartmentId = params.get('apartmentId');
      if (this.lastApartmentParam === undefined || apartmentId !== this.lastApartmentParam) {
        this.lastApartmentParam = apartmentId;
        void this.loadConversations(conversationId, apartmentId);
      } else if (conversationId) {
        this.activateById(conversationId, apartmentId);
      } else if (this.selected()) {
        this.selected.set(null);
        this.draft = '';
      }
    });
    interval(10000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isSending()) void this.refreshConversationList();
      });
  }

  async reload(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    await this.loadConversations(params.get('conversationId'), params.get('apartmentId'));
  }

  private async loadConversations(
    conversationId: string | null,
    apartmentId: string | null,
  ): Promise<void> {
    const requestId = ++this.listRequestId;
    this.loading.set(true);
    this.errorMessage.set('');
    this.selectionError.set('');
    try {
      const pageData = await this.inquiryService.getConversationPage(this.page(), this.pageSize);
      let inquiries = pageData.items.filter(
        (item) => !this.inaccessibleConversationIds.has(item.id),
      );
      this.total.set(Math.max(0, pageData.total - this.inaccessibleConversationIds.size));
      if (inquiries.length === 0 && this.page() > 1) { this.page.update(value => value - 1); await this.loadConversations(conversationId, apartmentId); return; }
      let requestedConversation: Inquiry | null = null;
      if (
        conversationId &&
        !this.inaccessibleConversationIds.has(conversationId) &&
        !inquiries.some(item => item.id === conversationId)
      ) {
        requestedConversation = await this.inquiryService.getConversation(conversationId);
      }
      if (requestId !== this.listRequestId) return;
      const loadItems = requestedConversation ? [...inquiries, requestedConversation] : inquiries;
      const [messages, names] = await Promise.all([
        this.inquiryService.getMessages(loadItems.map((item) => item.id)),
        this.inquiryService.getParticipantNames(loadItems.map((item) => item.id)),
      ]);
      const messageMap = new Map<string, InquiryMessage[]>();
      for (const message of messages) {
        const group = messageMap.get(message.inquiry_id) ?? [];
        group.push(message);
        messageMap.set(message.inquiry_id, group);
      }
      const nameMap: Record<string, string> = {};
      for (const row of names) {
        if (row.display_name?.trim())
          nameMap[row.inquiry_id + ':' + row.user_id] = row.display_name.trim();
      }
      this.participantNames.set(nameMap);
      const enriched = loadItems.map((item) => ({
        ...item,
        messages: messageMap.get(item.id) ?? [],
      }));
      enriched.sort((a, b) => this.latestTimestamp(b).localeCompare(this.latestTimestamp(a)));
      const pageIds = new Set(inquiries.map(item => item.id));
      this.conversations.set(enriched.filter(item => pageIds.has(item.id)).sort((a, b) => this.latestTimestamp(b).localeCompare(this.latestTimestamp(a))));

      if (conversationId && requestedConversation) {
        const requested = enriched.find(item => item.id === conversationId);
        if (requested) { this.selected.set(requested); this.pendingApartment.set(null); void this.markRead(requested); }
        else this.activateById(conversationId, apartmentId);
      } else if (conversationId) this.activateById(conversationId, apartmentId);
      else if (apartmentId) await this.openApartment(apartmentId);
      else {
        this.selected.set(null);
        this.pendingApartment.set(null);
        this.draft = '';
      }
    } catch (error: unknown) {
      if (requestId !== this.listRequestId) return;
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Unable to load your conversations.',
      );
    } finally {
      if (requestId === this.listRequestId) this.loading.set(false);
    }
  }

  private async openApartment(apartmentId: string): Promise<void> {
    const existing = this.conversations().find(
      (item) => item.apartment_id === apartmentId && item.renter_id === this.auth.currentUser?.id,
    );
    if (existing) {
      this.selectConversation(existing);
      return;
    }
    this.selected.set(null);
    this.pendingApartment.set(null);
    this.selectionError.set('');
    try {
      const apartment = await this.apartmentService.getApartmentById(apartmentId);
      if (!apartment) throw new Error('This apartment is not available for a new conversation.');
      if (apartment.owner_id === this.auth.currentUser?.id)
        throw new Error('You cannot start a conversation with yourself.');
      this.pendingApartment.set(apartment);
    } catch (error: unknown) {
      this.selectionError.set(
        error instanceof Error ? error.message : 'Unable to open this apartment conversation.',
      );
    }
  }

  selectConversation(inquiry: Inquiry): void {
    if (this.selected()?.id !== inquiry.id) {
      this.selected.set(inquiry);
      this.pendingApartment.set(null);
      this.selectionError.set('');
      this.chatError.set('');
      this.draft = '';
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { conversationId: inquiry.id, apartmentId: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
      void this.markRead(inquiry);
      void this.refreshActiveMessages();
    }
  }

  private activateById(id: string, apartmentId: string | null = null): void {
    if (this.inaccessibleConversationIds.has(id)) {
      this.selectionError.set('');
      this.clearConversationQuery();
      return;
    }
    const inquiry = this.conversations().find((item) => item.id === id);
    if (!inquiry) {
      this.selected.set(null);
      this.pendingApartment.set(null);
      this.draft = '';
      this.selectionError.set(
        this.conversations().length
          ? 'This conversation is no longer available or cannot be accessed.'
          : '',
      );
      this.clearConversationQuery();
      if (apartmentId) void this.openApartment(apartmentId);
      return;
    }
    this.selectConversation(inquiry);
  }

  private clearConversationQuery(): void {
    if (!this.route.snapshot.queryParamMap.has('conversationId')) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { conversationId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  backToList(): void {
    this.selected.set(null);
    this.pendingApartment.set(null);
    this.selectionError.set('');
    this.draft = '';
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { conversationId: null, apartmentId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  async sendMessage(): Promise<void> {
    const text = this.draft.trim();
    const selected = this.selected();
    const pending = this.pendingApartment();
    const minimum = selected ? 2 : 10;
    if ((!selected && !pending) || text.length < minimum || text.length > 3000 || this.isSending())
      return;
    this.isSending.set(true);
    this.chatError.set('');
    this.refreshError.set('');
    try {
      if (selected) {
        const message = await this.inquiryService.sendMessage(selected.id, text);
        this.draft = '';
        this.appendMessage(selected.id, message);
        const active = this.selected() ?? selected;
        await this.markRead(active);
        await this.refreshActiveMessages();
      } else if (pending) {
        const inquiry = await this.inquiryService.createInquiry({
          apartment_id: pending.id,
          message: text,
        });
        this.draft = '';
        this.pendingApartment.set(null);
        await this.loadConversations(inquiry.id, null);
        const created = this.conversations().find((item) => item.id === inquiry.id);
        if (created) this.selectConversation(created);
      }
    } catch (error: unknown) {
      this.chatError.set(
        error instanceof Error
          ? error.message
          : 'Unable to send this message. Your text is still here; please try again.',
      );
    } finally {
      this.isSending.set(false);
    }
  }

  handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.sendMessage();
    }
  }

  async markRead(inquiry: Inquiry): Promise<void> {
    try {
      const timestamp = await this.inquiryService.markConversationRead(inquiry.id);
      const userId = this.auth.currentUser?.id;
      const updated = {
        ...inquiry,
        ...(inquiry.renter_id === userId
          ? { renter_last_read_at: timestamp }
          : { lister_last_read_at: timestamp }),
      };
      this.replaceConversation(updated);
      void this.unreadMessages.refreshNow();
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes(
          'conversation not found or the current user is not a participant',
        )
      ) {
        this.dismissInaccessibleConversation(inquiry.id);
        return;
      }
      this.chatError.set(
        error instanceof Error ? error.message : 'Unable to mark this conversation as read.',
      );
    }
  }

  private dismissInaccessibleConversation(inquiryId: string): void {
    this.inaccessibleConversationIds.add(inquiryId);
    const wasVisible = this.conversations().some((item) => item.id === inquiryId);
    this.conversations.update((items) => items.filter((item) => item.id !== inquiryId));
    if (wasVisible) this.total.update((count) => Math.max(0, count - 1));

    if (this.selected()?.id === inquiryId) {
      this.selected.set(null);
      this.draft = '';
      this.chatError.set('');
      this.refreshError.set('');
      this.clearConversationQuery();
    }
    this.selectionError.set('');
    void this.unreadMessages.refreshNow();
  }

  private async refreshActiveMessages(): Promise<void> {
    const active = this.selected();
    if (!active || this.refreshing) return;
    this.refreshing = true;
    try {
      const messages = await this.inquiryService.getMessages([active.id]);
      const updated = { ...active, messages };
      this.replaceConversation(updated);
      this.refreshError.set('');
      if (this.isUnread(updated)) void this.markRead(updated);
    } catch {
      this.refreshError.set('Unable to refresh this conversation. Check your connection.');
    } finally {
      this.refreshing = false;
    }
  }

  private async refreshConversationList(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      if (!this.auth.currentUser) return;
      const pageData = await this.inquiryService.getConversationPage(this.page(), this.pageSize);
      let current = pageData.items.filter(
        (item) => !this.inaccessibleConversationIds.has(item.id),
      );
      this.total.set(Math.max(0, pageData.total - this.inaccessibleConversationIds.size));
      if (!current.length && this.page() > 1) { this.page.update(value => value - 1); await this.loadConversations(this.selected()?.id ?? null, null); return; }
      const activeBeforeRefresh = this.selected();
      if (
        activeBeforeRefresh &&
        !this.inaccessibleConversationIds.has(activeBeforeRefresh.id) &&
        !current.some(item => item.id === activeBeforeRefresh.id)
      ) {
        const stillAccessible = await this.inquiryService.getConversation(activeBeforeRefresh.id);
        if (stillAccessible) current = [...current, stillAccessible];
      }
      const [messages, names] = await Promise.all([
        this.inquiryService.getMessages(current.map((item) => item.id)),
        this.inquiryService.getParticipantNames(current.map((item) => item.id)),
      ]);
      const grouped = new Map<string, InquiryMessage[]>();
      for (const message of messages) {
        const thread = grouped.get(message.inquiry_id) ?? [];
        thread.push(message);
        grouped.set(message.inquiry_id, thread);
      }
      const nameMap: Record<string, string> = {};
      for (const row of names) {
        if (row.display_name?.trim())
          nameMap[row.inquiry_id + ':' + row.user_id] = row.display_name.trim();
      }
      this.participantNames.set(nameMap);
      const refreshedAll = current.map((item) => ({ ...item, messages: grouped.get(item.id) ?? [] }));
      refreshedAll.sort((a, b) => this.latestTimestamp(b).localeCompare(this.latestTimestamp(a)));
      const pageIds = new Set(
        pageData.items
          .filter((item) => !this.inaccessibleConversationIds.has(item.id))
          .map((item) => item.id),
      );
      const refreshed = refreshedAll.filter(item => pageIds.has(item.id));
      this.conversations.set(refreshed);
      if (!refreshed.length) this.selectionError.set('');
      const active = this.selected();
      const activeUpdated = active && refreshedAll.find((item) => item.id === active.id);
      if (activeUpdated) {
        this.selected.set(activeUpdated);
        if (this.isUnread(activeUpdated)) void this.markRead(activeUpdated);
      } else if (active) {
        this.selected.set(null);
        this.pendingApartment.set(null);
        this.draft = '';
        this.selectionError.set(
          refreshed.length ? 'This conversation is no longer available or cannot be accessed.' : '',
        );
        this.clearConversationQuery();
      } else {
        const requestedId = this.route.snapshot.queryParamMap.get('conversationId');
        if (requestedId && !refreshed.some((item) => item.id === requestedId)) {
          this.selectionError.set(
            refreshed.length
              ? 'This conversation is no longer available or cannot be accessed.'
              : '',
          );
          this.clearConversationQuery();
        }
      }
      this.refreshError.set('');
    } catch {
      this.refreshError.set('Unable to refresh messages. Check your connection.');
    } finally {
      this.refreshing = false;
    }
  }

  private appendMessage(inquiryId: string, message: InquiryMessage): void {
    const inquiry = this.conversations().find((item) => item.id === inquiryId);
    if (!inquiry) return;
    this.replaceConversation({
      ...inquiry,
      messages: [...(inquiry.messages ?? []), message].sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      ),
    });
  }

  private replaceConversation(updated: Inquiry): void {
    this.conversations.update((items) =>
      items
        .map((item) => (item.id === updated.id ? updated : item))
        .sort((a, b) => this.latestTimestamp(b).localeCompare(this.latestTimestamp(a))),
    );
    if (this.selected()?.id === updated.id) this.selected.set(updated);
  }

  otherParticipantName(inquiry: Inquiry): string {
    const currentUserId = this.auth.currentUser?.id;
    const otherId =
      inquiry.renter_id === currentUserId ? inquiry.apartment?.owner_id : inquiry.renter_id;
    if (!otherId) return 'Apartment lister';
    return (
      this.participantNames()[inquiry.id + ':' + otherId] ||
      (otherId === inquiry.renter_id ? 'Renter' : 'Apartment lister')
    );
  }

  senderName(inquiry: Inquiry, message: InquiryMessage): string {
    if (message.sender_id === this.auth.currentUser?.id) return 'You';
    return (
      this.participantNames()[inquiry.id + ':' + message.sender_id] ||
      (message.sender_id === inquiry.renter_id ? 'Renter' : 'Apartment lister')
    );
  }

  latestPreview(inquiry: Inquiry): string {
    const message = inquiry.messages?.[inquiry.messages.length - 1];
    return message
      ? (message.sender_id === this.auth.currentUser?.id
          ? 'You'
          : this.senderName(inquiry, message)) +
          ': ' +
          message.body
      : inquiry.message;
  }

  latestAt(inquiry: Inquiry): string {
    return this.latestTimestamp(inquiry);
  }

  unreadMessagesCount(inquiry: Inquiry): number {
    const userId = this.auth.currentUser?.id;
    const readAt =
      inquiry.renter_id === userId ? inquiry.renter_last_read_at : inquiry.lister_last_read_at;
    const readTime = readAt ? new Date(readAt).getTime() : Number.NEGATIVE_INFINITY;
    return (inquiry.messages ?? []).filter(
      (message) =>
        message.sender_id !== userId && new Date(message.created_at).getTime() > readTime,
    ).length;
  }

  isUnread(inquiry: Inquiry): boolean {
    return this.unreadMessagesCount(inquiry) > 0;
  }

  unreadMessagesLabel(inquiry: Inquiry): string {
    const count = this.unreadMessagesCount(inquiry);
    return `${count} unread ${count === 1 ? 'message' : 'messages'}`;
  }

  unreadMessagesText(inquiry: Inquiry): string {
    const count = this.unreadMessagesCount(inquiry);
    return count > 9 ? '9+' : String(count);
  }

  hideBrokenThumbnail(event: Event): void {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }

  private latestTimestamp(inquiry: Inquiry): string {
    return inquiry.messages?.[inquiry.messages.length - 1]?.created_at || inquiry.created_at;
  }

  changePage(page: number): void {
    this.page.set(page);
    void this.loadConversations(this.selected()?.id ?? null, null);
  }
}
