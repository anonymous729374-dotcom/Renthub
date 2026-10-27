import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  template: `
    @if (totalPages() > 1) {
      <nav class="pagination" aria-label="Pages">
        <button
          type="button"
          [disabled]="page() <= 1"
          (click)="changePage(page() - 1)"
        >
          ← Previous
        </button>

        @for (number of visiblePages(); track number) {
          <button type="button" class="page-number" [class.active]="number === page()"
            [attr.aria-current]="number === page() ? 'page' : null"
            [attr.aria-label]="'Page ' + number" (click)="changePage(number)">{{ number }}</button>
        }

        <span>
          Page <strong>{{ page() }}</strong> of {{ totalPages() }}
        </span>
        <span class="count">{{ total() }} records</span>

        <button
          type="button"
          [disabled]="page() >= totalPages()"
          (click)="changePage(page() + 1)"
        >
          Next →
        </button>
      </nav>
    }
  `,
  styles: `
    :host { display: block; }
    .pagination { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: .4rem; margin: .9rem 0; color: #475569; font-size: .82rem; }
    button { padding: .48rem .65rem; border: 1px solid #cbd5e1; border-radius: .5rem; background: white; color: #1e293b; cursor: pointer; }
    .page-number.active { border-color:#2563eb; background:#2563eb; color:#fff; font-weight:700; }
    .count { color:#64748b; padding:0 .25rem; }
    button:disabled { opacity: .4; cursor: not-allowed; }
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly total = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly pageChanged = output<number>();

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  readonly visiblePages = computed(() => {
    const maxVisible = 5;
    const start = Math.max(1, Math.min(this.page() - 2, this.totalPages() - maxVisible + 1));
    const end = Math.min(this.totalPages(), start + maxVisible - 1);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  changePage(nextPage: number): void {
    if (nextPage < 1 || nextPage > this.totalPages()) return;
    this.pageChanged.emit(nextPage);
  }
}
