import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export const SUPABASE_CLIENT =
  new InjectionToken<SupabaseClient>('SUPABASE_CLIENT', {
    providedIn: 'root',
    factory: () => {
      const url = environment.supabaseUrl?.trim() ?? '';
      const key = environment.supabaseAnonKey?.trim() ?? '';
      if (!url || !key || url.includes('YOUR_PROJECT') || key.includes('YOUR_SUPABASE')) {
        throw new Error('RentHub needs a Supabase project URL and publishable/anon key. Configure src/environments/environment.ts.');
      }
      return createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    },
  });
