import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  ClientSummary, ClientDetail, ClientFormResponse,
  IntakeFormField, AppointmentStatus
} from '../../core/models/models';

interface RenderedResponseRow {
  label: string;
  value: string | string[];
  isSignature: boolean;
}

interface RenderedResponse {
  id: number;
  formName: string;
  appointmentId: number;
  appointmentStartTime: string;
  submittedAt: string;
  rows: RenderedResponseRow[];
  rawJson: string | null;
}

@Component({
  selector: 'app-clients-list',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './clients-list.component.html',
  styleUrls: ['./clients-list.component.scss']
})
export class ClientsListComponent implements OnInit {
  private api = inject(ApiService);

  clients = signal<ClientSummary[]>([]);
  loadingList = signal(true);
  search = signal('');

  // Selected client + detail
  selectedId = signal<number | null>(null);
  detail = signal<ClientDetail | null>(null);
  loadingDetail = signal(false);

  // Edit mode for profile fields
  editing = signal(false);
  saving = signal(false);
  error = signal('');
  saved = signal(false);
  editFirstName = '';
  editLastName = '';
  editEmail = '';
  editPhone = '';
  editSmsOptIn = false;

  /** Pre-render form responses with labels resolved against their fieldsJson. */
  readonly renderedResponses = computed<RenderedResponse[]>(() => {
    const d = this.detail();
    if (!d) return [];
    return d.formResponses.map(r => this.renderResponse(r));
  });

  statusLabel(s: AppointmentStatus) {
    return ['Scheduled', 'Completed', 'Cancelled', 'No Show'][s];
  }

  isArray(v: unknown): boolean { return Array.isArray(v); }

  load() {
    this.loadingList.set(true);
    this.api.getClients(this.search().trim() || undefined).subscribe({
      next: data => { this.clients.set(data); this.loadingList.set(false); },
      error: () => this.loadingList.set(false)
    });
  }

  onSearchChange() { this.load(); }

  select(client: ClientSummary) {
    if (this.selectedId() === client.id) return;
    this.selectedId.set(client.id);
    this.editing.set(false);
    this.saved.set(false);
    this.loadingDetail.set(true);
    this.api.getClient(client.id).subscribe({
      next: d => { this.detail.set(d); this.loadingDetail.set(false); },
      error: () => { this.loadingDetail.set(false); this.error.set('Failed to load client details.'); }
    });
  }

  startEdit() {
    const d = this.detail();
    if (!d) return;
    this.editing.set(true);
    this.saved.set(false);
    this.error.set('');
    this.editFirstName = d.firstName;
    this.editLastName = d.lastName;
    this.editEmail = d.email;
    this.editPhone = d.phone ?? '';
    this.editSmsOptIn = d.smsOptIn;
  }

  cancelEdit() {
    this.editing.set(false);
    this.error.set('');
  }

  saveEdit() {
    const d = this.detail();
    if (!d) return;
    this.saving.set(true);
    this.error.set('');
    this.saved.set(false);
    this.api.updateClient(d.id, {
      firstName: this.editFirstName.trim(),
      lastName: this.editLastName.trim(),
      email: this.editEmail.trim(),
      phone: this.editPhone.trim() || null,
      smsOptIn: this.editSmsOptIn
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.saved.set(true);
        // Refresh in-place so the header + list reflect the new values.
        this.detail.update(cur => cur ? {
          ...cur,
          firstName: this.editFirstName.trim(),
          lastName: this.editLastName.trim(),
          email: this.editEmail.trim(),
          phone: this.editPhone.trim() || null,
          smsOptIn: this.editSmsOptIn
        } : cur);
        this.load();
      },
      error: err => {
        this.error.set(err?.error || 'Save failed.');
        this.saving.set(false);
      }
    });
  }

  ngOnInit() { this.load(); }

  private renderResponse(r: ClientFormResponse): RenderedResponse {
    let data: Record<string, any> = {};
    try { data = JSON.parse(r.responsesJson); }
    catch {
      return {
        id: r.id, formName: r.formName,
        appointmentId: r.appointmentId, appointmentStartTime: r.appointmentStartTime,
        submittedAt: r.submittedAt,
        rows: [], rawJson: r.responsesJson
      };
    }

    let fields: IntakeFormField[] = [];
    try {
      const parsed = JSON.parse(r.fieldsJson ?? '[]');
      if (Array.isArray(parsed)) fields = parsed;
    } catch { /* fieldsJson missing/invalid — rows will be empty */ }

    // When we have no field schema, fall back to raw JSON so nothing is hidden.
    if (fields.length === 0) {
      return {
        id: r.id, formName: r.formName,
        appointmentId: r.appointmentId, appointmentStartTime: r.appointmentStartTime,
        submittedAt: r.submittedAt,
        rows: [], rawJson: JSON.stringify(data, null, 2)
      };
    }

    const byId = new Map(fields.map(f => [f.id, f]));
    const rows: RenderedResponseRow[] = [];
    for (const f of fields) {
      if (!(f.id in data)) continue;
      rows.push(this.row(f, data[f.id]));
    }
    for (const key of Object.keys(data)) {
      if (byId.has(key)) continue;
      rows.push({ label: key, value: String(data[key] ?? ''), isSignature: false });
    }

    return {
      id: r.id, formName: r.formName,
      appointmentId: r.appointmentId, appointmentStartTime: r.appointmentStartTime,
      submittedAt: r.submittedAt,
      rows, rawJson: null
    };
  }

  private row(field: IntakeFormField, raw: any): RenderedResponseRow {
    const label = field.label?.trim() || field.id;
    const isSig = field.type === 'signature'
      || (typeof raw === 'string' && raw.startsWith('data:image'));
    let value: string | string[];
    if (Array.isArray(raw)) value = raw.map(String);
    else if (raw === null || raw === undefined) value = '';
    else value = String(raw);
    return { label, value, isSignature: isSig };
  }
}
