import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';
import { InquiryService } from './inquiry.service';

describe('InquiryService', () => {
  it('loads the unread message total from the authorized Supabase RPC', async () => {
    const rpc = vi.fn(async (functionName: string) => {
      expect(functionName).toBe('get_unread_inquiry_message_count');
      return { data: 12, error: null };
    });
    TestBed.configureTestingModule({
      providers: [InquiryService, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    await expect(TestBed.inject(InquiryService).getUnreadMessageCount()).resolves.toBe(12);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it('reuses one conversation when the same renter starts it twice concurrently', async () => {
    const inquiries: Array<Record<string, unknown>> = [];
    const messages: Array<Record<string, unknown>> = [];
    let nextInquiryId = 1;
    let nextMessageId = 1;
    const client = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'renter-1' } }, error: null }),
      },
      from(table: string) {
        let inserted: Record<string, unknown> | null = null;
        const filters: Record<string, unknown> = {};
        const query: any = {};
        query.select = () => query;
        query.eq = (column: string, value: unknown) => {
          filters[column] = value;
          return query;
        };
        query.insert = (value: Record<string, unknown>) => {
          inserted = value;
          return query;
        };
        query.maybeSingle = async () => ({
          data:
            inquiries.find(
              (row) =>
                row['apartment_id'] === filters['apartment_id'] &&
                row['renter_id'] === filters['renter_id'],
            ) ?? null,
          error: null,
        });
        query.single = async () => {
          if (table === 'inquiries') {
            const duplicate = inquiries.find(
              (row) =>
                row['apartment_id'] === inserted?.['apartment_id'] &&
                row['renter_id'] === inserted?.['renter_id'],
            );
            if (duplicate) {
              return { data: null, error: { code: '23505', message: 'duplicate inquiry' } };
            }
            const row = {
              ...inserted,
              id: `inquiry-${nextInquiryId++}`,
              created_at: '2026-10-27T00:00:00.000Z',
              updated_at: '2026-10-27T00:00:00.000Z',
            };
            inquiries.push(row);
            return { data: row, error: null };
          }
          const row = {
            ...inserted,
            id: `message-${nextMessageId++}`,
            created_at: '2026-10-27T00:00:01.000Z',
          };
          messages.push(row);
          return { data: row, error: null };
        };
        return query;
      },
    };

    TestBed.configureTestingModule({
      providers: [InquiryService, { provide: SUPABASE_CLIENT, useValue: client }],
    });
    const service = TestBed.inject(InquiryService);
    const [first, second] = await Promise.all([
      service.createInquiry({ apartment_id: 'apartment-1', message: 'Interested in a viewing.' }),
      service.createInquiry({ apartment_id: 'apartment-1', message: 'Can I visit this week?' }),
    ]);

    expect(inquiries).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]['inquiry_id']).toBe(first.id);
  });
});
