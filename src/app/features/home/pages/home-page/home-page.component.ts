
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
        <div class="hero-orbit orbit-one"></div>
        <div class="hero-orbit orbit-two"></div>
        <div class="skyline building-back"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="skyline building-front"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <div class="hero-home"><span>⌂</span></div>
        <div class="hero-note"><span class="note-dot"></span> A place that feels like yours</div>
        <span class="spark spark-one">✦</span>
        <span class="spark spark-two">✧</span>
      </div>
    </section>

    <div class="page-content">
      <app-apartment-filters
        (filtersChanged)="onFiltersChanged($event)"
      />

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
  `,
  styles: `
    :host { display: block; }
    .hero {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1.12fr) minmax(320px, .88fr);
      align-items: center;
      gap: clamp(2rem, 5vw, 5rem);
      min-height: 470px;
      overflow: hidden;
      padding: 58px max(24px, calc((100% - 1600px) / 2));
      color: #fff;
      background:
        radial-gradient(ellipse at 80% 8%, #487cff9c 0, transparent 36%),
        radial-gradient(ellipse at 10% 100%, #4835c67d 0, transparent 42%),
        linear-gradient(118deg, #101b48 0%, #172b68 48%, #1746a0 100%);
    }
    .hero-content { position: relative; z-index: 2; max-width: 800px; }
    .eyebrow { display: inline-flex; align-items: center; gap: .55rem; margin: 0 0 1.15rem; padding: .55rem .85rem; border: 1px solid #ffffff32; border-radius: 999px; background: #ffffff12; color: #a9d8ff; font-size: .72rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; backdrop-filter: blur(10px); }
    .eyebrow::before { width: 7px; height: 7px; border-radius: 50%; background: #62e6d2; box-shadow: 0 0 12px #62e6d2; content: ''; }
    h1 { max-width: 800px; margin: 0; color: #fff; font-size: clamp(2.7rem, 5.3vw, 5.1rem); line-height: 1.02; letter-spacing: -.06em; text-wrap: balance; }
    h1 span { color: #8dd8ff; }
    .hero-description { max-width: 560px; margin: 1.35rem 0 0; color: #d2defb; font-size: clamp(1rem, 1.35vw, 1.15rem); line-height: 1.75; }
    .hero-decoration { position: relative; justify-self: end; width: min(100%, 500px); height: 335px; isolation: isolate; }
    .hero-decoration::before { position: absolute; inset: 10% 5% 3% 8%; z-index: -2; border: 1px solid #ffffff26; border-radius: 46% 54% 34% 66% / 52% 40% 60% 48%; background: linear-gradient(145deg, #ffffff18, #ffffff04); content: ''; transform: rotate(-7deg); }
    .hero-decoration::after { position: absolute; top: 1%; right: 5%; z-index: -3; width: 260px; height: 260px; border-radius: 50%; background: #39b9ff37; filter: blur(4px); content: ''; }
    .hero-orbit { position: absolute; border: 1px solid #a4ccff50; border-radius: 50%; transform: rotate(-24deg); }
    .orbit-one { inset: 8% -5% 10% 2%; }
    .orbit-two { inset: 16% 3% 4% 10%; border-style: dashed; opacity: .55; transform: rotate(28deg); }
    .skyline { position: absolute; bottom: 12%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; padding: 16px 13px; border: 1px solid #c4e7ff55; border-radius: 15px 15px 5px 5px; }
    .skyline i { width: 9px; height: 12px; border-radius: 2px; background: #a8e7ffb8; box-shadow: 0 0 9px #70c9ff65; }
    .building-back { left: 7%; width: 104px; height: 145px; background: linear-gradient(160deg, #a2c7ff38, #6a8dff18); transform: skewY(-5deg); }
    .building-front { right: 4%; width: 116px; height: 190px; background: linear-gradient(160deg, #70d8ff55, #6a8dff25); transform: skewY(5deg); }
    .hero-home { position: absolute; top: 11%; left: 50%; display: grid; width: 190px; height: 190px; place-items: center; border: 1px solid #c4e7ff70; border-radius: 42px; background: linear-gradient(145deg, #ffffffed, #eaf5ffdb); box-shadow: 0 24px 75px #050f3c65, inset 0 1px #fff; transform: translateX(-50%) rotate(-7deg); animation: hero-float 6s ease-in-out infinite; }
    .hero-home::before { position: absolute; inset: 10px; border: 1px solid #b9d7ff80; border-radius: 34px; content: ''; }
    .hero-home span { color: #3268e9; font-size: 8rem; line-height: 1; transform: rotate(7deg) translateY(-5px); text-shadow: 0 9px 26px #397cff35; }
    .hero-note { position: absolute; right: 4%; bottom: 7%; display: flex; align-items: center; gap: .6rem; padding: .75rem 1rem; border: 1px solid #ffffff38; border-radius: 13px; background: #10245ad9; box-shadow: 0 16px 35px #06143e55; color: #eef6ff; font-size: .82rem; font-weight: 650; backdrop-filter: blur(12px); transform: rotate(2deg); }
    .note-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: #69e5cf; box-shadow: 0 0 12px #69e5cf; }
    .spark { position: absolute; color: #a2edff; text-shadow: 0 0 20px #68cfff; }
    .spark-one { top: 8%; left: 20%; font-size: 1.6rem; }
    .spark-two { right: 8%; top: 38%; font-size: 2rem; }
    @keyframes hero-float { 0%, 100% { transform: translateX(-50%) rotate(-7deg) translateY(0); } 50% { transform: translateX(-50%) rotate(-4deg) translateY(-9px); } }
    .page-content { width: min(1200px, calc(100% - 2.5rem)); margin: 2rem auto 4rem; }
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
    @media (max-width: 900px) { .apartment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hero { grid-template-columns: minmax(0, 1fr) minmax(250px, .7fr); gap: 1rem; min-height: 420px; } .hero-decoration { height: 280px; } .hero-home { width: 155px; height: 155px; } .hero-home span { font-size: 6.5rem; } .building-front { height: 150px; } .building-back { height: 120px; } }
    @media (max-width: 640px) { .apartment-grid { grid-template-columns: 1fr; } .hero { grid-template-columns: 1fr; gap: 1rem; min-height: 0; padding: 58px 24px 24px; } .hero-content { max-width: 560px; } h1 { font-size: clamp(2.7rem, 12vw, 4.2rem); } .hero-description { margin-top: 1rem; } .hero-decoration { justify-self: center; width: min(100%, 390px); height: 245px; } .hero-home { width: 135px; height: 135px; } .hero-home span { font-size: 5.5rem; } .hero-note { right: 0; bottom: 2%; font-size: .72rem; } .skyline { bottom: 8%; } .page-content { width: calc(100% - 1.5rem); } .listings-heading { align-items: flex-start; flex-direction: column; } }
    @media (prefers-reduced-motion: reduce) { .hero-home { animation: none; } }
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

  async loadApartments(): Promise<void> {
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
    if (requestId === this.loadRequestId) this.loading.set(false);
  }
}

  onFiltersChanged(filters: ApartmentFilters): void {
    this.filters = {
      ...this.filters,
      ...filters,
      page: 1,
    };

    void this.loadApartments();
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
}
