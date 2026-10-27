import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SUPABASE_CLIENT } from '../../../../core/config/supabase.client';
import { AdminProfileRecord, AuthService } from '../../../../core/auth/auth.service';
import { Apartment } from '../../../apartments/models/apartment.model';
import { PaginationComponent } from '../../../home/components/pagination/pagination.component';

@Component({
  selector: 'app-admin-management-page', standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, PaginationComponent],
  template: `
    <main class="page"><p class="eyebrow">PLATFORM MANAGEMENT</p><h1>Admin</h1><p class="intro">Manage user access, review lister applications, and moderate listings. You are in the shared RentHub application.</p>
      @if(error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if(success()) { <p class="success" role="status">{{ success() }}</p> }
      @if(loading()) { <p class="state">Loading platform records…</p> }
      @else {
        <section class="panel"><h2>Lister applications</h2>
          @if(pendingUsers().length === 0) { <p class="muted">No pending applications.</p> }
          @for(user of pendingUsers(); track user.id) { <article class="user-row"><div><strong>{{ user.full_name || 'Unnamed user' }}</strong><p>{{ user.email }} · Applied {{ user.created_at | date:'mediumDate' }}</p></div><div class="actions"><button type="button" (click)="review(user,true)" [disabled]="busyId() === user.id">Approve</button><button class="danger" type="button" (click)="review(user,false)" [disabled]="busyId() === user.id">Reject</button></div></article> }
          <app-pagination [page]="pendingPage()" [total]="pendingTotal()" [pageSize]="pageSize" (pageChanged)="setPage('pending',$event)" />
        </section>
        <section class="panel"><h2>Registered users</h2>
          @if(!users().length) { <p class="muted">No registered users found.</p> }
          @for(user of users(); track user.id) { <article class="user-row"><div><strong>{{ user.full_name || 'Unnamed user' }}</strong><p>{{ user.email }} · {{ user.role }}{{ user.role === 'user' ? ' · application: ' + user.lister_status : '' }}{{ user.is_suspended ? ' · SUSPENDED' : '' }}</p><small>ID: {{ user.id }}</small></div>@if(user.id !== auth.currentUser?.id) { <button [class.danger]="!user.is_suspended" type="button" (click)="setSuspended(user,!user.is_suspended)" [disabled]="busyId() === user.id">{{ user.is_suspended ? 'Reactivate' : 'Suspend' }}</button> }</article> }
        </section>
        <app-pagination [page]="usersPage()" [total]="usersTotal()" [pageSize]="pageSize" (pageChanged)="setPage('users',$event)" />
        <section class="panel"><h2>Apartment listings</h2>
          @if(!apartments().length) { <p class="muted">No listings found.</p> }
          @for(home of apartments(); track home.id) { <article class="listing-row"><div><strong>{{ home.title }}</strong><p>{{ home.city }} · {{ home.status }} · Owner {{ home.owner_id }}</p></div><div class="actions"><a [routerLink]="['/apartments',home.id]">View</a><a [routerLink]="['/apartments',home.id,'edit']">Edit</a><button class="danger" type="button" (click)="removeListing(home)" [disabled]="busyId() === home.id">Remove</button></div></article> }
        </section>
        <app-pagination [page]="apartmentsPage()" [total]="apartmentsTotal()" [pageSize]="pageSize" (pageChanged)="setPage('apartments',$event)" />
      }
    </main>
  `,
  styles: [`:host{display:block}.page{max-width:1120px;margin:auto;padding:36px 20px 70px}.eyebrow{color:#2563eb;font-size:12px;font-weight:800;letter-spacing:1.3px}h1{margin:5px 0;color:#172033;font-size:36px}.intro,.muted{color:#64748b;line-height:1.6}.panel{margin-top:24px;padding:22px;border:1px solid #e2e8f0;border-radius:15px;background:white}.panel h2{margin:0 0 14px;color:#172033}.user-row,.listing-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 0;border-top:1px solid #f1f5f9}.user-row p,.listing-row p{margin:5px 0;color:#64748b;font-size:14px}.user-row small{color:#94a3b8;font-size:11px;word-break:break-all}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.actions a{color:#1d4ed8;font-weight:700;text-decoration:none}button{padding:9px 12px;border:0;border-radius:8px;background:#2563eb;color:white;font-weight:700;cursor:pointer}button:disabled{opacity:.55}.danger{background:#b91c1c}.state{padding:40px;text-align:center;color:#64748b}.error{color:#b91c1c}.success{color:#15803d}@media(max-width:650px){.user-row,.listing-row{align-items:flex-start;flex-direction:column}.actions{width:100%}}`],
})
export class AdminManagementPageComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly supabase = inject(SUPABASE_CLIENT);
  readonly users = signal<AdminProfileRecord[]>([]);
  readonly apartments = signal<Apartment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly success = signal('');
  readonly busyId = signal('');
  readonly pendingUsers = signal<AdminProfileRecord[]>([]);
  readonly pageSize = 10;
  readonly pendingPage = signal(1); readonly pendingTotal = signal(0);
  readonly usersPage = signal(1); readonly usersTotal = signal(0);
  readonly apartmentsPage = signal(1); readonly apartmentsTotal = signal(0);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [users, pending, listingResult] = await Promise.all([
        this.auth.getAdminProfiles(this.usersPage(), this.pageSize),
        this.auth.getPendingAdminProfiles(this.pendingPage(), this.pageSize),
        this.supabase.from('apartments').select('*', { count: 'exact' }).order('updated_at', { ascending: false }).order('id', { ascending: true }).range((this.apartmentsPage() - 1) * this.pageSize, this.apartmentsPage() * this.pageSize - 1),
      ]);
      if (listingResult.error) throw listingResult.error;
      this.users.set(users.items); this.usersTotal.set(users.total);
      this.pendingUsers.set(pending.items); this.pendingTotal.set(pending.total);
      this.apartments.set((listingResult.data ?? []) as Apartment[]);
      this.apartmentsTotal.set(listingResult.count ?? 0);
      let corrected = false;
      if (!users.items.length && this.usersPage() > 1) { this.usersPage.update(value => value - 1); corrected = true; }
      if (!pending.items.length && this.pendingPage() > 1) { this.pendingPage.update(value => value - 1); corrected = true; }
      if (!listingResult.data?.length && this.apartmentsPage() > 1) { this.apartmentsPage.update(value => value - 1); corrected = true; }
      if (corrected) { await this.load(); return; }
    } catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'Unable to load admin records. Confirm admin authorization and database migrations.'); }
    finally { this.loading.set(false); }
  }

  setPage(section: 'pending' | 'users' | 'apartments', page: number): void {
    if (section === 'pending') this.pendingPage.set(page);
    else if (section === 'users') this.usersPage.set(page);
    else this.apartmentsPage.set(page);
    void this.load();
  }

  async review(user: AdminProfileRecord, approve: boolean): Promise<void> {
    this.busyId.set(user.id); this.error.set(''); this.success.set('');
    try { await this.auth.adminReviewLister(user.id, approve); this.success.set(approve ? `Approved ${user.email} as a lister.` : `Rejected ${user.email}'s lister application.`); await this.load(); }
    catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'Unable to review this application.'); }
    finally { this.busyId.set(''); }
  }

  async setSuspended(user: AdminProfileRecord, suspended: boolean): Promise<void> {
    this.busyId.set(user.id); this.error.set(''); this.success.set('');
    try { await this.auth.adminSetSuspended(user.id, suspended); this.success.set(`${user.email} was ${suspended ? 'suspended' : 'reactivated'}.`); await this.load(); }
    catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'Unable to update account access.'); }
    finally { this.busyId.set(''); }
  }

  async removeListing(home: Apartment): Promise<void> {
    if (!globalThis.confirm(`Permanently remove “${home.title}”? Its inquiries, favourites, and comments will also be deleted.`)) return;
    this.busyId.set(home.id); this.error.set(''); this.success.set('');
    try {
      const { error } = await this.supabase.from('apartments').delete().eq('id', home.id);
      if (error) throw error;
      this.success.set(`Removed “${home.title}”.`);
      await this.load();
    } catch (error: unknown) { this.error.set(error instanceof Error ? error.message : 'Unable to remove this listing.'); }
    finally { this.busyId.set(''); }
  }
}
