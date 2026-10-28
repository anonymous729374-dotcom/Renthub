
import { inject, Injectable } from '@angular/core';

import { APARTMENT_REPOSITORY } from '../data-access/apartment.repository.token';
import {
  Apartment,
  ApartmentFilters,
  CreateApartmentInput,
  PaginatedApartmentCards,
  PaginatedApartments,
  UpdateApartmentInput,
} from '../models/apartment.model';

@Injectable({ providedIn: 'root' })
export class ApartmentService {
  private readonly repository = inject(APARTMENT_REPOSITORY);

  getApartments(
    filters: ApartmentFilters = {},
  ): Promise<PaginatedApartmentCards> {
    return this.repository.getApartments(filters);
  }

  getApartmentById(id: string): Promise<Apartment | null> {
    return this.repository.getApartmentById(id);
  }

  getMyApartments(): Promise<Apartment[]> {
    return this.repository.getMyApartments();
  }

  getMyApartmentsPage(page: number, pageSize: number): Promise<PaginatedApartments> {
    return this.repository.getMyApartmentsPage(page, pageSize);
  }

  getApartmentsByIds(ids: string[]): Promise<Apartment[]> {
    return this.repository.getApartmentsByIds(ids);
  }

  createApartment(input: CreateApartmentInput): Promise<Apartment> {
    return this.repository.createApartment(input);
  }

  updateApartment(
    id: string,
    input: UpdateApartmentInput,
  ): Promise<Apartment> {
    return this.repository.updateApartment(id, input);
  }

  deleteApartment(id: string): Promise<void> {
    return this.repository.deleteApartment(id);
  }
}
