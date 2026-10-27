import { TestBed } from '@angular/core/testing';
import { APARTMENT_REPOSITORY } from '../data-access/apartment.repository.token';
import { ApartmentService } from './apartment.service';
import { normalizeAmenityFilter } from '../models/apartment.model';

describe('ApartmentService', () => {
  it.each(['Balcony', 'balcony', 'BALCONY', 'bAlCoNy'])('normalizes amenity filter %s to the saved value', value => {
    expect(normalizeAmenityFilter(value)).toBe('Balcony');
  });

  it('delegates filtered listing queries to the repository', async () => {
    const result = { items: [], total: 0, page: 1, pageSize: 9 };
    const repository = { getApartments: async () => result };
    TestBed.configureTestingModule({ providers: [ApartmentService, { provide: APARTMENT_REPOSITORY, useValue: repository }] });
    const service = TestBed.inject(ApartmentService);
    await expect(service.getApartments({ city: 'Pune', page: 1 })).resolves.toEqual(result);
  });
});
