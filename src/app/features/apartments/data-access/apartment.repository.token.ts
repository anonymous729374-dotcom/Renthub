
import { InjectionToken } from '@angular/core';
import { ApartmentRepository } from './apartment.repository';

export const APARTMENT_REPOSITORY =
  new InjectionToken<ApartmentRepository>('APARTMENT_REPOSITORY');
