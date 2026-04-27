import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { PracticeAdminSummary } from '../../../core/models/admin-models';

/**
 * Cross-tenant practices browser. Read-only — see PracticesController for
 * why mutation is intentionally not exposed here. Each row carries
 * computed counts that help SuperAdmin gauge tenant activity at a glance.
 */
@Component({
  selector: 'app-admin-practices-list',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  templateUrl: './practices-list.component.html',
  styleUrls: ['./practices-list.component.scss']
})
export class PracticesListComponent implements OnInit {
  private api = inject(AdminApiService);

  rows = signal<PracticeAdminSummary[]>([]);
  loading = signal(false);
  error = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.listPractices().subscribe({
      next: rows => { this.rows.set(rows); this.loading.set(false); },
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Failed to load practices.');
        this.loading.set(false);
      }
    });
  }

  formatDate(s: string): string {
    return new Date(s).toLocaleDateString();
  }
}
