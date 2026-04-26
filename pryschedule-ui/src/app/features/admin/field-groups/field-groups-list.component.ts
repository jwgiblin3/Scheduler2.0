import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { FieldGroupListItem } from '../../../core/models/admin-models';

/**
 * SuperAdmin-only list of global field groups. Filters by category, shows
 * version, and links into the editor for create/edit.
 *
 * Soft-deleted rows are hidden by default; the "Show deleted" toggle
 * passes <c>includeDeleted=true</c> to the API.
 */
@Component({
  selector: 'app-admin-field-groups-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './field-groups-list.component.html',
  styleUrls: ['./field-groups-list.component.scss']
})
export class FieldGroupsListComponent implements OnInit {
  private api = inject(AdminApiService);
  private router = inject(Router);

  rows = signal<FieldGroupListItem[]>([]);
  loading = signal(false);
  error = signal('');

  // Filters (template-driven via ngModel)
  filterCategory = '';
  showDeleted = false;

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.listFieldGroups({
      category: this.filterCategory || undefined,
      includeDeleted: this.showDeleted
    }).subscribe({
      next: rows => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Failed to load field groups.');
        this.loading.set(false);
      }
    });
  }

  /** Distinct categories present in the current rows, for the filter chips. */
  categories(): string[] {
    const set = new Set<string>();
    for (const r of this.rows()) if (r.category) set.add(r.category);
    return Array.from(set).sort();
  }

  /** Pretty-print the timestamp for the list. */
  formatDate(s: string): string {
    return new Date(s).toLocaleString();
  }

  /**
   * Soft-delete with a confirm. Reloads the list afterwards rather than
   * mutating the row in place — the server is the source of truth on
   * soft-delete state.
   */
  remove(r: FieldGroupListItem, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!confirm(`Soft-delete the group "${r.name}"? Existing FormInstances using it will continue to render.`)) return;
    this.api.deleteFieldGroup(r.logicalId).subscribe({
      next: () => this.load(),
      error: err => this.error.set(typeof err.error === 'string' ? err.error : 'Could not delete.')
    });
  }
}
