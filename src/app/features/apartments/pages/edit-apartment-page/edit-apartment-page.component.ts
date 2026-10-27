import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApartmentFormComponent } from '../../components/apartment-form/apartment-form.component';
import { ApartmentService } from '../../services/apartment.service';
import { Apartment } from '../../models/apartment.model';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'app-edit-apartment-page', standalone: true,
  imports: [RouterLink, ApartmentFormComponent],
  template: `
    <main class="page"><a routerLink="/" class="back-link">← Back to listings</a>
      @if (loading()) { <p>Loading your listing…</p> }
      @else if (errorMessage()) { <p class="error">{{ errorMessage() }}</p> }
      @else if (apartment()) { <header><p class="eyebrow">MANAGE YOUR LISTING</p><h1>Edit apartment</h1></header><section class="card"><app-apartment-form [existingApartment]="apartment()" /><div class="danger-zone"><div><strong>Remove this listing</strong><p>Delete the apartment and its associated favourites, inquiries, and comments.</p></div><button type="button" (click)="deleteListing()" [disabled]="deleting()">{{ deleting() ? 'Deleting…' : 'Delete listing' }}</button></div></section> }
    </main>
  `,
  styles: [` .page { max-width: 900px; margin: auto; padding: 32px 20px 64px; } .back-link { color: #2563eb; text-decoration: none; font-weight: 600; } header { margin: 28px 0; } h1 { color: #172033; } .eyebrow { color: #2563eb; font-size: 12px; font-weight: 800; letter-spacing: 1.4px; } .card { padding: 28px; border: 1px solid #e2e8f0; border-radius: 18px; background: white; } .error { color: #b91c1c; } .danger-zone { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:30px; padding-top:22px; border-top:1px solid #fee2e2; } .danger-zone p { margin:5px 0 0; color:#64748b; font-size:13px; } .danger-zone button { padding:10px 14px; border:0; border-radius:8px; background:#dc2626; color:#fff; font-weight:700; cursor:pointer; } .danger-zone button:disabled { opacity:.6; } @media (max-width:560px) { .danger-zone { align-items:stretch; flex-direction:column; } } `],
})
export class EditApartmentPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly apartmentService = inject(ApartmentService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly apartment = signal<Apartment | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal('');
  readonly deleting = signal(false);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.errorMessage.set('No apartment ID was provided.'); this.loading.set(false); return; }
    try {
      const apartment = await this.apartmentService.getApartmentById(id);
      if (!apartment) this.errorMessage.set('This apartment was not found.');
      else if (apartment.owner_id !== this.auth.currentUser?.id && this.auth.currentUser?.role !== 'admin') this.errorMessage.set('Only the listing owner or an admin can manage this apartment.');
      else this.apartment.set(apartment);
    } catch { this.errorMessage.set('Unable to load this listing.'); }
    finally { this.loading.set(false); }
  }

  async deleteListing(): Promise<void> {
    const apartment = this.apartment();
    if (!apartment || this.deleting() || !confirm('Delete this listing permanently?')) return;
    this.deleting.set(true);
    try {
      await this.apartmentService.deleteApartment(apartment.id);
      await this.router.navigate(['/']);
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to delete this listing.');
      this.deleting.set(false);
    }
  }
}
