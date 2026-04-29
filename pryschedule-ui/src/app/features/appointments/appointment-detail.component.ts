import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import {
  AppointmentDetail, AppointmentStatus,
  IntakeFormField, IntakeFormResponse,
  PracticeForm, ImageMapMarker, ImageMapPoint
} from '../../core/models/models';

/** One row in the rendered intake responses — resolved from a fieldId to its label + value. */
interface RenderedResponseRow {
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

/** Top-level render unit — one card per submitted form. */
interface RenderedFormCard {
  responseId: number;
  formName: string;
  submittedAt: string;
  rows: RenderedResponseRow[];
  rawJson: string | null;
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
   * Field definitions per PracticeForm id. Multi-form appointments need to
   * resolve each response's field IDs against ITS form's definition, not a
   * shared flat pool — different forms can reuse the same auto-generated
   * 8-char IDs and would collide. Map keyed by PracticeForm.id.
   *
   * Falls back to a flat list under key 0 for legacy responses that
   * pre-date PracticeFormId being set.
   */
  formFieldsByFormId = signal<Map<number, IntakeFormField[]>>(new Map());

  /** Flat list of every field across every attached form. Used as a
   *  last-resort fallback when a response has no PracticeFormId. */
  fallbackFields = signal<IntakeFormField[]>([]);

  /**
   * One rendered card per submitted response. Each card carries the form
   * name (header), submission timestamp (badge), and the resolved field
   * rows. Order matches the API: most-recent first.
   */
  readonly renderedForms = computed<RenderedFormCard[]>(() => {
    const a = this.appt();
    if (!a?.intakeResponses?.length) return [];
    return a.intakeResponses.map(r => this.buildFormCard(r));
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
        // Build a per-form-id map so each response can resolve field IDs
        // against its OWN form's definition. Different forms can reuse the
        // same random 8-char IDs and would collide if we flattened.
        const map = new Map<number, IntakeFormField[]>();
        const flat: IntakeFormField[] = [];
        for (const f of forms) {
          try {
            const parsed = JSON.parse(f.fieldsJson);
            if (Array.isArray(parsed)) {
              map.set(f.id, parsed);
              flat.push(...parsed);
            }
          } catch { /* ignore malformed fieldsJson */ }
        }
        this.formFieldsByFormId.set(map);
        this.fallbackFields.set(flat);
      },
      error: () => { /* leave maps empty; cards show raw JSON */ }
    });
  }

  /**
   * Build one card from a submitted response. Resolves field labels via
   * the per-form map; falls back to the flat list when the response is
   * legacy (no PracticeFormId). Unmatched keys still appear at the end so
   * nothing is silently dropped.
   *
   * Heading fields are included in the row list even though they have no
   * response value — the renderer special-cases them to draw a section
   * divider. We only emit them when at least one data field follows so
   * a trailing heading with no fields doesn't dangle.
   */
  private buildFormCard(r: IntakeFormResponse): RenderedFormCard {
    const formName = (r.formName ?? '').trim() || 'Intake Form';

    let data: Record<string, any> = {};
    try { data = JSON.parse(r.responsesJson); }
    catch {
      return {
        responseId: r.id,
        formName,
        submittedAt: r.submittedAt,
        rows: [],
        rawJson: r.responsesJson
      };
    }

    let fields: IntakeFormField[] = [];
    if (r.practiceFormId != null) {
      fields = this.formFieldsByFormId().get(r.practiceFormId) ?? [];
    }
    if (fields.length === 0) fields = this.fallbackFields();

    const byId = new Map(fields.map(f => [f.id, f]));
    const rows: RenderedResponseRow[] = [];
    for (const f of fields) {
      if (f.type === 'heading') {
        // Headings have no response value but render as section dividers.
        rows.push({
          fieldId: f.id, label: f.label, type: 'heading',
          value: '', isSignature: false
        });
        continue;
      }
      if (!(f.id in data)) continue;
      rows.push(this.buildRow(f.id, data[f.id], f));
    }
    for (const key of Object.keys(data)) {
      if (byId.has(key)) continue;
      rows.push(this.buildRow(key, data[key], null));
    }

    // Strip a trailing heading with no following data — it'd render as a
    // dangling section title with nothing under it.
    while (rows.length > 0 && rows[rows.length - 1].type === 'heading') rows.pop();

    return {
      responseId: r.id,
      formName,
      submittedAt: r.submittedAt,
      rows,
      // Only emit raw JSON when there are no rendered rows AT ALL —
      // a heading-only fields list (no data) means responsesJson is
      // empty too, which is fine to skip.
      rawJson: rows.length === 0 && Object.keys(data).length > 0
        ? JSON.stringify(data, null, 2) : null
    };
  }

  private buildRow(fieldId: string, raw: any, field: IntakeFormField | null): RenderedResponseRow {
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
