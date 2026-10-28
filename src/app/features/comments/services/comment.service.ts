
import { inject, Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';
import { ApartmentPeopleService } from '../../apartments/services/apartment-people.service';
import { Comment } from '../models/comment.model';

export interface CommentPage { items: Comment[]; total: number; }

@Injectable({
  providedIn: 'root',
})
export class CommentService {
  private readonly supabase: SupabaseClient = inject(SUPABASE_CLIENT);
  private readonly apartmentPeople = inject(ApartmentPeopleService);

  async getComments(apartmentId: string): Promise<Comment[]> {
    const { data, error } = await this.supabase
      .from('comments')
      .select('*')
      .eq('apartment_id', apartmentId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const rows = await this.addAuthorNames(apartmentId, (data ?? []) as Comment[]);
    const repliesByParent = new Map<string, Comment[]>();

    for (const comment of rows) {
      if (comment.parent_comment_id) {
        const replies = repliesByParent.get(comment.parent_comment_id) ?? [];
        replies.push(comment);
        repliesByParent.set(comment.parent_comment_id, replies);
      }
    }

    return rows
      .filter(comment => !comment.parent_comment_id)
      .map(comment => ({
        ...comment,
        replies: repliesByParent.get(comment.id) ?? [],
      }));
  }

  async getCommentsPage(apartmentId: string, page: number, pageSize: number): Promise<CommentPage> {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const from = (safePage - 1) * safeSize;
    const { data: parents, error, count } = await this.supabase.from('comments')
      .select('*', { count: 'exact' }).eq('apartment_id', apartmentId)
      .is('parent_comment_id', null).order('created_at', { ascending: true }).order('id', { ascending: true })
      .range(from, from + safeSize - 1);
    if (error) throw new Error(error.message);
    const rows = (parents ?? []) as Comment[];
    const ids = rows.map(row => row.id);
    let replies: Comment[] = [];
    if (ids.length) {
      const result = await this.supabase.from('comments').select('*').in('parent_comment_id', ids)
        .order('created_at', { ascending: true }).order('id', { ascending: true });
      if (result.error) throw new Error(result.error.message);
      replies = (result.data ?? []) as Comment[];
    }
    const grouped = new Map<string, Comment[]>();
    for (const reply of replies) {
      const group = grouped.get(reply.parent_comment_id!) ?? [];
      group.push(reply); grouped.set(reply.parent_comment_id!, group);
    }
    const named = await this.addAuthorNames(apartmentId, [...rows, ...replies]);
    const namedById = new Map(named.map(comment => [comment.id, comment]));
    return {
      items: rows.map(row => ({
        ...namedById.get(row.id)!,
        replies: (grouped.get(row.id) ?? []).map(reply => namedById.get(reply.id)!),
      })),
      total: count ?? 0,
    };
  }

  private async addAuthorNames(apartmentId: string, comments: Comment[]): Promise<Comment[]> {
    try {
      const people = await this.apartmentPeople.getDisplayNames(apartmentId);
      const namesByUserId = new Map(people.map(person => [person.user_id, person.display_name]));
      return comments.map(comment => ({
        ...comment,
        author_name: namesByUserId.get(comment.user_id) ?? null,
      }));
    } catch {
      // Keep the comments readable if the optional display-name RPC is not yet installed.
      return comments.map(comment => ({ ...comment, author_name: null }));
    }
  }

  async addComment(
    apartmentId: string,
    commentText: string,
    parentCommentId?: string,
  ): Promise<Comment> {
    const text = commentText.trim();

    if (text.length < 2 || text.length > 2000) {
      throw new Error('Comment must contain between 2 and 2000 characters.');
    }

    const {
      data: { user },
      error: authError,
    } = await this.supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Please sign in before commenting.');
    }

    const { data, error } = await this.supabase
      .from('comments')
      .insert({
        apartment_id: apartmentId,
        user_id: user.id,
        comment_text: text,
        parent_comment_id: parentCommentId ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data as Comment;
  }

  async updateComment(commentId: string, commentText: string): Promise<void> {
    const text = commentText.trim();
    if (text.length < 2 || text.length > 2000) throw new Error('Comment must contain between 2 and 2000 characters.');
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user) throw new Error('Please sign in before editing a comment.');
    const { data, error } = await this.supabase.from('comments').update({ comment_text: text })
      .eq('id', commentId).eq('user_id', user.id).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('You may only edit your own comments.');
  }

  async deleteComment(commentId: string): Promise<void> {
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError || !user) throw new Error('Please sign in before deleting a comment.');
    const { data, error } = await this.supabase.from('comments').delete()
      .eq('id', commentId).eq('user_id', user.id).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('You may only delete your own comments.');
  }
}
