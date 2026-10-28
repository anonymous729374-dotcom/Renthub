import { inject, Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';

export interface ApartmentDisplayName {
  user_id: string;
  display_name: string;
  is_lister: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApartmentPeopleService {
  private readonly supabase: SupabaseClient = inject(SUPABASE_CLIENT);
  private readonly pending = new Map<string, Promise<ApartmentDisplayName[]>>();

  getDisplayNames(apartmentId: string): Promise<ApartmentDisplayName[]> {
    const inFlight = this.pending.get(apartmentId);
    if (inFlight) return inFlight;

    const request = Promise.resolve(
      this.supabase.rpc('get_apartment_display_names', { p_apartment_id: apartmentId }),
    )
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as ApartmentDisplayName[];
      })
      .finally(() => {
        this.pending.delete(apartmentId);
      });

    this.pending.set(apartmentId, request);
    return request;
  }
}
