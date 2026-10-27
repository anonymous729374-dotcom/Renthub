import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePageComponent } from './home-page.component';
import { ApartmentService } from '../../../apartments/services/apartment.service';
import { APARTMENT_REPOSITORY } from '../../../apartments/data-access/apartment.repository.token';

describe('HomePageComponent', () => {
  it('resets to the first page when filters change', () => {
    TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [provideRouter([]), { provide: APARTMENT_REPOSITORY, useValue: { getApartments: async () => ({ items: [], total: 0, page: 1, pageSize: 9 }) } }],
    });
    const component = TestBed.createComponent(HomePageComponent).componentInstance;
    component.filters.page = 4;
    component.onFiltersChanged({ city: 'Delhi' });
    expect(component.filters).toMatchObject({ city: 'Delhi', page: 1 });
  });
});
