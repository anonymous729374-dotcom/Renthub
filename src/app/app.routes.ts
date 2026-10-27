import { Routes } from '@angular/router';
import { adminGuard, authGuard, listerGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/pages/home-page/home-page.component').then(
        (m) => m.HomePageComponent,
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/login-page/login-page.component').then(
        (m) => m.LoginPageComponent,
      ),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./features/auth/pages/signup-page/signup-page.component').then(
        (m) => m.SignupPageComponent,
      ),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/pages/profile-page/profile-page.component').then(
        (m) => m.ProfilePageComponent,
      ),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/pages/admin-management-page/admin-management-page.component').then(
        (m) => m.AdminManagementPageComponent,
      ),
  },
  {
    path: 'apartments/new',
    canActivate: [listerGuard],
    loadComponent: () =>
      import('./features/apartments/pages/create-apartment-page/create-apartment-page.component').then(
        (m) => m.CreateApartmentPageComponent,
      ),
  },
  {
    path: 'my-apartments',
    canActivate: [listerGuard],
    loadComponent: () =>
      import('./features/apartments/pages/my-apartments-page/my-apartments-page.component').then(
        (m) => m.MyApartmentsPageComponent,
      ),
  },
  {
    path: 'apartments/preview',
    canActivate: [listerGuard],
    loadComponent: () =>
      import('./features/apartments/pages/preview-apartment-page/preview-apartment-page.component').then(
        (m) => m.PreviewApartmentPageComponent,
      ),
  },
  {
    path: 'apartments/:id/edit',
    canActivate: [listerGuard],
    loadComponent: () =>
      import('./features/apartments/pages/edit-apartment-page/edit-apartment-page.component').then(
        (m) => m.EditApartmentPageComponent,
      ),
  },
  {
    path: 'apartments/:id',
    loadComponent: () =>
      import('./features/apartments/pages/apartment-details-page/apartment-details-page.component').then(
        (m) => m.ApartmentDetailsPageComponent,
      ),
  },
  {
    path: 'favourites',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/favourites/pages/favourites-page/favourites-page.component').then(
        (m) => m.FavouritesPageComponent,
      ),
  },
  {
    path: 'messages',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/inquiries/pages/messages-page/messages-page.component').then(
        (m) => m.MessagesPageComponent,
      ),
  },
  {
    path: 'inquiries',
    redirectTo: 'messages',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
