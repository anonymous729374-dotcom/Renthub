import { CommonModule, CurrencyPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApartmentService } from '../../services/apartment.service';
import { CreateApartmentInput } from '../../models/apartment.model';

@Component({
  selector: 'app-preview-apartment-page', standalone: true,
  imports: [CommonModule, CurrencyPipe, RouterLink],
  template: `
    <main class="page"><a routerLink="/apartments/new" class="back-link">← Back to edit</a>
      @if (!preview()) { <section class="empty"><h1>No preview available</h1><p>Return to the listing form to enter your property details.</p><a routerLink="/apartments/new">Create a listing</a></section> }
      @else { <header><p class="eyebrow">FINAL REVIEW</p><h1>Preview your listing</h1><p>Review the details before publishing.</p></header>
        <section class="preview-card"><div class="hero"><h2>{{ preview()!.title }}</h2><strong>{{ preview()!.monthly_rent | currency:'INR':'symbol':'1.0-0' }} / month</strong><p>{{ preview()!.address }}, {{ preview()!.city }}{{ preview()!.state ? ', ' + preview()!.state : '' }}</p></div>
          <div class="facts"><span>{{ preview()!.bedrooms }} bedrooms</span><span>{{ preview()!.bathrooms }} bathrooms</span><span>{{ preview()!.area_sqft ? preview()!.area_sqft + ' sq. ft.' : 'Area not specified' }}</span><span>{{ preview()!.is_furnished ? 'Furnished' : 'Unfurnished' }}</span></div><p class="description">{{ preview()!.description }}</p><h3>Food preference</h3><p>{{ preferenceLabel(preview()!.vegetarian_preference) }}</p><h3>Amenities</h3><p>{{ preview()!.amenities.length ? preview()!.amenities.join(', ') : 'None specified' }}</p><h3>Listing status</h3><p>{{ statusLabel(preview()!.status) }}</p><h3>Photos</h3><div class="photos">@for (photo of preview()!.photos; track photo) { <img [src]="photo" [alt]="preview()!.title" /> } @if (!preview()!.photos.length) { <p>No photos added.</p> }</div>
          @if (errorMessage()) { <p class="error">{{ errorMessage() }}</p> }<div class="actions"><a routerLink="/apartments/new" class="secondary">Edit details</a><button type="button" (click)="submit()" [disabled]="submitting()">{{ submitting() ? 'Submitting…' : confirmLabel(preview()!.status) }}</button></div>
        </section>
      }
    </main>
  `,
  styles: [` .page { max-width: 900px; margin: auto; padding: 32px 20px 64px; } .back-link { color: #2563eb; text-decoration: none; font-weight: 600; } header { margin: 28px 0; } .eyebrow { color: #2563eb; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; } h1, h2 { color: #172033; } .preview-card { display: grid; gap: 18px; padding: 28px; border: 1px solid #e2e8f0; border-radius: 18px; background: white; } .hero { padding: 22px; border-radius: 14px; background: #eff6ff; } .hero strong { color: #1d4ed8; font-size: 20px; } .facts { display: flex; flex-wrap: wrap; gap: 10px; } .facts span { padding: 8px 10px; border-radius: 8px; background: #f1f5f9; } .description { white-space: pre-line; line-height: 1.7; } .photos { display: flex; flex-wrap: wrap; gap: 10px; } .photos img { width: 150px; height: 110px; object-fit: cover; border-radius: 8px; } .actions { display: flex; justify-content: flex-end; gap: 10px; } button, .secondary { padding: 12px 16px; border: 0; border-radius: 9px; text-decoration: none; font: inherit; font-weight: 700; cursor: pointer; } button { color: white; background: #2563eb; } .secondary { color: #334155; background: #f1f5f9; } button:disabled { opacity: .6; } .error { color: #b91c1c; } .empty { padding: 48px 20px; text-align: center; } `],
})
export class PreviewApartmentPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly apartmentService = inject(ApartmentService);
  readonly preview = signal<CreateApartmentInput | null>(null);
  readonly submitting = signal(false);
  readonly errorMessage = signal('');

  preferenceLabel(value: CreateApartmentInput['vegetarian_preference']): string {
    switch (value) {
      case 'vegetarian': return 'Vegetarian preferred';
      case 'non-vegetarian': return 'Non-vegetarian allowed';
      default: return 'No preference';
    }
  }

  statusLabel(value: CreateApartmentInput['status']): string {
    return value === 'published' ? 'Available to rent' : value === 'draft' ? 'Draft' : 'Already rented';
  }

  confirmLabel(value: CreateApartmentInput['status']): string {
    return value === 'published' ? 'Confirm and publish' : value === 'draft' ? 'Confirm and save draft' : 'Confirm as rented';
  }

  ngOnInit(): void {
    if (typeof sessionStorage === 'undefined') return;
    const raw = sessionStorage.getItem('renthub-apartment-preview');
    if (raw) { try { this.preview.set(JSON.parse(raw) as CreateApartmentInput); } catch { sessionStorage.removeItem('renthub-apartment-preview'); } }
  }

  async submit(): Promise<void> {
    const input = this.preview();
    if (!input || this.submitting()) return;
    this.submitting.set(true); this.errorMessage.set('');
    try { const created = await this.apartmentService.createApartment(input); sessionStorage.removeItem('renthub-apartment-preview'); await this.router.navigate(['/apartments', created.id]); }
    catch (error: unknown) { this.errorMessage.set(error instanceof Error ? error.message : 'Unable to publish this listing.'); }
    finally { this.submitting.set(false); }
  }
}
