
import { inject, Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';
import {
  Apartment,
  ApartmentCardListing,
  APARTMENT_AMENITIES,
  normalizeAmenityFilter,
  ApartmentFilters,
  CreateApartmentInput,
  PaginatedApartments,
  PaginatedApartmentCards,
  UpdateApartmentInput,
} from '../models/apartment.model';
import { ApartmentRepository } from './apartment.repository';

function escapedSearchValue(value: string): string {
  const escaped = value.trim().replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

export function buildApartmentSearchFilter(input: string): string | null {
  const search = input.trim();
  if (!search) return null;
  const value = escapedSearchValue(search);
  const searchable = [
    `title.ilike.${value}`,
    `description.ilike.${value}`,
    `city.ilike.${value}`,
    `address.ilike.${value}`,
    `state.ilike.${value}`,
    `postal_code.ilike.${value}`,
  ];
  const matchingAmenity = APARTMENT_AMENITIES.find(
    amenity => amenity.toLocaleLowerCase() === search.toLocaleLowerCase(),
  );
  if (matchingAmenity) searchable.push(`amenities.cs.{"${matchingAmenity}"}`);
  return searchable.join(',');
}

const APARTMENT_CARD_COLUMNS =
  'id,title,address,city,state,monthly_rent,bedrooms,bathrooms,area_sqft,is_furnished,amenities,photos';

@Injectable({ providedIn: 'root' })
export class SupabaseApartmentRepository implements ApartmentRepository {
  private readonly supabase: SupabaseClient = inject(SUPABASE_CLIENT);
  private readonly table = 'apartments';

  async getApartments(
    filters: ApartmentFilters = {},
  ): Promise<PaginatedApartmentCards> {
    const page = Math.max(1, Math.floor(filters.page ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(filters.pageSize ?? 9)),
    );

    if (filters.location?.trim()) {
      const { data, error } = await this.supabase.rpc('search_apartments_location_aware', {
        p_search: filters.search?.trim() || null,
        p_location: filters.location.trim(),
        p_city: filters.city?.trim() || null,
        p_min_rent: filters.minRent ?? null,
        p_max_rent: filters.maxRent ?? null,
        p_bedrooms: filters.bedrooms ?? null,
        p_furnished: filters.furnished ?? null,
        p_amenities: filters.amenities?.length
          ? filters.amenities.map(normalizeAmenityFilter).filter(Boolean)
          : null,
        p_sort_by: filters.sortBy ?? 'newest',
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw new Error(`Failed to search apartments: ${error.message}`);
      const result = data as { items?: Apartment[]; total?: number } | null;
      if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(Number(result.total))) {
        throw new Error('Supabase returned an invalid apartment search result.');
      }
      return { items: result.items, total: Number(result.total), page, pageSize };
    }

    let query = this.supabase
      .from(this.table)
      .select(APARTMENT_CARD_COLUMNS, { count: 'exact' })
      .eq('status', 'published');

    const searchFilter = buildApartmentSearchFilter(filters.search ?? '');
    if (searchFilter) query = query.or(searchFilter);

    // Retain compatibility for existing callers that still specify city directly.
    if (filters.city?.trim()) {
      query = query.ilike('city', `%${filters.city.trim()}%`);
    }

    if (filters.minRent != null) {
      query = query.gte('monthly_rent', filters.minRent);
    }

    if (filters.maxRent != null) {
      query = query.lte('monthly_rent', filters.maxRent);
    }

    if (filters.bedrooms != null) {
      query = query.gte('bedrooms', filters.bedrooms);
    }

    if (filters.furnished != null) {
      query = query.eq('is_furnished', filters.furnished);
    }

    if (filters.amenities?.length) {
      const amenities = filters.amenities.map(normalizeAmenityFilter).filter(Boolean);
      if (amenities.length) query = query.contains('amenities', amenities);
    }

    switch (filters.sortBy) {
      case 'rent-asc':
        query = query.order('monthly_rent', { ascending: true });
        break;
      case 'rent-desc':
        query = query.order('monthly_rent', { ascending: false });
        break;
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw new Error(`Failed to load apartments: ${error.message}`);
    }

    return {
      items: (data ?? []) as ApartmentCardListing[],
      total: count ?? 0,
      page,
      pageSize,
    };
  }

  async getApartmentById(id: string): Promise<Apartment | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load apartment: ${error.message}`);
    }

    return data as Apartment | null;
  }

  async getMyApartments(): Promise<Apartment[]> {
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError) throw new Error(`Unable to verify your session: ${authError.message}`);
    if (!user) throw new Error('Please sign in to manage your listings.');

    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw new Error(`Failed to load your listings: ${error.message}`);
    return (data ?? []) as Apartment[];
  }

  async getMyApartmentsPage(page: number, pageSize: number): Promise<PaginatedApartments> {
    const { data: { user }, error: authError } = await this.supabase.auth.getUser();
    if (authError) throw new Error(`Unable to verify your session: ${authError.message}`);
    if (!user) throw new Error('Please sign in to manage your listings.');
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const from = (safePage - 1) * safeSize;
    const { data, error, count } = await this.supabase.from(this.table)
      .select('*', { count: 'exact' }).eq('owner_id', user.id)
      .order('updated_at', { ascending: false }).order('id', { ascending: true })
      .range(from, from + safeSize - 1);
    if (error) throw new Error(`Failed to load your listings: ${error.message}`);
    return { items: (data ?? []) as Apartment[], total: count ?? 0, page: safePage, pageSize: safeSize };
  }

  async getApartmentsByIds(ids: string[]): Promise<Apartment[]> {
    if (!ids.length) return [];
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .in('id', ids)
      .eq('status', 'published');
    if (error) throw new Error(`Failed to load saved apartments: ${error.message}`);
    return (data ?? []) as Apartment[];
  }

  async createApartment(
    input: CreateApartmentInput,
  ): Promise<Apartment> {
    const { data: authData, error: authError } =
      await this.supabase.auth.getUser();

    if (authError || !authData.user) {
      throw new Error('You must be logged in to create an apartment.');
    }

    const { data, error } = await this.supabase
      .from(this.table)
      .insert({
        ...input,
        owner_id: authData.user.id,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create apartment: ${error.message}`);
    }

    return data as Apartment;
  }

  async updateApartment(
    id: string,
    input: UpdateApartmentInput,
  ): Promise<Apartment> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(input)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update apartment: ${error.message}`);
    }

    return data as Apartment;
  }

  async deleteApartment(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete apartment: ${error.message}`);
    }
  }
}
