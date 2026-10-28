import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { ApartmentCardListing } from '../../../apartments/models/apartment.model';
import { FavouriteService } from '../../../favourites/services/favourite.service';

@Component({
  selector: 'app-apartment-card',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, RouterLink],
  template: `
    <article class="card">
      <div class="image-wrapper">
        <a class="image-link" [routerLink]="['/apartments', apartment().id]">
          @if (apartment().photos.length > 0) {
            <img
              class="photo"
              [src]="apartment().photos[0]"
              [alt]="apartment().title"
              loading="lazy"
              (error)="handlePhotoError($event)"
            />
          } @else {
            <div class="photo-placeholder">
              <span>🏠</span>
              <span>Apartment photo coming soon</span>
            </div>
          }
        </a>

        @if (apartment().is_furnished) {
          <span class="furnished-badge">Furnished</span>
        }

        <button
          type="button"
          class="favourite-button"
          [class.active]="isFavourite()"
          [disabled]="favouriteLoading()"
          [attr.aria-label]="
            isFavourite() ? 'Remove from favourites' : 'Add to favourites'
          "
          [attr.aria-pressed]="isFavourite()"
          (click)="toggleFavourite($event)"
        >
          @if (favouriteLoading()) {
            <span class="heart-loading">…</span>
          } @else {
            {{ isFavourite() ? '♥' : '♡' }}
          }
        </button>
      </div>

      @if (favouriteError()) {
        <p class="favourite-error" role="alert">{{ favouriteError() }}</p>
      }

      <div class="content">
        <div class="location">
          {{ apartment().city }}@if (apartment().state) {
            , {{ apartment().state }}
          }
        </div>

        <a class="title-link" [routerLink]="['/apartments', apartment().id]">
          <h3>{{ apartment().title }}</h3>
        </a>

        <p class="address">{{ apartment().address }}</p>

        <div class="facts">
          <span>{{ apartment().bedrooms }} bed</span>
          <span>{{ apartment().bathrooms }} bath</span>
          @if (apartment().area_sqft) {
            <span>{{ apartment().area_sqft }} sq ft</span>
          }
        </div>

        @if (apartment().amenities.length > 0) {
          <div class="amenities">
            @for (amenity of apartment().amenities.slice(0, 3); track amenity) {
              <span class="amenity">{{ amenity }}</span>
            }
          </div>
        }

        <div class="card-footer">
          <p class="price">
            {{ apartment().monthly_rent | currency:'INR':'symbol':'1.0-0' }}
            <span>/ month</span>
          </p>

          <a class="details-link" [routerLink]="['/apartments', apartment().id]">
            View details →
          </a>
        </div>
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .card {
      height: 100%;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: 1rem;
      background: #fff;
      transition: transform .2s ease, box-shadow .2s ease;
    }

    .card:hover {
      transform: translateY(-3px);
      box-shadow: 0 14px 30px #0f172a12;
    }

    .image-wrapper {
      position: relative;
    }

    .image-wrapper.image-failed::after { content: '⌂  Photo unavailable'; position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; background: linear-gradient(135deg, #eff6ff, #e2e8f0); color: #64748b; font-size: 14px; }

    .image-link {
      display: block;
      position: relative;
      text-decoration: none;
    }

    .photo,
    .photo-placeholder {
      width: 100%;
      height: 210px;
    }

    .photo {
      display: block;
      object-fit: cover;
      background: #f1f5f9;
    }

    .photo-placeholder {
      display: flex;
      flex-direction: column;
      gap: .5rem;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #eff6ff, #e2e8f0);
      color: #64748b;
      font-size: .85rem;
    }

    .photo-placeholder span:first-child {
      font-size: 2rem;
    }

    .furnished-badge {
      position: absolute;
      top: .75rem;
      left: .75rem;
      padding: .35rem .6rem;
      border-radius: 2rem;
      background: #fff;
      color: #1d4ed8;
      font-size: .75rem;
      font-weight: 700;
      pointer-events: none;
    }

    .favourite-button {
      position: absolute;
      top: .65rem;
      right: .65rem;
      z-index: 2;
      display: grid;
      width: 40px;
      height: 40px;
      place-items: center;
      border: 1px solid #e2e8f0;
      border-radius: 50%;
      background: white;
      color: #64748b;
      font-size: 25px;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 2px 8px #0f172a1f;
      transition: color .2s ease, transform .2s ease;
    }

    .favourite-button:hover:not(:disabled) {
      color: #e11d48;
      transform: scale(1.08);
    }

    .favourite-button.active {
      color: #e11d48;
    }

    .favourite-button:disabled {
      opacity: .65;
      cursor: wait;
    }

    .heart-loading {
      font-size: 18px;
    }

    .favourite-error {
      margin: 0;
      padding: .5rem .75rem;
      background: #fef2f2;
      color: #b91c1c;
      font-size: .75rem;
      overflow-wrap: anywhere;
    }

    .content {
      display: flex;
      flex-direction: column;
      padding: 1.1rem;
    }

    .location {
      color: #2563eb;
      font-size: .8rem;
      font-weight: 700;
    }

    .title-link {
      color: inherit;
      text-decoration: none;
    }

    h3 {
      margin: .45rem 0;
      color: #172554;
      font-size: 1.15rem;
      line-height: 1.4;
    }

    .address {
      margin: 0;
      overflow: hidden;
      color: #64748b;
      font-size: .85rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: .8rem;
      margin-top: 1rem;
      color: #475569;
      font-size: .8rem;
    }

    .amenities {
      display: flex;
      flex-wrap: wrap;
      gap: .4rem;
      margin-top: .8rem;
    }

    .amenity {
      padding: .25rem .5rem;
      border-radius: .35rem;
      background: #f1f5f9;
      color: #475569;
      font-size: .7rem;
    }

    .card-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      margin-top: 1.1rem;
      padding-top: .85rem;
      border-top: 1px solid #f1f5f9;
    }

    .price {
      margin: 0;
      color: #172554;
      font-size: 1.1rem;
      font-weight: 800;
    }

    .price span {
      color: #64748b;
      font-size: .75rem;
      font-weight: 400;
    }

    .details-link {
      color: #2563eb;
      font-size: .8rem;
      font-weight: 700;
      text-decoration: none;
    }

    .details-link:hover {
      text-decoration: underline;
    }
  `,
})
export class ApartmentCardComponent implements OnInit {
  readonly apartment = input.required<ApartmentCardListing>();

