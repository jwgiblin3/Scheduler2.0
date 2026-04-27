import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import {
  ClientSummary, ClientDetail, ClientFormResponse,
  IntakeFormField, AppointmentStatus, ImageMapMarker, ImageMapPoint
} from '../../core/models/models';

interface RenderedResponseRow {
  label: string;
  value: string | string[];
  isSignature: boolean;
  /** Image-map payload — present only for image-map fields. */
  imagemap?: {
    imageUrl: string;
    markers: ImageMapMarker[];
    points: ImageMapPoint[];
  };
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

  /**
   * Flattened "all notes for this client" view. Pulls the appointment-level
   * `notes` field from every appointment that has one. Empty/whitespace
   * notes are filtered out so the section only shows actual content.
   * Already most-recent first since the controller orders appointments
   * OrderByDescending(a => a.StartTime) — we inherit that order.
   */
  readonly clientNotes = computed(() => {
    const d = this.detail();
    if (!d) return [];
    return d.appointments
      .filter(a => (a.notes ?? '').trim().length > 0)
      .map(a => ({
        appointmentId: a.id,
        startTime: a.startTime,
        providerName: a.providerName,
        appointmentTypeName: a.appointmentTypeName,
        notes: a.notes!.trim()
      }));
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

  // ---------- Export ----------
  //
  // Two flavors:
  //   1. List export — dumps all clients shown in the left panel (respects
  //      the current search filter) as a CSV with basic fields + appointment
  //      stats. Useful for bulk outreach / bookkeeping.
  //   2. Client export — the full record for the selected client: profile,
  //      every appointment, and every submitted form response flattened to
  //      one row per answered field. Form-field labels are resolved from
  //      the form's fieldsJson so the output reads like a transcript, not
  //      a pile of GUID keys.

  exportList() {
    const rows = this.clients();
    if (rows.length === 0) return;
    const headers = ['First Name', 'Last Name', 'Email', 'Phone',
      'SMS Opt-In', 'Client Since', 'Appointment Count', 'Last Appointment'];
    const body = rows.map(c => [
      c.firstName,
      c.lastName,
      c.email,
      c.phone ?? '',
      c.smsOptIn ? 'Yes' : 'No',
      formatDate(c.createdAt),
      String(c.appointmentCount),
      c.lastAppointment ? formatDate(c.lastAppointment) : ''
    ]);
    const csv = toCsv([headers, ...body]);
    downloadCsv(csv, `clients-${stamp()}.csv`);
  }

  /**
   * Download a single form response as a 2-column CSV (Question, Answer) with
   * a short header identifying the client, form, and appointment. Useful for
   * filing a specific waiver or intake alongside a chart note.
   */
  exportResponse(responseId: number) {
    const d = this.detail();
    if (!d) return;
    const r = this.renderedResponses().find(x => x.id === responseId);
    if (!r) return;

    const header: string[][] = [
      ['Client',        `${d.firstName} ${d.lastName}`],
      ['Form',          r.formName],
      ['Appointment',   formatDate(r.appointmentStartTime)],
      ['Submitted',     formatDateTime(r.submittedAt)],
      [''],
      ['Question', 'Answer']
    ];
    const body: string[][] = [];
    if (r.rows.length > 0) {
      for (const row of r.rows) {
        let answer: string;
        if (row.isSignature) answer = '[signature]';
        else if (Array.isArray(row.value)) answer = row.value.join('; ');
        else answer = row.value;
        body.push([row.label, answer]);
      }
    } else if (r.rawJson) {
      body.push(['(raw response)', r.rawJson]);
    }

    const csv = toCsv([...header, ...body]);
    const safeClient = `${d.firstName}-${d.lastName}`
      .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `client-${d.id}`;
    const safeForm = r.formName
      .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'form';
    downloadCsv(csv, `${safeClient}-${safeForm}-${stamp()}.csv`);
  }

  exportDetail() {
    const d = this.detail();
    if (!d) return;

    const sections: string[][][] = [];

    // Section 1: profile — single header + value row.
    sections.push([
      ['CLIENT PROFILE'],
      ['First Name', 'Last Name', 'Email', 'Phone', 'SMS Opt-In', 'Client Since'],
      [d.firstName, d.lastName, d.email, d.phone ?? '',
        d.smsOptIn ? 'Yes' : 'No', formatDate(d.createdAt)]
    ]);

    // Section 2: appointments.
    sections.push([
      [''],
      ['APPOINTMENTS'],
      ['Date', 'Time', 'Type', 'Provider', 'Status', 'Form Submitted']
    ]);
    for (const a of d.appointments) {
      sections[1].push([
        formatDate(a.startTime),
        formatTime(a.startTime),
        a.appointmentTypeName,
        a.providerName,
        this.statusLabel(a.status),
        a.hasIntakeResponse ? 'Yes' : 'No'
      ]);
    }

    // Section 3: form responses — one row per answered field so the CSV
    // stays tabular. Signature fields are emitted as "[signature]" since
    // embedding a data-URL in CSV is neither readable nor useful.
    sections.push([
      [''],
      ['FORM RESPONSES'],
      ['Appointment Date', 'Form', 'Submitted', 'Question', 'Answer']
    ]);
    const rendered = this.renderedResponses();
    for (const r of rendered) {
      if (r.rows.length > 0) {
        for (const row of r.rows) {
          let answer: string;
          if (row.isSignature) answer = '[signature]';
          else if (Array.isArray(row.value)) answer = row.value.join('; ');
          else answer = row.value;
          sections[2].push([
            formatDate(r.appointmentStartTime),
            r.formName,
            formatDateTime(r.submittedAt),
            row.label,
            answer
          ]);
        }
      } else if (r.rawJson) {
        sections[2].push([
          formatDate(r.appointmentStartTime),
          r.formName,
          formatDateTime(r.submittedAt),
          '(raw response)',
          r.rawJson
        ]);
      }
    }

    const flat: string[][] = [];
    for (const s of sections) for (const row of s) flat.push(row);
    const csv = toCsv(flat);
    const safeName = `${d.firstName}-${d.lastName}`
      .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `client-${d.id}`;
    downloadCsv(csv, `${safeName}-${stamp()}.csv`);
  }

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
    // Image-map is a structured array of points + the field carries the image
    // and marker key needed to reconstruct the diagram.
    if (field.type === 'imagemap') {
      const points: ImageMapPoint[] = Array.isArray(raw)
        ? raw.map((p: any) => ({
            x: Number(p?.x) || 0,
            y: Number(p?.y) || 0,
            letter: String(p?.letter ?? '').slice(0, 1).toUpperCase()
          }))
        : [];
      return {
        label, value: '', isSignature: false,
        imagemap: {
          imageUrl: field.imageUrl ?? '',
          markers: Array.isArray(field.markers) ? field.markers : [],
          points
        }
      };
    }
    const isSig = field.type === 'signature'
      || (typeof raw === 'string' && raw.startsWith('data:image'));
    let value: string | string[];
    if (Array.isArray(raw)) value = raw.map(String);
    else if (raw === null || raw === undefined) value = '';
    else value = String(raw);
    return { label, value, isSignature: isSig };
  }
}

// ---------- CSV utilities ----------
//
// RFC 4180-ish: fields containing a comma, quote, or newline are wrapped in
// double quotes, with embedded quotes doubled. That's all Excel/Numbers/Sheets
// need to round-trip correctly.
function toCsv(rows: string[][]): string {
  return rows.map(r => r.map(escapeCsv).join(',')).join('\r\n');
}
function escapeCsv(value: string): string {
  const v = value ?? '';
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
function downloadCsv(csv: string, filename: string) {
  // Prefix with a BOM so Excel opens the file as UTF-8 instead of guessing
  // Windows-1252 and mangling any accented characters.
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function stamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}
