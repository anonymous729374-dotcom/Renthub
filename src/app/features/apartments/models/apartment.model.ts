export type ApartmentStatus = 'draft' | 'published' | 'rented';

export type VegetarianPreference =
  | 'vegetarian'
  | 'non-vegetarian'
  | 'no-preference';

export const APARTMENT_AMENITIES = [
  'Wi-Fi', 'Parking', 'Air conditioning', 'Gym', 'Swimming pool',
  'Security', 'Power backup', 'Lift', 'Balcony', 'Garden',
] as const;

/** Align typed filters with the canonical amenity values saved by the listing form. */
export function normalizeAmenityFilter(value: string): string {
  const trimmed = value.trim();
  return APARTMENT_AMENITIES.find(amenity => amenity.toLocaleLowerCase() === trimmed.toLocaleLowerCase()) ?? trimmed;
}

export interface Apartment {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string | null;
  postal_code: string | null;
  monthly_rent: number;
  bedrooms: number;
  bathrooms: number;
  area_sqft: number | null;
  is_furnished: boolean;
  vegetarian_preference: VegetarianPreference | null;
  amenities: string[];
  photos: string[];
  status: ApartmentStatus;
  created_at: string;
  updated_at: string;
}

export type CreateApartmentInput = Omit<
  Apartment,
  'id' | 'owner_id' | 'created_at' | 'updated_at'
>;

export type UpdateApartmentInput = Partial<CreateApartmentInput>;

export interface ApartmentFilters {
  search?: string;
  location?: string;
  /** @deprecated Use location for searches across all location columns. */
  city?: string;
  minRent?: number;
  maxRent?: number;
  bedrooms?: number;
  furnished?: boolean;
  amenities?: string[];
  sortBy?: 'newest' | 'rent-asc' | 'rent-desc';
  page?: number;
  pageSize?: number;
}

export interface PaginatedApartments {
  items: Apartment[];
  total: number;
  page: number;
  pageSize: number;
}

/** Fields rendered by the apartment cards used on Home and Favourites. */
export type ApartmentCardListing = Pick<
  Apartment,
  | 'id'
  | 'title'
  | 'address'
  | 'city'
  | 'state'
  | 'monthly_rent'
  | 'bedrooms'
  | 'bathrooms'
  | 'area_sqft'
  | 'is_furnished'
  | 'amenities'
  | 'photos'
>;

export interface PaginatedApartmentCards {
  items: ApartmentCardListing[];
  total: number;
  page: number;
  pageSize: number;
}
