import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { Apartment } from '../../models/apartment.model';
import { ApartmentService } from '../../services/apartment.service';
import { ApartmentPeopleService } from '../../services/apartment-people.service';
import { FavouriteService } from '../../../favourites/services/favourite.service';
import { ApartmentDetailsPageComponent } from './apartment-details-page.component';

const apartment: Apartment = {
  id: 'apartment-1',
  owner_id: 'lister-1',
  title: 'Test apartment',
  description: 'A test listing',
  address: 'Sector 1',
  city: 'Pune',
  state: 'Maharashtra',
  postal_code: null,
  monthly_rent: 12000,
  bedrooms: 1,
  bathrooms: 1,
  area_sqft: null,
  is_furnished: false,
  vegetarian_preference: null,
  amenities: [],
  photos: [],
  status: 'draft',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('ApartmentDetailsPageComponent', () => {
  function setup(getApartmentById: ReturnType<typeof vi.fn>, isFavourite = vi.fn().mockResolvedValue(false), getDisplayNames = vi.fn().mockResolvedValue([])) {
    const paramMap = new BehaviorSubject(convertToParamMap({ id: apartment.id }));
    TestBed.configureTestingModule({
      imports: [ApartmentDetailsPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: paramMap.asObservable() } },
        { provide: ApartmentService, useValue: { getApartmentById } },
        { provide: FavouriteService, useValue: { isFavourite, toggleFavourite: vi.fn() } },
        { provide: ApartmentPeopleService, useValue: { getDisplayNames } },
        { provide: AuthService, useValue: { currentUser: null, user$: of(null) } },
      ],
    });
    const fixture = TestBed.createComponent(ApartmentDetailsPageComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, paramMap };
  }

  async function flushPrimaryLoad(fixture: ComponentFixture<ApartmentDetailsPageComponent>) {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  it('shows the apartment when secondary name and favourite requests are still pending', async () => {
    const pending = new Promise<never>(() => undefined);
    const { fixture, component } = setup(
      vi.fn().mockResolvedValue(apartment),
      vi.fn().mockReturnValue(pending),
      vi.fn().mockReturnValue(pending),
    );

    await flushPrimaryLoad(fixture);

    expect(component.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Test apartment');
    expect(fixture.nativeElement.textContent).not.toContain('Loading apartment details');
  });

  it('offers a retry when apartment loading fails and renders after the next request succeeds', async () => {
    const getApartmentById = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary network failure'))
      .mockResolvedValueOnce(apartment);
    const { fixture, component } = setup(getApartmentById);

    await flushPrimaryLoad(fixture);
    expect(component.errorMessage()).toContain('Temporary network failure');

    const retry = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    await flushPrimaryLoad(fixture);

    expect(getApartmentById).toHaveBeenCalledTimes(2);
    expect(component.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Test apartment');
  });
});