  private readonly favouriteService = inject(FavouriteService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  readonly favouriteChanged = output<boolean>();

  readonly isFavourite = signal(false);
  readonly favouriteLoading = signal(false);
  readonly favouriteError = signal('');

  ngOnInit(): void {
    this.favouriteService.changes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ apartmentId, isFavourite }) => {
        if (apartmentId === this.apartment().id) this.isFavourite.set(isFavourite);
      });
    void this.loadFavouriteStatus();
  }

  private async loadFavouriteStatus(): Promise<void> {
    try {
      const ids = await this.favouriteService.getFavouriteIds();
      this.isFavourite.set(ids.includes(this.apartment().id));
    } catch (error: unknown) {
      console.error('Unable to load favourite status:', error);
    }
  }

  handlePhotoError(event: Event): void {
    const image = event.target as HTMLImageElement;
    image.parentElement?.parentElement?.classList.add('image-failed');
    image.alt = 'Apartment photo unavailable';
  }

  
async toggleFavourite(event: Event): Promise<void> {
  event.preventDefault();
  event.stopPropagation();

  if (this.favouriteLoading()) {
    return;
  }

  this.favouriteError.set('');
  this.favouriteLoading.set(true);

  try {
    const saved = await this.favouriteService.toggleFavourite(
      this.apartment().id,
    );

    this.isFavourite.set(saved);
    this.favouriteChanged.emit(saved);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.toLowerCase().includes('sign in')) {
      await this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    console.error('Unable to update favourite:', error);

    this.favouriteError.set(
      error instanceof Error
        ? error.message
        : 'Unable to update favourite. Please try again.',
    );
  } finally {
    this.favouriteLoading.set(false);
  }
}
}
