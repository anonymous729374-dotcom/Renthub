import { describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SUPABASE_CLIENT } from '../../../core/config/supabase.client';
import { SupabaseApartmentRepository, buildApartmentSearchFilter } from './supabase-apartment.repository';
import { Apartment } from '../models/apartment.model';

describe('buildApartmentSearchFilter', () => {
  it('treats amenity searches as case-insensitive and trims whitespace', () => {
    expect(buildApartmentSearchFilter(' Balcony ')).toContain('amenities.cs.{"Balcony"}');
    expect(buildApartmentSearchFilter('BALCONY')).toContain('amenities.cs.{"Balcony"}');
    expect(buildApartmentSearchFilter('bAlCoNy')).toContain('amenities.cs.{"Balcony"}');
    expect(buildApartmentSearchFilter('BALCONY')).toContain('title.ilike.');
  });

  it('searches all text fields with case-insensitive matching', () => {
    const filter = buildApartmentSearchFilter('  Pune  ');
    expect(filter).toContain('title.ilike."%Pune%"');
    expect(filter).toContain('description.ilike."%Pune%"');
    expect(filter).toContain('city.ilike."%Pune%"');
    expect(filter).toContain('address.ilike."%Pune%"');
    expect(filter).toContain('state.ilike."%Pune%"');
    expect(filter).toContain('postal_code.ilike."%Pune%"');
  });

  it('omits empty search strings and escapes wildcard characters', () => {
    expect(buildApartmentSearchFilter('  ')).toBeNull();
    expect(buildApartmentSearchFilter('100%')).toContain('100\\%');
  });
});

describe('SupabaseApartmentRepository location RPC', () => {
  it('delegates progressive location search and all filters with server pagination', async () => {
    const apartment = { id: 'apartment-1' } as Apartment;
    const rpc = vi.fn().mockResolvedValue({ data: { items: [apartment], total: 21 }, error: null });
    TestBed.configureTestingModule({
      providers: [SupabaseApartmentRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });
    const repository = TestBed.inject(SupabaseApartmentRepository);
    const result = await repository.getApartments({
      search: '  furnished  ', location: ' Sector 18, Gurugram ', minRent: 12000,
      maxRent: 30000, bedrooms: 2, furnished: true, amenities: ['balcony'],
      sortBy: 'rent-asc', page: 2, pageSize: 10,
    });
    expect(rpc).toHaveBeenCalledWith('search_apartments_location_aware', expect.objectContaining({
      p_search: 'furnished', p_location: 'Sector 18, Gurugram', p_min_rent: 12000,
      p_max_rent: 30000, p_bedrooms: 2, p_furnished: true, p_amenities: ['Balcony'],
      p_sort_by: 'rent-asc', p_page: 2, p_page_size: 10,
    }));
    expect(result).toEqual({ items: [apartment], total: 21, page: 2, pageSize: 10 });
  });
});
