
import { Component, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApartmentFilters } from '../../../apartments/models/apartment.model';

@Component({
  selector: 'app-apartment-filters',
  standalone: true,
  imports: [FormsModule],
  template: `
    <form class="filters" (ngSubmit)="apply()">
      <div class="filter-heading">
        <div>
          <p class="eyebrow">Find your place</p>
          <h2>Search apartments</h2>
        </div>
        <button class="reset-button" type="button" (click)="reset()">Reset</button>
      </div>

      <div class="filter-grid">
        <label>
          Search listings
          <input name="search" [(ngModel)]="searchText"
            placeholder="Title, description, location, amenity" />
        </label>
        <label>
          Location
          <input
            name="location"
            [(ngModel)]="location"
            placeholder="City, state, address, postal code"
            autocomplete="address-level2"
          />
        </label>

        <label>
          Minimum rent (₹)
          <input
            name="minRent"
            type="number"
            min="0"
            [(ngModel)]="minRent"
            placeholder="No minimum"
          />
        </label>

        <label>
          Maximum rent (₹)
          <input
            name="maxRent"
            type="number"
            min="0"
            [(ngModel)]="maxRent"
            placeholder="No maximum"
          />
        </label>

        <label>
          Minimum bedrooms
          <select name="bedrooms" [(ngModel)]="bedrooms">
            <option [ngValue]="null">Any</option>
            <option [ngValue]="1">1+</option>
            <option [ngValue]="2">2+</option>
            <option [ngValue]="3">3+</option>
            <option [ngValue]="4">4+</option>
          </select>
        </label>

        <label>
          Sort by
          <select name="sortBy" [(ngModel)]="sortBy">
            <option value="newest">Newest listings</option>
            <option value="rent-asc">Rent: low to high</option>
            <option value="rent-desc">Rent: high to low</option>
          </select>
        </label>

        <label>
          Amenities
          <input
            name="amenities"
            [(ngModel)]="amenitiesText"
            placeholder="Wi-Fi, Parking"
          />
        </label>
      </div>

      <label class="checkbox-row">
        <input name="furnished" type="checkbox" [(ngModel)]="furnishedOnly" />
        Show furnished apartments only
      </label>

      @if (validationMessage) {
        <p class="validation" role="alert">{{ validationMessage }}</p>
      }

      <button class="apply-button" type="submit">Apply filters</button>
    </form>
  `,
  styles: `
    :host { display: block; }
    .filters { padding: 1.4rem; border: 1px solid #e2e8f0; border-radius: 1rem; background: white; }
    .filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.2rem; }
    .eyebrow { margin: 0 0 .25rem; color: #2563eb; font-size: .72rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    h2 { margin: 0; color: #172554; font-size: 1.2rem; }
    .filter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
    label { display: flex; flex-direction: column; gap: .4rem; color: #334155; font-size: .8rem; font-weight: 700; }
    input:not([type="checkbox"]), select { width: 100%; min-width: 0; padding: .7rem; border: 1px solid #cbd5e1; border-radius: .55rem; background: white; color: #0f172a; font: inherit; font-weight: 400; }
    input:focus, select:focus { outline: 2px solid #bfdbfe; border-color: #2563eb; }
    .checkbox-row { flex-direction: row; align-items: center; margin-top: 1rem; font-weight: 500; }
    .checkbox-row input { width: 1rem; height: 1rem; }
    .apply-button { margin-top: 1rem; padding: .75rem 1.1rem; border: 0; border-radius: .55rem; background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
    .reset-button { padding: .45rem .65rem; border: 1px solid #cbd5e1; border-radius: .5rem; background: white; color: #475569; cursor: pointer; }
    .validation { color: #b91c1c; font-size: .85rem; }
    @media (max-width: 760px) { .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 480px) { .filter-grid { grid-template-columns: 1fr; } }
  `,
})
export class ApartmentFiltersComponent {
  readonly filtersChanged = output<ApartmentFilters>();

  location = '';
  searchText = '';
  minRent: number | null = null;
  maxRent: number | null = null;
  bedrooms: number | null = null;
  furnishedOnly = false;
  amenitiesText = '';
  sortBy: ApartmentFilters['sortBy'] = 'newest';
  validationMessage = '';

  apply(): void {
    this.validationMessage = '';

    if (
      this.minRent != null &&
      this.maxRent != null &&
      this.minRent > this.maxRent
    ) {
      this.validationMessage =
        'Minimum rent cannot be greater than maximum rent.';
      return;
    }

    if (
      (this.minRent != null && this.minRent < 0) ||
      (this.maxRent != null && this.maxRent < 0)
    ) {
      this.validationMessage = 'Rent values cannot be negative.';
      return;
    }

    const amenities = this.amenitiesText
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    this.filtersChanged.emit({
      search: this.searchText.trim() || undefined,
      location: this.location.trim() || undefined,
      minRent: this.minRent ?? undefined,
      maxRent: this.maxRent ?? undefined,
      bedrooms: this.bedrooms ?? undefined,
      furnished: this.furnishedOnly ? true : undefined,
      amenities: amenities.length ? amenities : undefined,
      sortBy: this.sortBy,
      page: 1,
    });
  }

  reset(): void {
    this.location = '';
    this.searchText = '';
    this.minRent = null;
    this.maxRent = null;
    this.bedrooms = null;
    this.furnishedOnly = false;
    this.amenitiesText = '';
    this.sortBy = 'newest';
    this.validationMessage = '';

    this.filtersChanged.emit({
      search: undefined,
      location: undefined,
      minRent: undefined,
      maxRent: undefined,
      bedrooms: undefined,
      furnished: undefined,
      amenities: undefined,
      page: 1,
      pageSize: 9,
      sortBy: 'newest',
    });
  }
}
