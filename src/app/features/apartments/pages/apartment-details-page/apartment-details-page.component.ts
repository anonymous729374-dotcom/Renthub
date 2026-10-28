import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApartmentService } from '../../services/apartment.service';
import { Apartment } from '../../models/apartment.model';
import { CommentSectionComponent } from '../../../comments/components/comment-section/comment-section.component';
import { FavouriteService } from '../../../favourites/services/favourite.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { Router } from '@angular/router';
import { ApartmentPeopleService } from '../../services/apartment-people.service';

@Component({
  selector: 'app-apartment-details-page',
  standalone: true,
  imports: [CommonModule, RouterLink, CommentSectionComponent],
  template: `
    <main class="details-page">
      <a routerLink="/" class="back-link">← Back to listings</a>

      <div *ngIf="loading()" class="state-message">
        <div class="spinner"></div>
        <p>Loading apartment details...</p>
      </div>

      <section *ngIf="!loading() && errorMessage()" class="state-message">
        <h2>Unable to load apartment</h2>
        <p>{{ errorMessage() }}</p>
        <button type="button" class="primary-button" (click)="retryLoad()">Try again</button>
        <a routerLink="/" class="primary-button">Browse listings</a>
      </section>

      <ng-container *ngIf="!loading() && apartment() as property">
        <section class="property-header">
          <div>
            <span class="eyebrow">APARTMENT DETAILS</span>
            <h1>{{ property.title }}</h1>
            <p class="location">
              📍 {{ property.address }}, {{ property.city
              }}<span *ngIf="property.state">, {{ property.state }}</span>
            </p>
            <div class="lister-byline" aria-live="polite">
              <span class="lister-avatar" aria-hidden="true">{{ listerInitial() }}</span>
              <span class="lister-copy">
                <span class="lister-label">Listed by</span>
                <strong>{{ listerNameLoading() ? 'Loading lister…' : listerName() }}</strong>
              </span>
            </div>
            @if (property.status !== 'published') {
              <span class="listing-status">{{
                property.status === 'draft' ? 'Draft listing' : 'Already rented'
              }}</span>
            }
          </div>

          <div class="header-actions">
            @if (!auth.currentUser || auth.currentUser.isSuspended === false) {
              <button
                type="button"
                class="secondary-button"
                (click)="toggleFavourite()"
                [disabled]="favouriteLoading()"
              >
                {{ favouriteLoading() ? 'Saving…' : isFavourite() ? '♥ Saved' : '♡ Save home' }}
              </button>
            }
            @if (auth.user$ | async; as user) {
              @if (
                user.isSuspended === false &&
                (user.role === 'admin' ||
                  (user.id === property.owner_id &&
                    user.role === 'lister' &&
                    user.listerStatus === 'approved'))
              ) {
                <a [routerLink]="['/apartments', property.id, 'edit']" class="secondary-button">{{
                  user.role === 'admin' && user.id !== property.owner_id
                    ? 'Moderate listing'
                    : 'Edit listing'
                }}</a>
              }
            }
          </div>
          @if (actionError()) {
            <p class="action-error" role="alert">{{ actionError() }}</p>
          }
        </section>

        <div class="details-layout">
          <div class="main-column">
            <section
              class="photo-gallery"
              [class.single-photo]="property.photos?.length === 1"
              [class.multi-photo]="(property.photos?.length || 0) > 1"
            >
              <ng-container *ngIf="property.photos?.length; else noPhotos">
                <img
                  *ngFor="let photo of property.photos; let i = index"
                  [src]="photo"
                  [alt]="property.title + ' photo ' + (i + 1)"
                  [class.main-photo]="i === 0"
                  (error)="hideBrokenImage($event)"
                />
              </ng-container>
              <ng-template #noPhotos
                ><div class="photo-placeholder">
                  <span>⌂</span>
                  <p>No property photos available</p>
                </div></ng-template
              >
            </section>

            <section class="info-card">
              <h2>Property overview</h2>

              <div class="specifications">
                <div class="spec">
                  <span>Bedrooms</span>
                  <strong>{{ property.bedrooms }}</strong>
                </div>
                <div class="spec">
                  <span>Bathrooms</span>
                  <strong>{{ property.bathrooms }}</strong>
                </div>
                <div class="spec">
                  <span>Area</span>
                  <strong>{{
                    property.area_sqft ? property.area_sqft + ' sq. ft.' : 'Not specified'
                  }}</strong>
                </div>
                <div class="spec">
                  <span>Furnishing</span>
                  <strong>{{ property.is_furnished ? 'Furnished' : 'Unfurnished' }}</strong>
                </div>
              </div>

              <div class="description-block">
                <h3>Description</h3>
                <p class="description">{{ property.description }}</p>
              </div>
            </section>

            <section class="info-card">
              <h2>Amenities</h2>

              <div *ngIf="property.amenities?.length; else noAmenities" class="amenities">
                <span *ngFor="let amenity of property.amenities" class="amenity">
                  ✓ {{ amenity }}
                </span>
              </div>

              <ng-template #noAmenities>
                <p class="muted">No amenities have been specified.</p>
              </ng-template>
            </section>

            <section class="info-card">
              <h2>Rental preferences</h2>
              <p>
                <strong>Food preference:</strong>
                {{ foodPreferenceLabel(property.vegetarian_preference) }}
              </p>
              <p *ngIf="property.postal_code">
                <strong>Postal code:</strong> {{ property.postal_code }}
              </p>
            </section>

            @if (property.status === 'published') {
              <section class="info-card comments-card">
                <h2>Comments and questions</h2>
                <app-comment-section [apartmentId]="property.id" />
              </section>
            } @else {
              <section class="info-card">
                <h2>Comments closed</h2>
                <p class="muted">Comments are available while a home is open for rent.</p>
              </section>
            }
          </div>

          <aside class="sidebar">
            <section class="info-card rent-card">
              <span class="rent-label">Monthly rent</span>
              <strong>{{ property.monthly_rent | currency: 'INR' : 'symbol' : '1.0-0' }}</strong>
              <small>per month</small>
              @if (
                property.status === 'published' &&
                auth.currentUser?.id !== property.owner_id &&
                (!auth.currentUser || auth.currentUser.isSuspended === false)
              ) {
                <a
                  class="primary-button contact-link"
                  [routerLink]="['/messages']"
                  [queryParams]="{ apartmentId: property.id }"
                  >Message Lister</a
                >
              } @else if (
                property.status === 'published' && auth.currentUser?.id === property.owner_id
              ) {
                <p class="muted contact-note">This is your listing.</p>
              } @else if (
                property.status === 'published' &&
                (!auth.currentUser || auth.currentUser.isSuspended === false)
              ) {
                <p class="muted contact-note">
                  Contact the listing owner about availability and rental terms.
                </p>
              } @else {
                <p class="muted contact-note">
                  This listing is currently unavailable for new inquiries.
                </p>
              }
            </section>

            <section class="info-card">
              <h2>Location</h2>
              <p>{{ property.address }}</p>
              <p>
                {{ property.city }}<span *ngIf="property.state">, {{ property.state }}</span>
              </p>
              <p *ngIf="property.postal_code">{{ property.postal_code }}</p>
            </section>
          </aside>
        </div>
      </ng-container>
    </main>
  `,
})
export class ApartmentDetailsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly apartmentService = inject(ApartmentService);
  private readonly apartmentPeople = inject(ApartmentPeopleService);
  private readonly favouriteService = inject(FavouriteService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly apartment = signal<Apartment | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly isFavourite = signal(false);
  readonly favouriteLoading = signal(false);
  readonly actionError = signal('');
  readonly listerName = signal('Lister details unavailable');
  readonly listerNameLoading = signal(false);
  private loadRequestId = 0;
  private currentApartmentId: string | null = null;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => void this.loadApartment(params.get('id')));
  }

  private async loadApartment(id: string | null): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.currentApartmentId = id;
    this.apartment.set(null);
    this.errorMessage.set('');
    this.actionError.set('');
    this.isFavourite.set(false);
    this.favouriteLoading.set(false);
    this.listerName.set('Lister details unavailable');
    this.listerNameLoading.set(false);
    this.loading.set(true);

    if (!id) {
      this.errorMessage.set('No apartment ID was provided.');
      this.loading.set(false);
      return;
    }

    try {
      const result = await this.apartmentService.getApartmentById(id);
      if (requestId !== this.loadRequestId) return;

      if (!result) {
        this.errorMessage.set('This apartment was not found or is no longer available.');
        return;
      }

      this.apartment.set(result);
      // The listing is the primary content. Do not keep the whole page behind
      // its loading state while unrelated name/favourite requests are pending.
      this.loading.set(false);
      void this.loadListerName(result.id, result.owner_id, requestId);
      void this.loadFavouriteStatus(result.id, requestId);
    } catch (error: unknown) {
      if (requestId !== this.loadRequestId) return;
      console.error('Failed to load apartment details:', error);
      this.errorMessage.set(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred while loading this apartment.',
      );
    } finally {
      if (requestId === this.loadRequestId) this.loading.set(false);
    }
  }

  retryLoad(): void {
    if (this.currentApartmentId) void this.loadApartment(this.currentApartmentId);
  }

  private async loadFavouriteStatus(apartmentId: string, requestId: number): Promise<void> {
    this.favouriteLoading.set(true);
    try {
      const isFavourite = await this.favouriteService.isFavourite(apartmentId);
      if (requestId !== this.loadRequestId) return;
      this.isFavourite.set(isFavourite);
    } catch (error: unknown) {
      if (requestId !== this.loadRequestId) return;
      console.error('Failed to load apartment favourite status:', error);
      this.actionError.set(
        error instanceof Error ? error.message : 'Unable to load saved status.',
      );
    } finally {
      if (requestId === this.loadRequestId) this.favouriteLoading.set(false);
    }
  }

  private async loadListerName(apartmentId: string, ownerId: string, requestId: number): Promise<void> {
    this.listerNameLoading.set(true);
    try {
      const people = await this.apartmentPeople.getDisplayNames(apartmentId);
      if (requestId !== this.loadRequestId) return;
      // The apartment's owner_id is the authoritative identity here. Matching
      // the extra is_lister flag made the UI depend on that optional RPC field
      // being present and true, even when the owner row and name were returned.
      const lister = people.find(person => person.user_id === ownerId);
      this.listerName.set(lister?.display_name?.trim() || 'Lister');
    } catch (error: unknown) {
      console.error('Failed to load the apartment lister display name:', error);
      if (requestId === this.loadRequestId) this.listerName.set('Lister details unavailable');
    } finally {
      if (requestId === this.loadRequestId) this.listerNameLoading.set(false);
    }
  }

  listerInitial(): string {
    const name = this.listerNameLoading() ? '' : this.listerName();
    return name === 'Lister details unavailable' ? 'R' : (name.trim().charAt(0).toUpperCase() || 'R');
  }

  foodPreferenceLabel(value: Apartment['vegetarian_preference']): string {
    switch (value) {
      case 'vegetarian':
        return 'Vegetarian preferred';
      case 'non-vegetarian':
        return 'Non-vegetarian allowed';
      default:
        return 'No preference';
    }
  }

  hideBrokenImage(event: Event): void {
    const image = event.target as HTMLImageElement;
    image.style.display = 'none';
    const gallery = image.parentElement;
    if (gallery && gallery.querySelectorAll('img:not([style*="display: none"])').length === 0) {
      gallery.classList.add('image-failed');
    }
  }

  async toggleFavourite(): Promise<void> {
    const apartment = this.apartment();
    if (!apartment || this.favouriteLoading()) return;
    this.favouriteLoading.set(true);
    this.actionError.set('');
    try {
      this.isFavourite.set(await this.favouriteService.toggleFavourite(apartment.id));
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('sign in')) {
        await this.router.navigate(['/login'], {
          queryParams: { returnUrl: `/apartments/${apartment.id}` },
        });
      } else {
        this.actionError.set(
          error instanceof Error ? error.message : 'Unable to update favourite.',
        );
      }
    } finally {
      this.favouriteLoading.set(false);
    }
  }
}
