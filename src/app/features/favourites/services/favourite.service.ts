
import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';

export interface FavouriteIdPage { ids: string[]; total: number; }

@Injectable({
  providedIn: 'root',
})
export class FavouriteService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private cachedUserId: string | null = null;
  private cachedIds: string[] | null = null;
  private pendingLookup: { userId: string; promise: Promise<string[]> } | null = null;
  private readonly changesSubject = new Subject<{ apartmentId: string; isFavourite: boolean }>();
  readonly changes$ = this.changesSubject.asObservable();

  async getFavouriteIds(): Promise<string[]> {
    const { data: { session }, error: authError } =
      await this.supabase.auth.getSession();

    if (authError) {
      throw new Error(`Unable to verify your session: ${authError.message}`);
    }

    if (!session?.user) {
      this.cachedUserId = null;
      this.cachedIds = null;
      return [];
    }

    if (this.cachedUserId === session.user.id && this.cachedIds) return [...this.cachedIds];

    if (this.pendingLookup?.userId === session.user.id) return [...await this.pendingLookup.promise];

    const userId = session.user.id;
    const promise = (async (): Promise<string[]> => {
      const { data, error } = await this.supabase
        .from('favourites')
        .select('apartment_id')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      this.cachedUserId = userId;
      this.cachedIds = (data ?? []).map(item => item.apartment_id);
      return [...this.cachedIds];
    })();
    const pending = { userId, promise };
    this.pendingLookup = pending;
    try { return [...await promise]; }
    finally { if (this.pendingLookup === pending) this.pendingLookup = null; }
  }

  async getFavouriteIdsPage(page: number, pageSize: number): Promise<FavouriteIdPage> {
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError) throw new Error(`Unable to verify your session: ${authError.message}`);
    if (!user) throw new Error('Please sign in to view your favourites.');
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const from = (safePage - 1) * safeSize;
    const { data, error, count } = await this.supabase.from('favourites')
      .select('apartment_id', { count: 'exact' }).eq('user_id', user.id)
      .order('created_at', { ascending: false }).order('apartment_id', { ascending: true })
      .range(from, from + safeSize - 1);
    if (error) throw new Error(error.message);
    return { ids: (data ?? []).map(item => item.apartment_id), total: count ?? 0 };
  }

  async isFavourite(apartmentId: string): Promise<boolean> {
    const ids = await this.getFavouriteIds();
    return ids.includes(apartmentId);
  }

  async toggleFavourite(apartmentId: string): Promise<boolean> {
    const { data: { user }, error: authError } =
      await this.supabase.auth.getUser();

    if (authError) {
      throw new Error(`Unable to verify your session: ${authError.message}`);
    }
    if (!user) {
      throw new Error('Please sign in to save favourite apartments.');
    }

    const { data: existing, error: lookupError } = await this.supabase
      .from('favourites')
      .select('apartment_id')
      .eq('user_id', user.id)
      .eq('apartment_id', apartmentId)
      .maybeSingle();

    if (lookupError) {
      throw new Error(lookupError.message);
    }

    if (existing) {
      const { error } = await this.supabase
        .from('favourites')
        .delete()
        .eq('user_id', user.id)
        .eq('apartment_id', apartmentId);

      if (error) {
        throw new Error(error.message);
      }

      this.setCachedFavourite(user.id, apartmentId, false);
      this.changesSubject.next({ apartmentId, isFavourite: false });

      return false;
    }

    const { error } = await this.supabase
      .from('favourites')
      .insert({
        user_id: user.id,
        apartment_id: apartmentId,
      });

    if (error) {
      throw new Error(error.message);
    }

    this.setCachedFavourite(user.id, apartmentId, true);
    this.changesSubject.next({ apartmentId, isFavourite: true });

    return true;
  }

  private setCachedFavourite(userId: string, apartmentId: string, isFavourite: boolean): void {
    if (this.cachedUserId !== userId || !this.cachedIds) return;
    this.cachedIds = isFavourite
      ? [...new Set([...this.cachedIds, apartmentId])]
      : this.cachedIds.filter(id => id !== apartmentId);
  }
}
