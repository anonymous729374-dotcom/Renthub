
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Apartment } from '../../../apartments/models/apartment.model';
import { ApartmentService } from '../../../apartments/services/apartment.service';
import { FavouriteService } from '../../services/favourite.service';
import { ApartmentCardComponent } from '../../../home/components/apartment-card/apartment-card.component';
import { PaginationComponent } from '../../../home/components/pagination/pagination.component';

@Component({
  selector: 'app-favourites-page',
  standalone: true,
  imports: [RouterLink, ApartmentCardComponent, PaginationComponent],
  template: `
    <main class="page">
      <a routerLink="/" class="back-link">← Browse apartments</a>

      <header>
        <p class="eyebrow">YOUR SAVED HOMES</p>
        <h1>Favourite apartments</h1>
        <p class="subtitle">The places you want to keep in mind.</p>
      </header>

      @if (loading()) {
        <p class="message">Loading your favourites...</p>
      } @else if (errorMessage()) {
        <section class="message error">
          <p>{{ errorMessage() }}</p>
          <button type="button" (click)="loadFavourites()">Try again</button>
        </section>
      } @else if (apartments().length === 0) {
        <section class="empty">
          <div class="empty-icon">♡</div>
          <h2>No favourites yet</h2>
          <p>Save apartments you like and they'll appear here.</p>
          <a routerLink="/" class="primary-button">Explore apartments</a>
        </section>
      } @else {
        <p class="count">{{ total() }} saved apartment(s)</p>
        <div class="grid">
          @for (apartment of apartments(); track apartment.id) {
          <app-apartment-card [apartment]="apartment" (favouriteChanged)="onFavouriteChanged(apartment.id, $event)" />
          }
        </div>
        <app-pagination [page]="page()" [total]="total()" [pageSize]="pageSize" (pageChanged)="changePage($event)" />
      }
    </main>
  `,
  styles: [`
    .page { max-width: 1200px; margin: auto; padding: 32px 20px 64px; }
    .back-link { color: #2563eb; text-decoration: none; font-weight: 600; }
    header { margin: 32px 0; }
    .eyebrow { color: #2563eb; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; }
    h1 { margin: 8px 0; color: #172033; font-size: 34px; font-weight: 800; }
    .subtitle, .count, .message { color: #64748b; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
    .empty, .message { padding: 48px 20px; text-align: center; }
    .empty { border: 1px dashed #cbd5e1; border-radius: 16px; background: #f8fafc; }
    .empty-icon { color: #2563eb; font-size: 52px; }
    .empty h2 { color: #172033; }
    .primary-button, button { display: inline-block; margin-top: 12px; padding: 11px 16px; border: 0; border-radius: 9px; background: #2563eb; color: white; font-weight: 700; text-decoration: none; cursor: pointer; }
    .error { color: #dc2626; }
    @media (max-width: 850px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class FavouritesPageComponent implements OnInit {
  private readonly favouriteService = inject(FavouriteService);
  private readonly apartmentService = inject(ApartmentService);

  readonly apartments = signal<Apartment[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 10;

  ngOnInit(): void {
    void this.loadFavourites();
  }

  async loadFavourites(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const result = await this.favouriteService.getFavouriteIdsPage(this.page(), this.pageSize);
      const ids = result.ids;
      this.total.set(result.total);

      if (ids.length === 0) {
        this.apartments.set([]);
        return;
      }

      const results = await this.apartmentService.getApartmentsByIds(ids);
      if (!results.length && this.page() > 1) { this.page.update(value => value - 1); await this.loadFavourites(); return; }
      const order = new Map(ids.map((id, index) => [id, index]));
      this.apartments.set(results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    } catch (error: unknown) {
      console.error('Failed to load favourites:', error);
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Unable to load favourites.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  onFavouriteChanged(apartmentId: string, isFavourite: boolean): void {
    if (!isFavourite) {
      this.apartments.update(items => items.filter(item => item.id !== apartmentId));
      this.total.update(value => Math.max(0, value - 1));
      if (!this.apartments().length && this.page() > 1) { this.page.update(value => value - 1); void this.loadFavourites(); }
    }
  }

  changePage(page: number): void { this.page.set(page); void this.loadFavourites(); }
}
