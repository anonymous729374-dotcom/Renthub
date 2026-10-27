import { Injectable, inject } from '@angular/core';
import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';
import {
  CreateInquiryInput,
  Inquiry,
  InquiryMessage,
  InquiryParticipantName,
} from '../models/inquiry.model';

const APARTMENT_EMBED =
  'apartment:apartments(id,title,owner_id,photos,monthly_rent,address,city,state)';
export interface InquiryPage { items: Inquiry[]; total: number; }

@Injectable({ providedIn: 'root' })
export class InquiryService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly inquiryCreationLocks = new Map<string, Promise<void>>();

  async createInquiry(input: CreateInquiryInput): Promise<Inquiry> {
    const message = input.message.trim();
    if (message.length < 10 || message.length > 3000) {
      throw new Error('Your first message must contain between 10 and 3000 characters.');
    }
    const user = await this.requireUser('Please sign in before messaging an apartment lister.');
    const lockKey = `${user.id}:${input.apartment_id}`;
    const previous = this.inquiryCreationLocks.get(lockKey) ?? Promise.resolve();
    let releaseLock!: () => void;
    const current = new Promise<void>((resolve) => (releaseLock = resolve));
    this.inquiryCreationLocks.set(lockKey, current);
    await previous;

    try {
      return await this.findOrCreateConversation(input, user.id, message);
    } finally {
      releaseLock();
      if (this.inquiryCreationLocks.get(lockKey) === current) {
        this.inquiryCreationLocks.delete(lockKey);
      }
    }
  }

  private async findOrCreateConversation(
    input: CreateInquiryInput,
    renterId: string,
    message: string,
  ): Promise<Inquiry> {
    const existing = await this.findConversation(input.apartment_id, renterId);
    if (existing) {
      await this.sendMessage(existing.id, message);
      return existing;
    }

    const { data, error } = await this.supabase
      .from('inquiries')
      .insert({
        apartment_id: input.apartment_id,
        renter_id: renterId,
        message,
        status: 'pending',
      })
      .select(`*, ${APARTMENT_EMBED}`)
      .single();

    if (error?.code === '23505') {
      const racedConversation = await this.findConversation(input.apartment_id, renterId);
      if (racedConversation) {
        await this.sendMessage(racedConversation.id, message);
        return racedConversation;
      }
    }
    if (error) throw new Error(error.message);
    return data as Inquiry;
  }

  async getConversationForApartment(apartmentId: string): Promise<Inquiry | null> {
    const user = await this.requireUser('Please sign in to start a conversation.');
    return this.findConversation(apartmentId, user.id);
  }

  private async findConversation(apartmentId: string, renterId: string): Promise<Inquiry | null> {
    const { data, error } = await this.supabase
      .from('inquiries')
      .select(`*, ${APARTMENT_EMBED}`)
      .eq('apartment_id', apartmentId)
      .eq('renter_id', renterId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Inquiry | null;
  }

  async getMyInquiries(): Promise<Inquiry[]> {
    const user = await this.requireUser('Please sign in to view your messages.');
    const { data, error } = await this.supabase
      .from('inquiries')
      .select(`*, ${APARTMENT_EMBED}`)
      .eq('renter_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Inquiry[];
  }

  async getConversationPage(page: number, pageSize: number): Promise<InquiryPage> {
    await this.requireUser('Please sign in to view your messages.');
    const safePage = Math.max(1, Math.floor(page)), safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const from = (safePage - 1) * safeSize;
    const { data, error, count } = await this.supabase.from('inquiries')
      .select(`*, ${APARTMENT_EMBED}`, { count: 'exact' })
      .order('updated_at', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(from, from + safeSize - 1);
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as Inquiry[], total: count ?? 0 };
  }

  async getConversation(inquiryId: string): Promise<Inquiry | null> {
    await this.requireUser('Please sign in to view your messages.');
    const { data, error } = await this.supabase.from('inquiries').select(`*, ${APARTMENT_EMBED}`)
      .eq('id', inquiryId).maybeSingle();
    if (error) throw new Error(error.message);
    return data as Inquiry | null;
  }

  async getLandlordInquiries(): Promise<Inquiry[]> {
    const user = await this.requireUser('Please sign in to view listing messages.');
    const { data, error } = await this.supabase
      .from('inquiries')
      .select(
        `*, apartment:apartments!inner(id,title,owner_id,photos,monthly_rent,address,city,state)`,
      )
      .eq('apartment.owner_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Inquiry[];
  }

  async getMessages(inquiryIds: string[]): Promise<InquiryMessage[]> {
    if (!inquiryIds.length) return [];
    const { data, error } = await this.supabase
      .from('inquiry_messages')
      .select('id,inquiry_id,sender_id,body,created_at')
      .in('inquiry_id', inquiryIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as InquiryMessage[];
  }

  async getParticipantNames(inquiryIds: string[]): Promise<InquiryParticipantName[]> {
    if (!inquiryIds.length) return [];
    const { data, error } = await this.supabase.rpc('get_inquiry_participant_names', {
      p_inquiry_ids: inquiryIds,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as InquiryParticipantName[];
  }

  async markConversationRead(inquiryId: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('mark_inquiry_conversation_read', {
      p_inquiry_id: inquiryId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async getUnreadMessageCount(): Promise<number> {
    const { data, error } = await this.supabase.rpc('get_unread_inquiry_message_count');
    if (error) throw new Error(error.message);
    const count = Number(data);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('Supabase returned an invalid unread message count.');
    }
    return count;
  }

  async sendMessage(inquiryId: string, body: string): Promise<InquiryMessage> {
    const message = body.trim();
    if (message.length < 2 || message.length > 3000) {
      throw new Error('A message must contain between 2 and 3000 characters.');
    }
    const user = await this.requireUser('Please sign in to send a message.');
    const { data, error } = await this.supabase
      .from('inquiry_messages')
      .insert({ inquiry_id: inquiryId, sender_id: user.id, body: message })
      .select('id,inquiry_id,sender_id,body,created_at')
      .single();
    if (error) throw new Error(error.message);
    return data as InquiryMessage;
  }

  private async requireUser(message: string): Promise<{ id: string }> {
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser();
    if (error || !user) throw new Error(message);
    return user;
  }
}
