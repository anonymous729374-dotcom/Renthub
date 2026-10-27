
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApartmentFormComponent } from '../../components/apartment-form/apartment-form.component';
import { CreateApartmentInput } from '../../models/apartment.model';
import { Router } from '@angular/router';

@Component({
  selector: 'app-create-apartment-page',
  standalone: true,
  imports: [RouterLink, ApartmentFormComponent],
  template: `
    <main class="create-page">
      <a routerLink="/" class="back-link">← Back to listings</a>

      <header class="page-header">
        <p class="eyebrow">RENT YOUR PROPERTY</p>
        <h1>List your apartment</h1>
        <p>Share your property details to help renters find their next home.</p>
      </header>

      <section class="form-card">
        <app-apartment-form (previewRequested)="openPreview($event)" />
      </section>
    </main>
  `,
  styles: [`
    .create-page {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }

    .back-link {
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
    }

    .page-header {
      margin: 28px 0;
    }

    .eyebrow {
      color: #2563eb;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.5px;
    }

    h1 {
      margin: 8px 0;
      font-size: 32px;
      font-weight: 800;
      color: #172033;
    }

    .page-header > p:last-child {
      color: #64748b;
      line-height: 1.6;
    }

    .form-card {
      padding: 28px;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      background: white;
      box-shadow: 0 8px 30px rgb(15 23 42 / 5%);
    }

    @media (max-width: 600px) {
      .form-card {
        padding: 16px;
      }

      h1 {
        font-size: 26px;
      }
    }
  `],
})
export class CreateApartmentPageComponent {
  private readonly router = inject(Router);

  openPreview(input: CreateApartmentInput): void {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('renthub-apartment-preview', JSON.stringify(input));
    }
    void this.router.navigate(['/apartments/preview']);
  }
}
