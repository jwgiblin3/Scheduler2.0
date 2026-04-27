import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/services/admin-api.service';
import {
  AuditAction, AuditLogPage, AuditLogQuery, AuditLogRow
} from '../../../core/models/admin-models';

/**
 * Read-only audit-log browser. SuperAdmin only. Filters by action, entity
 * type, user, practice, and date range. Pagination is offset-based — fine
 * for the audit volumes we expect; will move to keyset on (Timestamp, Id)
 * when the table gets very large (parking lot #15 territory).
 */
@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss']
})
export class AuditLogComponent implements OnInit {
  private api = inject(AdminApiService);

  page = signal<AuditLogPage | null>(null);
  loading = signal(false);
  error = signal('');

  // Filters bound to ngModel inputs
  filterAction: AuditAction | '' = '';
  filterEntityType = '';
  filterUserId: number | null = null;
  filterPracticeId: number | null = null;
  filterFrom = '';
  filterTo = '';

  pageNum = 1;
  pageSize = 50;

  actionOptions = [
    { value: AuditAction.Read,         label: 'Read' },
    { value: AuditAction.Create,       label: 'Create' },
    { value: AuditAction.Update,       label: 'Update' },
    { value: AuditAction.Delete,       label: 'Delete' },
    { value: AuditAction.Print,        label: 'Print' },
    { value: AuditAction.Export,       label: 'Export' },
    { value: AuditAction.Login,        label: 'Login' },
    { value: AuditAction.FailedLogin,  label: 'Failed login' },
    { value: AuditAction.Submit,       label: 'Submit' },
    { value: AuditAction.Void,         label: 'Void' }
  ];

  ngOnInit() { this.load(); }

  load(resetPage = false) {
    if (resetPage) this.pageNum = 1;
    this.loading.set(true);
    this.error.set('');

    const q: AuditLogQuery = {
      action: this.filterAction === '' ? undefined : this.filterAction,
      entityType: this.filterEntityType.trim() || undefined,
      userId: this.filterUserId ?? undefined,
      practiceId: this.filterPracticeId ?? undefined,
      from: this.filterFrom ? new Date(this.filterFrom).toISOString() : undefined,
      to:   this.filterTo   ? new Date(this.filterTo).toISOString()   : undefined,
      page: this.pageNum,
      pageSize: this.pageSize
    };

    this.api.listAuditLog(q).subscribe({
      next: p => { this.page.set(p); this.loading.set(false); },
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Failed to load audit log.');
        this.loading.set(false);
      }
    });
  }

  clearFilters() {
    this.filterAction = '';
    this.filterEntityType = '';
    this.filterUserId = null;
    this.filterPracticeId = null;
    this.filterFrom = '';
    this.filterTo = '';
    this.load(true);
  }

  formatTime(s: string): string {
    return new Date(s).toLocaleString();
  }

  actionLabel(a: AuditAction): string {
    return this.actionOptions.find(o => o.value === a)?.label ?? `#${a}`;
  }

  /** Tailwind-ish class for the action chip's color. */
  actionClass(a: AuditAction): string {
    switch (a) {
      case AuditAction.Login:        return 'a-login';
      case AuditAction.FailedLogin:  return 'a-fail';
      case AuditAction.Create:       return 'a-create';
      case AuditAction.Update:       return 'a-update';
      case AuditAction.Delete:
      case AuditAction.Void:         return 'a-delete';
      case AuditAction.Submit:       return 'a-submit';
      default:                       return 'a-read';
    }
  }

  totalPages(): number {
    const p = this.page();
    if (!p) return 1;
    return Math.max(1, Math.ceil(p.total / p.pageSize));
  }

  goToPage(n: number) {
    const max = this.totalPages();
    if (n < 1 || n > max) return;
    this.pageNum = n;
    this.load();
  }
}
