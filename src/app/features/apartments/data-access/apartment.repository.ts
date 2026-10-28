import {
  Apartment,
  ApartmentCardListing,
  ApartmentFilters,
  CreateApartmentInput,
  PaginatedApartmentCards,
  PaginatedApartments,
  UpdateApartmentInput,
} from '../models/apartment.model';

export interface ApartmentRepository {
  getApartments(
    filters?: ApartmentFilters,
  ): Promise<PaginatedApartmentCards>;

  getApartmentById(id: string): Promise<Apartment | null>;

  getMyApartments(): Promise<Apartment[]>;

  getMyApartmentsPage(page: number, pageSize: number): Promise<PaginatedApartments>;

  getApartmentsByIds(ids: string[]): Promise<Apartment[]>;

  createApartment(
    input: CreateApartmentInput,
  ): Promise<Apartment>;

  updateApartment(
    id: string,
    input: UpdateApartmentInput,
  ): Promise<Apartment>;

  deleteApartment(id: string): Promise<void>;
}
