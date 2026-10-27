export type InquiryStatus = 'pending' | 'responded' | 'closed';

export interface Inquiry {
  id: string;
  apartment_id: string;
  renter_id: string;
  message: string;
  status: InquiryStatus;
  response_message?: string | null;
  responded_at?: string | null;
  renter_last_read_at?: string | null;
  lister_last_read_at?: string | null;
  created_at: string;
  apartment?: {
    id: string;
    title: string;
    owner_id?: string;
    photos?: string[];
    monthly_rent?: number;
    address?: string;
    city?: string;
    state?: string | null;
  };
  messages?: InquiryMessage[];
}

export interface InquiryMessage {
  id: string;
  inquiry_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface InquiryParticipantName {
  inquiry_id: string;
  user_id: string;
  display_name: string | null;
}

export interface CreateInquiryInput {
  apartment_id: string;
  message: string;
}
