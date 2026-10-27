import { CommonModule } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { CommentService } from '../../services/comment.service';
import { Comment } from '../../models/comment.model';
import { PaginationComponent } from '../../../home/components/pagination/pagination.component';

@Component({
  selector: 'app-comment-section',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PaginationComponent],
  template: `
    <section class="comments">
      <p *ngIf="loading()" class="muted">Loading comments...</p>

      <p *ngIf="errorMessage()" class="error">
        {{ errorMessage() }}
      </p>

      <form *ngIf="auth.user$ | async as user" (ngSubmit)="addComment()" class="comment-form">
        <label for="commentText">Add a comment or question</label>
        <textarea
          id="commentText"
          name="commentText"
          [(ngModel)]="newComment"
          required
          minlength="2"
          maxlength="2000"
          rows="2"
          placeholder="Ask a question about this apartment..."
        ></textarea>
        <button type="submit" [disabled]="submitting() || newComment.trim().length < 2">
          {{ submitting() ? 'Posting...' : 'Post comment' }}
        </button>
      </form>

      <p *ngIf="!(auth.user$ | async)" class="muted">
        <a [routerLink]="['/login']" [queryParams]="{ returnUrl: '/apartments/' + apartmentId() }"
          >Sign in</a
        >
        to leave a comment.
      </p>

      <div *ngIf="!loading() && comments().length === 0" class="empty">
        No comments yet. Start the conversation!
      </div>

      <article *ngFor="let comment of comments()" class="comment">
        <div class="comment-heading">
          <strong>{{ authorLabel(comment.user_id) }}</strong>
          <time>{{ comment.created_at | date: 'medium' }}</time>
        </div>

        <p class="comment-text">{{ comment.comment_text }}</p>
        @if (auth.currentUser?.id === comment.user_id) {
          <div class="owner-actions">
            <button type="button" (click)="startEdit(comment)" [disabled]="submitting()">
              Edit</button
            ><button type="button" (click)="deleteComment(comment)" [disabled]="submitting()">
              Delete
            </button>
          </div>
        }
        @if (editingId() === comment.id) {
          <form class="edit-form" (ngSubmit)="saveEdit(comment)">
            <label [for]="'edit-' + comment.id">Edit your comment</label
            ><textarea
              [id]="'edit-' + comment.id"
              [name]="'edit-' + comment.id"
              [(ngModel)]="editText"
              required
              minlength="2"
              maxlength="2000"
            ></textarea
            ><button type="submit" [disabled]="submitting() || editText.trim().length < 2">
              Save</button
            ><button type="button" (click)="editingId.set('')">Cancel</button>
          </form>
        }

        <form *ngIf="auth.user$ | async" (ngSubmit)="replyTo(comment.id)" class="reply-form">
          <input
            [name]="'reply-' + comment.id"
            [(ngModel)]="replies[comment.id]"
            placeholder="Write a reply..."
            maxlength="2000"
          />
          <button
            type="submit"
            [disabled]="submitting() || (replies[comment.id] || '').trim().length < 2"
          >
            Reply
          </button>
        </form>

        <div *ngFor="let reply of comment.replies || []" class="reply">
          <strong>{{ authorLabel(reply.user_id) }}</strong>
          <p>{{ reply.comment_text }}</p>
          <time>{{ reply.created_at | date: 'medium' }}</time>
        </div>
      </article>
      <app-pagination [page]="page()" [total]="total()" [pageSize]="pageSize" (pageChanged)="changePage($event)" />
    </section>
  `,
  styles: [
    `
      .comments {
        display: grid;
        gap: 12px;
        min-width: 0;
      }
      .muted {
        color: #64748b;
        font-size: 14px;
      }
      .error {
        color: #dc2626;
        font-size: 14px;
      }
      .empty {
        padding: 14px;
        text-align: center;
        color: #64748b;
        background: #f8fafc;
        border-radius: 9px;
        font-size: 13px;
      }
      .comment-form,
      .reply-form {
        display: grid;
        gap: 8px;
      }
      label {
        font-size: 13px;
        font-weight: 650;
      }
      textarea,
      input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 9px 10px;
        font: inherit;
        font-size: 13px;
      }
      button {
        justify-self: start;
        padding: 8px 12px;
        border: 0;
        border-radius: 8px;
        background: #2563eb;
        color: white;
        font-size: 13px;
        font-weight: 650;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .comment {
        min-width: 0;
        padding: 12px 0;
        border-bottom: 1px solid #e2e8f0;
      }
      .comment-heading {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px;
      }
      time {
        color: #94a3b8;
        font-size: 12px;
      }
      .comment-text {
        margin: 8px 0;
        color: #475569;
        font-size: 13px;
        line-height: 1.5;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .reply-form {
        grid-template-columns: minmax(0, 1fr) auto;
        margin: 10px 0;
      }
      .reply {
        margin: 10px 0 0 14px;
        padding: 10px;
        background: #f8fafc;
        border-radius: 8px;
        font-size: 13px;
      }
      .reply p {
        margin: 5px 0;
        color: #475569;
        overflow-wrap: anywhere;
      }
      .owner-actions,
      .edit-form {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      .edit-form {
        display: grid;
      }
      @media (max-width: 420px) {
        .reply-form {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class CommentSectionComponent {
  readonly apartmentId = input.required<string>();

  readonly auth = inject(AuthService);
  private readonly commentService = inject(CommentService);

  readonly comments = signal<Comment[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  readonly editingId = signal('');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly pageSize = 10;
  editText = '';

  newComment = '';
  replies: Record<string, string> = {};
  private loadRequestId = 0;

  constructor() {
    effect(() => {
      const apartmentId = this.apartmentId();
      this.newComment = '';
      this.replies = {};
      this.page.set(1);
      void this.loadComments(apartmentId);
    });
  }

  authorLabel(userId: string): string {
    return userId === this.auth.currentUser?.id ? 'You' : 'RentHub member';
  }

  private async loadComments(apartmentId = this.apartmentId()): Promise<void> {
    const requestId = ++this.loadRequestId;
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const result = await this.commentService.getCommentsPage(apartmentId, this.page(), this.pageSize);
      if (requestId !== this.loadRequestId) return;
      this.total.set(result.total);
      const lastPage = Math.max(1, Math.ceil(result.total / this.pageSize));
      if (this.page() > lastPage) { this.page.set(lastPage); await this.loadComments(apartmentId); return; }
      this.comments.set(result.items);
    } catch (error: unknown) {
      if (requestId !== this.loadRequestId) return;
      console.error('Failed to load comments:', error);
      this.errorMessage.set('Unable to load comments right now.');
    } finally {
      if (requestId === this.loadRequestId) this.loading.set(false);
    }
  }

  async addComment(): Promise<void> {
    const text = this.newComment.trim();
    if (text.length < 2 || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set('');

    try {
      await this.commentService.addComment(this.apartmentId(), text);
      this.newComment = '';
      this.page.set(Math.max(1, Math.ceil((this.total() + 1) / this.pageSize)));
      await this.loadComments();
    } catch (error: unknown) {
      console.error('Failed to post comment:', error);
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to post comment.');
    } finally {
      this.submitting.set(false);
    }
  }

  async replyTo(parentCommentId: string): Promise<void> {
    const text = (this.replies[parentCommentId] || '').trim();
    if (text.length < 2 || this.submitting()) return;

    this.submitting.set(true);
    this.errorMessage.set('');

    try {
      await this.commentService.addComment(this.apartmentId(), text, parentCommentId);

      this.replies[parentCommentId] = '';
      await this.loadComments();
    } catch (error: unknown) {
      console.error('Failed to post reply:', error);
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to post reply.');
    } finally {
      this.submitting.set(false);
    }
  }

  startEdit(comment: Comment): void {
    this.editingId.set(comment.id);
    this.editText = comment.comment_text;
  }

  async saveEdit(comment: Comment): Promise<void> {
    if (this.editingId() !== comment.id || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    try {
      await this.commentService.updateComment(comment.id, this.editText);
      this.editingId.set('');
      await this.loadComments();
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to update comment.');
    } finally {
      this.submitting.set(false);
    }
  }

  async deleteComment(comment: Comment): Promise<void> {
    if (this.submitting() || !globalThis.confirm('Delete this comment and its replies?')) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    try {
      await this.commentService.deleteComment(comment.id);
      await this.loadComments();
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Unable to delete comment.');
    } finally {
      this.submitting.set(false);
    }
  }

  changePage(page: number): void { this.page.set(page); void this.loadComments(); }
}
