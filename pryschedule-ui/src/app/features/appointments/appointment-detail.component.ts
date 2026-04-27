import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import {
  AppointmentDetail, AppointmentStatus,
  IntakeFormField, PracticeForm, ImageMapMarker, ImageMapPoint
} from '../../core/models/models';

/** One row in the rendered intake responses — resolved from a fieldId to its label + value. */
interface RenderedResponse {
  fieldId: string;
  label: string;
  type: IntakeFormField['type'];
  /** String for text/radio/date, string[] for checkbox, data: URL for signature. */
  value: string | string[];
  /** True when value is a base64 data URL for a signature. */
  isSignature: boolean;
  /** Image-map payload — present only when the field type is imagemap. */
  imagemap?: {
    imageUrl: string;
    markers: ImageMapMarker[];
    points: ImageMapPoint[];
  };
}

@Component({
  selector: 'app-appointment-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './appointment-detail.component.html',
  styleUrls: ['./appointment-detail.component.scss']
})
export class AppointmentDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  appt = signal<AppointmentDetail | null>(null);

  // ---- Notes (practice-side, attached to the appointment) ----
  // Editable text area bound to the appointment's `notes` column. Length
  // capped at 2000 to match the server-side [MaxLength(2000)] from Phase 0.
  // Save reuses the existing PUT /api/appointments/{id} endpoint, which
  // takes both Status and Notes — we always pass the current Status so we
  // never accidentally roll the appointment back to Scheduled.
  notesEdit = signal('');
  savingNotes = signal(false);
  notesSavedAt = signal<Date | null>(null);
  notesError = signal('');

  /** True when the textarea diverges from the persisted value. */
  notesDirty = computed(() => (this.notesEdit() ?? '') !== (this.appt()?.notes ?? ''));

  /** Length cap mirrors server. */
  readonly notesMaxLength = 2000;

  /** "0 / 2000" style counter for the UI. */
  notesCounter = computed(() => `${(this.notesEdit() ?? '').length} / ${this.notesMaxLength}`);

  /**
   * The field definitions for whichever form(s) are attached to this
   * appointment's type. We join these against responsesJson keys to render
   * human-readable labels instead of the raw "sgw95kb9": "John" shape.
   */
  formFields = signal<IntakeFormField[]>([]);

  readonly renderedResponses = computed<RenderedResponse[]>(() => {
    const a = this.appt();
    if (!a?.intakeResponse?.responsesJson) return [];

    let data: Record<string, any> = {};
    try { data = JSON.parse(a.intakeResponse.responsesJson); }
    catch { return []; }

    const fields = this.formFields();
    const byId = new Map(fields.map(f => [f.id, f]));
    // Preserve the form's declared order; append any stray keys that don't
    // match a known field at the end so nothing is silently dropped.
    const rows: RenderedResponse[] = [];
    for (const f of fields) {
      if (!(f.id in data)) continue;
      rows.push(this.buildRow(f.id, data[f.id], f));
    }
    for (const key of Object.keys(data)) {
      if (byId.has(key)) continue;
      rows.push(this.buildRow(key, data[key], null));
    }
    return rows;
  });

  statusLabel(s: AppointmentStatus) {
    return ['Scheduled', 'Completed', 'Cancelled', 'No Show'][s];
  }

  /** Template helper — Array.isArray isn't directly callable from Angular templates. */
  isArray(v: unknown): boolean { return Array.isArray(v); }

  /** Fallback for cases where we couldn't resolve field labels — show the raw JSON. */
  formatResponses(json: string) {
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  }

  updateStatus(status: AppointmentStatus) {
    const id = this.appt()!.id;
    // Carry the latest notes value through with the status change so we
    // don't lose unsaved edits if the user clicks "Mark Completed" before
    // hitting "Save notes".
    const notes = this.notesEdit() ?? this.appt()?.notes ?? null;
    this.api.updateAppointmentStatus(id, status, notes ?? undefined).subscribe(() => {
      this.appt.update(a => a ? { ...a, status, notes } : null);
    });
  }

  /**
   * Save just the notes — no status change. Sends the current Status as
   * a passthrough so the server's `appointment.Status = req.Status;` line
   * doesn't roll the row back to a stale value.
   */
  saveNotes() {
    const a = this.appt();
    if (!a) return;
    this.savingNotes.set(true);
    this.notesError.set('');
    const notes = (this.notesEdit() ?? '').trim();
    this.api.updateAppointmentStatus(a.id, a.status, notes).subscribe({
      next: () => {
        this.savingNotes.set(false);
        this.notesSavedAt.set(new Date());
        this.appt.update(curr => curr ? { ...curr, notes } : null);
        // Auto-clear the "Saved" flash after a few seconds. Keeps the UI
        // calm — the dirty/clean state of the textarea continues to
        // communicate save status implicitly.
        setTimeout(() => {
          if (!this.notesDirty()) this.notesSavedAt.set(null);
        }, 3000);
      },
      error: err => {
        this.savingNotes.set(false);
        this.notesError.set(typeof err?.error === 'string' ? err.error : 'Could not save notes.');
      }
    });
  }

  /** Discard unsaved edits and revert to whatever the server last returned. */
  resetNotes() {
    this.notesEdit.set(this.appt()?.notes ?? '');
    this.notesError.set('');
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getAppointment(id).subscribe({
      next: data => {
        this.appt.set(data);
        // Seed the notes editor from the server value so the dirty check
        // starts clean. If the appointment has no notes yet, the textarea
        // shows up empty and the Save button stays disabled until typed.
        this.notesEdit.set(data.notes ?? '');
        this.loading.set(false);
        // Grab the forms attached to this appointment type so we can resolve
        // field IDs to labels. Silent-fail on error — the template falls back
        // to the raw JSON dump.
        if (data.appointmentTypeId) this.loadFormFields(data.appointmentTypeId);
      },
      error: () => this.loading.set(false)
    });
  }

  private loadFormFields(apptTypeId: number) {
    this.api.getPublicFormsForType(apptTypeId).subscribe({
      next: (forms: PracticeForm[]) => {
        // Flatten fields from every attached form. Field IDs are random 8-char
        // strings and realistically won't collide across forms, so a flat list
        // is fine — we just need to know "which label matches this key?".
        const all: IntakeFormField[] = [];
        for (const f of forms) {
          try {
            const parsed = JSON.parse(f.fieldsJson);
            if (Array.isArray(parsed)) all.push(...parsed);
          } catch { /* ignore malformed fieldsJson */ }
        }
        this.formFields.set(all);
      },
      error: () => { /* leave fields empty; template shows raw JSON */ }
    });
  }

  private buildRow(fieldId: string, raw: any, field: IntakeFormField | null): RenderedResponse {
    const label = field?.label?.trim() || fieldId;
    const type = field?.type ?? 'text';
    if (type === 'imagemap') {
      const points: ImageMapPoint[] = Array.isArray(raw)
        ? raw.map((p: any) => ({
            x: Number(p?.x) || 0,
            y: Number(p?.y) || 0,
            letter: String(p?.letter ?? '').slice(0, 1).toUpperCase()
          }))
        : [];
      return {
        fieldId, label, type,
        value: '', isSignature: false,
        imagemap: {
          imageUrl: field?.imageUrl ?? '',
          markers: Array.isArray(field?.markers) ? field!.markers! : [],
          points
        }
      };
    }
    const isSig = type === 'signature'
      || (typeof raw === 'string' && raw.startsWith('data:image'));
    let value: string | string[];
    if (Array.isArray(raw)) value = raw.map(String);
    else if (raw === null || raw === undefined) value = '';
    else value = String(raw);
    return { fieldId, label, type, value, isSignature: isSig };
  }
}
