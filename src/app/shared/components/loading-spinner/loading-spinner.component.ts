import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-spinner', standalone: true,
  template: `<div class="loading" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>{{ label() }}</span></div>`,
  styles: [`:host { display:block; } .loading { display:flex; align-items:center; justify-content:center; gap:10px; min-height:120px; color:#64748b; } .spinner { width:25px; height:25px; border:3px solid #dbeafe; border-top-color:#2563eb; border-radius:50%; animation:spin .8s linear infinite; } @keyframes spin { to { transform:rotate(360deg); } }`],
})
export class LoadingSpinnerComponent {
  readonly label = input('Loading…');
}
