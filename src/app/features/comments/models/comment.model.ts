
export interface Comment {
  id: string;
  apartment_id: string;
  user_id: string;
  parent_comment_id: string | null;
  comment_text: string;
  created_at: string;
  author_name?: string | null;
  updated_at?: string;
  replies?: Comment[];
}
