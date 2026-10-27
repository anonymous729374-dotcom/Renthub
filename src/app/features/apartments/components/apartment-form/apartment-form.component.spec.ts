import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApartmentService } from '../../services/apartment.service';
import { ApartmentFormComponent } from './apartment-form.component';

describe('ApartmentFormComponent', () => {
  const apartmentService = {
    createApartment: vi.fn(),
    updateApartment: vi.fn(),
  };

  beforeEach(() => {
    apartmentService.createApartment.mockReset();
    apartmentService.updateApartment.mockReset();
    TestBed.configureTestingModule({
      imports: [ApartmentFormComponent],
      providers: [provideRouter([]), { provide: ApartmentService, useValue: apartmentService }],
    });
  });

  it('blocks preview when required property details are missing', () => {
    const component = TestBed.createComponent(ApartmentFormComponent).componentInstance;
    component.preview();
    expect(component.form.touched).toBe(true);
    expect(component.errorMessage()).toContain('correct the highlighted fields');
    expect(apartmentService.createApartment).not.toHaveBeenCalled();
  });

  it('emits a complete form snapshot for preview without persisting a listing', () => {
    const component = TestBed.createComponent(ApartmentFormComponent).componentInstance;
    component.form.patchValue({
      title: 'Sunny two bedroom home',
      description: 'A bright apartment close to transit and everyday services.',
      address: '12 Lake Road',
      city: 'Pune',
      monthly_rent: 25000,
      bedrooms: 2,
      bathrooms: 1.5,
      area_sqft: 900,
      is_furnished: true,
      vegetarian_preference: 'vegetarian',
      status: 'published',
    });
    component.toggleAmenity('Parking', { target: { checked: true } } as unknown as Event);
    component.photoText.set('https://images.example.test/home.jpg');

    let snapshot: unknown;
    component.previewRequested.subscribe(value => snapshot = value);
    component.preview();

    expect(snapshot).toMatchObject({
      city: 'Pune',
      monthly_rent: 25000,
      bedrooms: 2,
      bathrooms: 1.5,
      is_furnished: true,
      vegetarian_preference: 'vegetarian',
      amenities: ['Parking'],
      photos: ['https://images.example.test/home.jpg'],
    });
    expect(apartmentService.createApartment).not.toHaveBeenCalled();
  });
});
