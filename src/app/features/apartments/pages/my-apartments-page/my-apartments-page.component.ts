import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Apartment } from '../../models/apartment.model';
import { ApartmentService } from '../../services/apartment.service';
import { PaginationComponent } from '../../../home/components/pagination/pagination.component';

@Component({
  selector: 'app-my-apartments-page',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, DatePipe, RouterLink, PaginationComponent],
  template: `
    <main class="page">
      <a routerLink="/" class="back-link">← Browse apartments</a>
      <header><div><p class="eyebrow">LANDLORD DASHBOARD</p><h1>My listings</h1><p>Manage your published homes, drafts, and rental status.</p></div><a class="primary" routerLink="/apartments/new">＋ List a home</a></header>
      @if (loading()) { <p class="message" role="status">Loading your listings…</p> }
      @else if (errorMessage()) { <section class="message error" role="alert"><p>{{ errorMessage() }}</p><button type="button" (click)="load()">Try again</button></section> }
      @else if (!apartments().length) { <section class="empty"><div aria-hidden="true">⌂</div><h2>No listings yet</h2><p>Your properties will appear here after you create your first listing.</p><a class="primary" routerLink="/apartments/new">Create a listing</a></section> }
      @else { <section class="list" aria-label="Your apartment listings">@for (apartment of apartments(); track apartment.id) { <article class="listing"><a class="photo-link" [routerLink]="['/apartments', apartment.id]">@if (apartment.photos.length) { <img [src]="apartment.photos[0]" [alt]="apartment.title" /> } @else { <span>⌂</span> }</a><div class="info"><div class="title-row"><h2><a [routerLink]="['/apartments', apartment.id]">{{ apartment.title }}</a></h2><span class="status" [class]="apartment.status">{{ statusLabel(apartment.status) }}</span></div><p>{{ apartment.city }}{{ apartment.state ? ', ' + apartment.state : '' }} · {{ apartment.monthly_rent | currency:'INR':'symbol':'1.0-0' }} / month</p><small>Updated {{ apartment.updated_at | date:'mediumDate' }}</small></div><a class="edit" [routerLink]="['/apartments', apartment.id, 'edit']">Manage</a></article> }</section><app-pagination [page]="page()" [total]="total()" [pageSize]="pageSize" (pageChanged)="changePage($event)" /> }
    </main>
  `,
  styles: [`
    .page { max-width:1100px; margin:auto; padding:32px 20px 64px; }
    .back-link { color:#2563eb; text-decoration:none; font-weight:650; }
    header { display:flex; align-items:end; justify-content:space-between; gap:20px; margin:30px 0; }
    .eyebrow { color:#2563eb; font-size:12px; font-weight:800; letter-spacing:1.3px; }
    h1 { margin:6px 0; color:#172033; font-size:clamp(28px,4vw,38px); } header p:last-child { margin:0; color:#64748b; }
    .primary,.edit,button { display:inline-flex; align-items:center; justify-content:center; padding:10px 14px; border:0; border-radius:9px; background:#2563eb; color:#fff; font:inherit; font-size:14px; font-weight:700; text-decoration:none; cursor:pointer; }
    .list { display:grid; gap:14px; } .listing { display:grid; grid-template-columns:150px minmax(0,1fr) auto; align-items:center; gap:18px; padding:14px; border:1px solid #e2e8f0; border-radius:14px; background:#fff; }
    .photo-link { display:grid; width:150px; height:110px; place-items:center; overflow:hidden; border-radius:9px; background:#eff6ff; color:#2563eb; font-size:36px; text-decoration:none; }
    .photo-link img { width:100%; height:100%; object-fit:cover; } .title-row { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
    h2 { margin:0; font-size:18px; } h2 a { color:#172033; text-decoration:none; } .info p { margin:8px 0; color:#475569; } .info small { color:#94a3b8; }
    .status { padding:4px 9px; border-radius:999px; background:#dcfce7; color:#166534; font-size:11px; font-weight:800; text-transform:capitalize; } .status.draft { background:#fef3c7; color:#92400e; } .status.rented { background:#e2e8f0; color:#475569; }
    .edit { background:#eff6ff; color:#1d4ed8; } .message,.empty { padding:48px 20px; text-align:center; color:#64748b; } .error { color:#b91c1c; } .empty { border:1px dashed #cbd5e1; border-radius:16px; background:#f8fafc; } .empty div { color:#2563eb; font-size:48px; }
    @media (max-width:650px) { header { align-items:flex-start; flex-direction:column; } .listing { grid-template-columns:90px minmax(0,1fr); gap:12px; } .photo-link { width:90px; height:90px; } .edit { grid-column:2; justify-self:start; } }
  `],
})
export class MyApartmentsPageComponent implements OnInit {
  private readonly apartmentService = inject(ApartmentService);
  readonly apartments = signal<Apartment[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 10;

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      const result = await this.apartmentService.getMyApartmentsPage(this.page(), this.pageSize);
      if (!result.items.length && this.page() > 1) { this.page.update(value => value - 1); await this.load(); return; }
      this.apartments.set(result.items); this.total.set(result.total);
    }
    catch (error: unknown) { this.errorMessage.set(error instanceof Error ? error.message : 'Unable to load your listings.'); }
    finally { this.loading.set(false); }
  }

  statusLabel(status: Apartment['status']): string { return status; }
  changePage(page: number): void { this.page.set(page); void this.load(); }
}
