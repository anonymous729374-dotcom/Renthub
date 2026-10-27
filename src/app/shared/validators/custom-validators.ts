import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/** Required email validation that trims outer whitespace and rejects incomplete domains. */
export function emailAddressValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    if (!value) return { required: true };

    const angularEmailError = Validators.email({ value } as AbstractControl);
    if (angularEmailError) return { email: true };

    const at = value.lastIndexOf('@');
    if (at <= 0 || at !== value.indexOf('@')) return { email: true };
    const domain = value.slice(at + 1);
    const labels = domain.split('.');
    const validDomain = labels.length >= 2 && labels.every(label =>
      label.length > 0 && label.length <= 63 &&
      /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
    );
    return validDomain ? null : { email: true };
  };
}

export function trimmedRequired(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    typeof control.value === 'string' && control.value.trim().length > 0
      ? null
      : { trimmedRequired: true };
}

export function validUrlList(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();
    if (!value) return null;
    const invalid = value.split(/\r?\n/).some((url) => {
      try { return !['http:', 'https:'].includes(new URL(url.trim()).protocol); }
      catch { return true; }
    });
    return invalid ? { invalidUrlList: true } : null;
  };
}

export function minNumber(minimum: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    return value === null || value === '' || Number(value) >= minimum
      ? null
      : { minNumber: { minimum } };
  };
}

export function wholeNumber(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    return value === null || value === '' || Number.isInteger(Number(value))
      ? null
      : { wholeNumber: true };
  };
}

export function multipleOf(step: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === '') return null;
    const quotient = Number(value) / step;
    return Number.isFinite(quotient) && Math.abs(quotient - Math.round(quotient)) < 1e-8
      ? null
      : { multipleOf: { step } };
  };
}
