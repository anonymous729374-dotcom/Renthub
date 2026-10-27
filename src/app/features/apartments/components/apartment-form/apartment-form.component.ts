
import { CommonModule } from '@angular/common';
import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { multipleOf, trimmedRequired, wholeNumber } from '../../../../shared/validators/custom-validators';
import { ApartmentService } from '../../services/apartment.service';
import { APARTMENT_AMENITIES } from '../../models/apartment.model';
import {
  Apartment,
  ApartmentStatus,
  CreateApartmentInput,
  VegetarianPreference,
} from '../../models/apartment.model';

@Component({
  selector: 'app-apartment-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" class="apartment-form">
      <div class="section-heading">
        <h2>Property information</h2>
        <p>Fields marked with * are required. Renters contact you through the inquiry form; private contact details are not exposed.</p>
      </div>

      <div class="field">
        <label for="title">Property title *</label>
        <input id="title" type="text" formControlName="title"
          placeholder="e.g. Spacious 2 BHK near metro" />
        <small class="error" *ngIf="invalid('title')">
          Enter a title between 5 and 100 characters.
        </small>
      </div>

      <div class="field">
        <label for="description">Description *</label>
        <textarea id="description" rows="5" formControlName="description"
          placeholder="Describe your apartment, surroundings and rental terms"></textarea>
        <small class="error" *ngIf="invalid('description')">
          Description must contain at least 20 characters.
        </small>
      </div>

      <div class="field">
        <label for="address">Street address *</label>
        <input id="address" type="text" formControlName="address"
          placeholder="House number, street and locality" />
        <small class="error" *ngIf="invalid('address')">
          Enter the property address.
        </small>
      </div>

      <div class="two-columns">
        <div class="field">
          <label for="city">City *</label>
          <input id="city" type="text" formControlName="city"
            placeholder="City" />
          <small class="error" *ngIf="invalid('city')">
            Enter the city.
          </small>
        </div>

        <div class="field">
          <label for="state">State</label>
          <input id="state" type="text" formControlName="state"
            placeholder="State" />
        </div>

        <div class="field">
          <label for="postal_code">Postal code</label>
          <input id="postal_code" type="text" formControlName="postal_code"
            placeholder="Postal code" />
        </div>

        <div class="field">
          <label for="monthly_rent">Monthly rent (₹) *</label>
          <input id="monthly_rent" type="number" min="1"
            formControlName="monthly_rent" placeholder="15000" />
          <small class="error" *ngIf="invalid('monthly_rent')">
            Rent must be greater than zero.
          </small>
        </div>

        <div class="field">
          <label for="bedrooms">Bedrooms *</label>
          <input id="bedrooms" type="number" min="0"
            formControlName="bedrooms" />
          <small class="error" *ngIf="invalid('bedrooms')">
            Enter a valid number of bedrooms.
          </small>
        </div>

        <div class="field">
          <label for="bathrooms">Bathrooms *</label>
          <input id="bathrooms" type="number" min="0" step="0.5"
            formControlName="bathrooms" />
          <small class="error" *ngIf="invalid('bathrooms')">
            Enter a valid number of bathrooms.
          </small>
        </div>

        <div class="field">
          <label for="area_sqft">Area (sq. ft.)</label>
          <input id="area_sqft" type="number" min="1"
            formControlName="area_sqft" placeholder="1000" />
        </div>
      </div>

      <div class="field">
        <label class="check-option">
          <input type="checkbox" formControlName="is_furnished" />
          <span>This apartment is furnished</span>
        </label>
      </div>

      <div class="field">
        <fieldset class="field preference-field">
          <legend>Food preference</legend>
          <label class="check-option"><input type="radio" formControlName="vegetarian_preference" value="no-preference" /><span>No preference</span></label>
          <label class="check-option"><input type="radio" formControlName="vegetarian_preference" value="vegetarian" /><span>Vegetarian preferred</span></label>
          <label class="check-option"><input type="radio" formControlName="vegetarian_preference" value="non-vegetarian" /><span>Non-vegetarian allowed</span></label>
        </fieldset>
      </div>

      <div class="field">
        <label>Amenities</label>
        <div class="amenities-grid">
          <label *ngFor="let amenity of availableAmenities" class="check-option">
            <input type="checkbox"
              [checked]="selectedAmenities().includes(amenity)"
              (change)="toggleAmenity(amenity, $event)" />
            <span>{{ amenity }}</span>
          </label>
        </div>
      </div>

      <div class="field">
        <label for="photos">Photo URLs</label>
        <textarea id="photos" rows="3" [value]="photoText()"
          (input)="updatePhotoText($event)"
          placeholder="Enter one image URL per line"></textarea>
        <small class="hint">
          Add publicly accessible image URLs. File upload requires separate storage setup.
        </small>
      </div>

      <div class="field">
        <label for="status">Listing status</label>
        <select id="status" formControlName="status">
          <option value="published">Available to rent</option>
          <option value="draft">Save as draft</option>
          <option value="rented">Already rented</option>
        </select>
      </div>

      <p class="error form-error" *ngIf="errorMessage()">
        {{ errorMessage() }}
      </p>

      <div class="form-actions">
        <button type="button" class="secondary-button"
          (click)="resetForm()" [disabled]="saving()">
          Reset
        </button>

        <button type="button" class="secondary-button"
          (click)="preview()" [disabled]="saving()">
          Preview
        </button>

        <button type="submit" class="primary-button" [disabled]="saving()">
          {{ saving() ? 'Saving...' : (existingApartment() ? 'Save changes' : 'Preview and continue') }}
        </button>
      </div>
    </form>
  `,
  styles: [`
    :host { display: block; }

    .apartment-form { display: grid; gap: 22px; color: #172033; }
    .section-heading h2 { margin: 0 0 6px; font-size: 21px; font-weight: 750; }
    .section-heading p, .hint { margin: 0; color: #64748b; font-size: 13px; }
    .field { display: grid; gap: 8px; min-width: 0; }
    .field > label:not(.check-option), legend { font-size: 14px; font-weight: 650; }
    .preference-field { border: 0; padding: 0; }

    input:not([type="checkbox"]), textarea, select {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      border: 1px solid #cbd5e1;
      border-radius: 9px;
      background: #fff;
      padding: 12px 13px;
      color: #172033;
      font: inherit;
      font-size: 14px;
    }

    textarea { resize: vertical; }
    input:focus, textarea:focus, select:focus {
      outline: 2px solid #bfdbfe;
      border-color: #2563eb;
    }

    .two-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .amenities-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .check-option {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 14px;
      cursor: pointer;
    }

    .check-option input { width: 16px; height: 16px; accent-color: #2563eb; }
    .error { color: #dc2626; font-size: 12px; }
    .form-error { font-size: 14px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; }

    button {
      border: 0;
      border-radius: 9px;
      padding: 12px 18px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }

    button:disabled { opacity: .6; cursor: not-allowed; }
    .primary-button { color: #fff; background: #2563eb; }
    .primary-button:hover:not(:disabled) { background: #1d4ed8; }
    .secondary-button { color: #334155; background: #f1f5f9; }

    @media (max-width: 560px) {
      .two-columns, .amenities-grid { grid-template-columns: 1fr; }
      .form-actions { flex-direction: column-reverse; }
      .form-actions button { width: 100%; }
    }
  `],
})
export class ApartmentFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly apartmentService = inject(ApartmentService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly selectedAmenities = signal<string[]>([]);
  readonly photoText = signal('');
  readonly existingApartment = input<Apartment | null>(null);
  readonly previewRequested = output<CreateApartmentInput>();

  readonly availableAmenities = APARTMENT_AMENITIES;

  readonly form = this.fb.nonNullable.group({
    title: ['', [trimmedRequired(), Validators.minLength(5), Validators.maxLength(100)]],
    description: ['', [trimmedRequired(), Validators.minLength(20)]],
    address: ['', trimmedRequired()],
    city: ['', trimmedRequired()],
    state: [''],
    postal_code: [''],
    monthly_rent: [15000, [Validators.required, Validators.min(1)]],
    bedrooms: [1, [Validators.required, Validators.min(0), Validators.max(50), wholeNumber()]],
    bathrooms: [1, [Validators.required, Validators.min(0.5), Validators.max(50), multipleOf(0.5)]],
    area_sqft: [null as number | null, [Validators.min(1), wholeNumber()]],
    is_furnished: [false],
    vegetarian_preference: ['no-preference' as VegetarianPreference],
    status: ['published' as ApartmentStatus],
  });

  ngOnInit(): void {
    const apartment = this.existingApartment();
    if (!apartment) {
      if (typeof sessionStorage !== 'undefined') {
        const raw = sessionStorage.getItem('renthub-apartment-preview');
        if (raw) {
          try {
            const draft = JSON.parse(raw) as CreateApartmentInput;
            this.form.patchValue({
              title: draft.title,
              description: draft.description,
              address: draft.address,
              city: draft.city,
              state: draft.state ?? '',
              postal_code: draft.postal_code ?? '',
              monthly_rent: draft.monthly_rent,
              bedrooms: draft.bedrooms,
              bathrooms: draft.bathrooms,
              area_sqft: draft.area_sqft,
              is_furnished: draft.is_furnished,
              vegetarian_preference: draft.vegetarian_preference ?? 'no-preference',
              status: draft.status,
            });
            this.selectedAmenities.set([...(draft.amenities ?? [])]);
            this.photoText.set((draft.photos ?? []).join('\n'));
          } catch {
            sessionStorage.removeItem('renthub-apartment-preview');
          }
        }
      }
      return;
    }
    this.form.patchValue({
      title: apartment.title,
      description: apartment.description,
      address: apartment.address,
      city: apartment.city,
      state: apartment.state ?? '',
      postal_code: apartment.postal_code ?? '',
      monthly_rent: apartment.monthly_rent,
      bedrooms: apartment.bedrooms,
      bathrooms: apartment.bathrooms,
      area_sqft: apartment.area_sqft,
      is_furnished: apartment.is_furnished,
      vegetarian_preference: apartment.vegetarian_preference ?? 'no-preference',
      status: apartment.status,
    });
    this.selectedAmenities.set([...apartment.amenities]);
    this.photoText.set(apartment.photos.join('\n'));
  }

  invalid(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  toggleAmenity(amenity: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;

    this.selectedAmenities.update(current =>
      checked
        ? [...current, amenity]
        : current.filter(item => item !== amenity)
    );
  }

  updatePhotoText(event: Event): void {
    this.photoText.set((event.target as HTMLTextAreaElement).value);
  }

  resetForm(): void {
    this.form.reset({
      title: '',
      description: '',
      address: '',
      city: '',
      state: '',
      postal_code: '',
      monthly_rent: 15000,
      bedrooms: 1,
      bathrooms: 1,
      area_sqft: null,
      is_furnished: false,
      vegetarian_preference: 'no-preference',
      status: 'published',
    });

    this.selectedAmenities.set([]);
    this.photoText.set('');
    this.errorMessage.set('');
  }

  async submit(): Promise<void> {
    if (!this.existingApartment()) {
      this.preview();
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please correct the highlighted fields.');
      return;
    }

    if (!this.photoUrlsAreValid()) return;

    this.saving.set(true);
    this.errorMessage.set('');

    try {
      const apartment = this.toInput();

      const existing = this.existingApartment();
      const saved = await this.apartmentService.updateApartment(existing!.id, apartment);

      await this.router.navigate(['/apartments', saved.id]);
    } catch (error: unknown) {
      console.error('Failed to create apartment:', error);

      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'Could not save the apartment. Please try again.'
      );
    } finally {
      this.saving.set(false);
    }
  }

  preview(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please correct the highlighted fields before previewing.');
      return;
    }
    if (!this.photoUrlsAreValid()) return;
    this.previewRequested.emit(this.toInput());
  }

  private photoUrlsAreValid(): boolean {
    const urls = this.photoText().split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const valid = urls.every((url) => {
      try { return ['http:', 'https:'].includes(new URL(url).protocol); }
      catch { return false; }
    });
    if (!valid) this.errorMessage.set('Each photo must be a valid http or https URL.');
    return valid;
  }

  private toInput(): CreateApartmentInput {
    const value = this.form.getRawValue();
    return {
      ...value,
      monthly_rent: Number(value.monthly_rent),
      bedrooms: Number(value.bedrooms),
      bathrooms: Number(value.bathrooms),
      area_sqft: value.area_sqft == null ? null : Number(value.area_sqft),
      amenities: this.selectedAmenities(),
      photos: this.photoText().split('\n').map(url => url.trim()).filter(Boolean),
    };
  }
}
