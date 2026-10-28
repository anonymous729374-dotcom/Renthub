
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  ApartmentCardListing,
  ApartmentFilters,
} from '../../../apartments/models/apartment.model';
import { ApartmentService } from '../../../apartments/services/apartment.service';
import { ApartmentCardComponent } from '../../components/apartment-card/apartment-card.component';
import { ApartmentFiltersComponent } from '../../components/apartment-filters/apartment-filters.component';
import { PaginationComponent } from '../../components/pagination/pagination.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    ApartmentCardComponent,
    ApartmentFiltersComponent,
    PaginationComponent,
  ],
  template: `
    <section class="hero">
      <div class="hero-content">
        <p class="eyebrow">Find a place to call home</p>
        <h1>Your next home is <span>closer than you think.</span></h1>
        <p class="hero-description">
          Explore rental apartments, compare prices, and find a place
          that fits your lifestyle.
        </p>
      </div>
      <div class="hero-decoration" aria-hidden="true">
        <span>⌂</span>
      </div>
    </section>

    <div class="page-content">
      <app-apartment-filters
        (filtersChanged)="onFiltersChanged($event)"
      />

      <div id="apartment-results" class="results-anchor">
      @if (errorMessage()) {
  <section class="feedback error-state" role="alert">
    <h2>We couldn't load the apartments</h2>
    <p>{{ errorMessage() }}</p>
    <button type="button" (click)="loadApartments()">Try again</button>
  </section>
} @else if (loading()) {
  <section class="feedback" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    <p>Finding homes for you…</p>
  </section>
} @else {
<section class="listings-section">
  <div class="listings-heading">
    <div>
      <p class="eyebrow">Explore available homes</p>
      <h2>Apartment listings</h2>
    </div>

    <span class="result-count">
      {{ total() }} {{ total() === 1 ? 'apartment' : 'apartments' }}
    </span>
  </div>

  @if (apartments().length > 0) {
    <div class="apartment-grid">
      @for (apartment of apartments(); track apartment.id) {
        <app-apartment-card [apartment]="apartment" />
      }
    </div>

    <app-pagination
      [page]="filters.page ?? 1"
      [pageSize]="filters.pageSize ?? 9"
      [total]="total()"
      (pageChanged)="onPageChanged($event)"
    />
  } @else {
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">⌂</span>
      <h3>No apartments found</h3>
      <p>
        Try changing your search criteria, or check back when
        more homes are listed.
      </p>
      <button type="button" (click)="resetFilters()">
        Clear filters
      </button>
    </div>
  }
</section>

      }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .hero {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2rem;
      overflow: hidden;
      padding: clamp(3.5rem, 8vw, 6.5rem) clamp(1.25rem, 8vw, 8rem);
      background: linear-gradient(120deg, #eff6ff, #f8fafc 60%, #dbeafe);
    }
    .hero-content { position: relative; z-index: 1; max-width: 780px; }
    .eyebrow { margin: 0 0 .5rem; color: #2563eb; font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; color: #172554; font-size: clamp(2.5rem, 5.5vw, 4.5rem); line-height: 1.08; letter-spacing: -.055em; }
    h1 span { color: #2563eb; }
    .hero-description { max-width: 570px; margin: 1.25rem 0 0; color: #475569; font-size: 1.05rem; line-height: 1.8; }
    .hero-decoration { display: grid; flex-shrink: 0; width: 170px; height: 170px; place-items: center; border: 1px solid #bfdbfe; border-radius: 2.5rem; background: #ffffff80; transform: rotate(8deg); }
    .hero-decoration span { color: #2563eb; font-size: 7rem; line-height: 1; }
    .page-content { width: min(1200px, calc(100% - 2.5rem)); margin: 2rem auto 4rem; }
    .results-anchor { scroll-margin-top: 1rem; }
    app-apartment-filters { display: block; margin-bottom: 1.5rem; }
    .listings-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
    .listings-heading h2 { margin: 0; color: #172554; font-size: 1.7rem; }
    .result-count { padding: .45rem .7rem; border-radius: 2rem; background: #eff6ff; color: #1d4ed8; font-size: .8rem; font-weight: 700; }
    .apartment-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.25rem; }
    .feedback { display: flex; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; gap: .75rem; color: #64748b; text-align: center; }
    .feedback h2 { margin: 0; color: #172554; }
    .feedback p { margin: 0; }
    .error-state button, .empty-state button { padding: .7rem 1rem; border: 0; border-radius: .55rem; background: #2563eb; color: white; font-weight: 700; cursor: pointer; }
    .spinner { width: 32px; height: 32px; border: 3px solid #dbeafe; border-top-color: #2563eb; border-radius: 50%; animation: spin .8s linear infinite; }
    .empty-state { display: flex; min-height: 260px; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; border: 1px dashed #cbd5e1; border-radius: 1rem; background: #f8fafc; text-align: center; }
    .empty-icon { color: #2563eb; font-size: 3rem; }
    .empty-state h3 { margin: .75rem 0 .3rem; color: #172554; font-size: 1.3rem; }
    .empty-state p { max-width: 460px; color: #64748b; line-height: 1.7; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 900px) { .apartment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hero-decoration { width: 120px; height: 120px; } .hero-decoration span { font-size: 5rem; } }
    @media (max-width: 600px) { .apartment-grid { grid-template-columns: 1fr; } .hero-decoration { display: none; } .page-content { width: calc(100% - 1.5rem); } .listings-heading { align-items: flex-start; flex-direction: column; } }
  `,
})
export class HomePageComponent implements OnInit {
  private readonly apartmentService = inject(ApartmentService);
  private loadRequestId = 0;

apartments = signal<ApartmentCardListing[]>([]);
total = signal(0);
loading = signal(false);
errorMessage = signal('');

  filters: ApartmentFilters = {
    page: 1,
    pageSize: 9,
    sortBy: 'newest',
  };

  ngOnInit(): void {
    void this.loadApartments();
  }

  async loadApartments(scrollAfterLoad = false): Promise<void> {
  const requestId = ++this.loadRequestId;
  this.loading.set(true);
  this.errorMessage.set('');

  try {
    const result = await this.apartmentService.getApartments(this.filters);

    if (requestId !== this.loadRequestId) return;

    this.apartments.set(result.items);
    this.total.set(result.total);
  } catch (error: unknown) {
    if (requestId !== this.loadRequestId) return;
    console.error('Failed to load apartments:', error);

    this.apartments.set([]);
    this.total.set(0);

    this.errorMessage.set(
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while loading apartments.'
    );
  } finally {
    if (requestId === this.loadRequestId) {
      this.loading.set(false);
      if (scrollAfterLoad) this.scrollToResults();
    }
  }
}

  onFiltersChanged(filters: ApartmentFilters): void {
    this.filters = {
      ...this.filters,
      ...filters,
      page: 1,
    };

    void this.loadApartments(true);
  }

  onPageChanged(page: number): void {
    this.filters = {
      ...this.filters,
      page,
    };

    void this.loadApartments();
  }

  resetFilters(): void {
    this.filters = {
      page: 1,
      pageSize: 9,
      sortBy: 'newest',
    };

    void this.loadApartments();
  }

  private scrollToResults(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    window.requestAnimationFrame(() => {
      document.getElementById('apartment-results')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
    });
  }
}
