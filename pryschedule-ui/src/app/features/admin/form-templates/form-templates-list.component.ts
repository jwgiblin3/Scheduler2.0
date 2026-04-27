import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { FormTemplateListItem } from '../../../core/models/admin-models';

/**
 * SuperAdmin-only list of global form templates. Filters by audience
 * (chiro / massage / pt / generic) and by deleted state. Click a row to
 * edit; saving creates a new version row.
 */
@Component({
  selector: 'app-admin-form-templates-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './form-templates-list.component.html',
  styleUrls: ['./form-templates-list.component.scss']
})
export class FormTemplatesListComponent implements OnInit {
  private api = inject(AdminApiService);

  rows = signal<FormTemplateListItem[]>([]);
  loading = signal(false);
  error = signal('');

  filterAudience = '';
  showDeleted = false;

  // Common audiences. Free-form on the server side, but the dropdown
  // surfaces these four for ease — admins can type anything via the
  // editor's audience field.
  audienceOptions = [
    { value: '',         label: 'All' },
    { value: 'chiro',    label: 'Chiropractic' },
    { value: 'massage',  label: 'Massage Therapy' },
    { value: 'pt',       label: 'Personal Training' },
    { value: 'generic',  label: 'Generic' }
  ];

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.listFormTemplates({
      audience: this.filterAudience || undefined,
      includeDeleted: this.showDeleted
    }).subscribe({
      next: rows => { this.rows.set(rows); this.loading.set(false); },
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Failed to load form templates.');
        this.loading.set(false);
      }
    });
  }

  formatDate(s: string): string {
    return new Date(s).toLocaleString();
  }

  audienceLabel(v: string): string {
    return this.audienceOptions.find(o => o.value === v)?.label ?? v;
  }

  remove(r: FormTemplateListItem, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    if (!confirm(`Soft-delete the template "${r.name}"? Existing FormInstances using it will continue to render.`)) return;
    this.api.deleteFormTemplate(r.logicalId).subscribe({
      next: () => this.load(),
      error: err => this.error.set(typeof err.error === 'string' ? err.error : 'Could not delete.')
    });
  }
}
