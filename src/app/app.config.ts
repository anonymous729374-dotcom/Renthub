import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { routes } from './app.routes';
import { APARTMENT_REPOSITORY } from './features/apartments/data-access/apartment.repository.token';
import { SupabaseApartmentRepository } from './features/apartments/data-access/supabase-apartment.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideClientHydration(withEventReplay()),
    { provide: APARTMENT_REPOSITORY, useClass: SupabaseApartmentRepository },
  ],
};
