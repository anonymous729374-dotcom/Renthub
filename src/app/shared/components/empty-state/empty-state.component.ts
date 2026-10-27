import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-empty-state', standalone: true,
  template: `<section class="empty"><div class="icon" aria-hidden="true">⌂</div><h2>{{ title() }}</h2><p>{{ message() }}</p>@if (actionLabel()) { <button type="button" (click)="action.emit()">{{ actionLabel() }}</button> }</section>`,
  styles: [`:host { display:block; } .empty { display:flex; min-height:200px; flex-direction:column; align-items:center; justify-content:center; padding:28px; border:1px dashed #cbd5e1; border-radius:16px; background:#f8fafc; text-align:center; } .icon { color:#2563eb; font-size:42px; } h2 { margin:8px 0 4px; color:#172033; } p { max-width:440px; color:#64748b; } button { padding:10px 15px; border:0; border-radius:8px; background:#2563eb; color:white; font-weight:700; cursor:pointer; }`],
})
export class EmptyStateComponent {
  readonly title = input('Nothing here yet');
  readonly message = input('There is nothing to show right now.');
  readonly actionLabel = input('');
  readonly action = output<void>();
}
