import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { PracticeForm, IntakeFormField, ImageMapMarker } from '../../core/models/models';
import {
  FieldGroupDetail, Field as RichField, FieldType as RichFieldType
} from '../../core/models/admin-models';

const FIELD_TYPES: Array<{ value: IntakeFormField['type']; label: string; hasOptions: boolean }> = [
  { value: 'text',      label: 'Short text',                 hasOptions: false },
  { value: 'textarea',  label: 'Long text',                  hasOptions: false },
  { value: 'radio',     label: 'Single choice (radio)',      hasOptions: true  },
  { value: 'checkbox',  label: 'Multiple choice (checkbox)', hasOptions: true  },
  { value: 'date',      label: 'Date',                       hasOptions: false },
  { value: 'signature', label: 'Signature',                  hasOptions: false },
  { value: 'imagemap',  label: 'Image map (body diagram)',   hasOptions: false }
];

/** Seed markers for brand-new imagemap fields — mirrors a common pain-chart key. */
const DEFAULT_IMAGEMAP_MARKERS = [
  { letter: 'N', label: 'Numbness' },
  { letter: 'B', label: 'Burning' },
  { letter: 'S', label: 'Stabbing' },
  { letter: 'T', label: 'Tingling' },
  { letter: 'A', label: 'Dull Ache' }
];

@Component({
  selector: 'app-forms-list',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './forms-list.component.html',
  styleUrls: ['./forms-list.component.scss']
})
export class FormsListComponent implements OnInit {
  private api = inject(ApiService);

  fieldTypes = FIELD_TYPES;
  forms = signal<PracticeForm[]>([]);
  selected = signal<PracticeForm | null>(null);
  isNew = signal(false);
  loadingList = signal(true);

  // --- Edit state ---
  editName = signal('');
  editFields = signal<IntakeFormField[]>([]);
  saving = signal(false);
  deleting = signal(false);
  formSaved = signal(false);
  error = signal('');

  // --- Field group picker state ---
  // The picker fetches global field groups from /api/field-groups when first
  // opened. The list is cached for the lifetime of the component (it's not
  // unreasonable to assume globals don't change mid-edit).
  pickerOpen = signal(false);
  pickerLoading = signal(false);
  availableGroups = signal<FieldGroupDetail[]>([]);
  pickerCategory = signal<string>('');

  /** True when the editor panel should render. */
  showEditor = computed(() => this.isNew() || this.selected() !== null);

  /**
   * Distinct categories present in the loaded groups, for the picker filter.
   * Sorted alphabetically; empty string is treated as "(uncategorized)".
   */
  pickerCategories = computed(() => {
    const set = new Set<string>();
    for (const g of this.availableGroups()) if (g.category) set.add(g.category);
    return Array.from(set).sort();
  });

  /** Filtered groups for the picker, applying the category dropdown. */
  filteredGroups = computed(() => {
    const cat = this.pickerCategory();
    if (!cat) return this.availableGroups();
    return this.availableGroups().filter(g => g.category === cat);
  });

  openNew() {
    this.isNew.set(true);
    this.selected.set(null);
    this.editName.set('');
    this.editFields.set([]);
    this.error.set('');
    this.formSaved.set(false);
  }

  select(form: PracticeForm) {
    this.isNew.set(false);
    this.selected.set(form);
    this.editName.set(form.name);
    this.editFields.set(this.parseFields(form.fieldsJson));
    this.error.set('');
    this.formSaved.set(false);
  }

  cancel() {
    this.isNew.set(false);
    this.selected.set(null);
    this.error.set('');
    this.formSaved.set(false);
  }

  addField(type: IntakeFormField['type'] = 'text') {
    const needsOptions = FIELD_TYPES.find(t => t.value === type)?.hasOptions;
    const base: IntakeFormField = {
      id: randomFieldId(),
      label: '',
      type,
      required: false,
      options: needsOptions ? ['Option 1'] : undefined
    };
    if (type === 'imagemap') {
      base.imageUrl = '';
      base.markers = [...DEFAULT_IMAGEMAP_MARKERS];
    }
    this.editFields.update(list => [...list, base]);
    this.formSaved.set(false);
  }

  removeField(id: string) {
    this.editFields.update(list => list.filter(f => f.id !== id));
    this.formSaved.set(false);
  }

  moveField(id: string, direction: -1 | 1) {
    this.editFields.update(list => {
      const idx = list.findIndex(f => f.id === id);
      if (idx < 0) return list;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= list.length) return list;
      const copy = list.slice();
      const [item] = copy.splice(idx, 1);
      copy.splice(newIdx, 0, item);
      return copy;
    });
    this.formSaved.set(false);
  }

  updateField(id: string, patch: Partial<IntakeFormField>) {
    this.editFields.update(list => list.map(f => {
      if (f.id !== id) return f;
      const merged = { ...f, ...patch };
      const needsOptions = FIELD_TYPES.find(t => t.value === merged.type)?.hasOptions;
      if (needsOptions && (!merged.options || merged.options.length === 0)) {
        merged.options = ['Option 1'];
      } else if (!needsOptions) {
        merged.options = undefined;
      }
      // Image-map defaults: seed an empty URL and the standard marker set on
      // first switch to imagemap, strip those fields on switch away so stale
      // data doesn't leak into other field types.
      if (merged.type === 'imagemap') {
        if (merged.imageUrl === undefined) merged.imageUrl = '';
        if (!merged.markers || merged.markers.length === 0) {
          merged.markers = [...DEFAULT_IMAGEMAP_MARKERS];
        }
      } else {
        merged.imageUrl = undefined;
        merged.markers = undefined;
      }
      return merged;
    }));
    this.formSaved.set(false);
  }

  // ---- Marker-list helpers (image-map fields only) ----

  addMarker(fieldId: string) {
    this.editFields.update(list => list.map(f => {
      if (f.id !== fieldId) return f;
      const markers = [...(f.markers ?? [])];
      markers.push({ letter: '', label: '' });
      return { ...f, markers };
    }));
    this.formSaved.set(false);
  }

  removeMarker(fieldId: string, index: number) {
    this.editFields.update(list => list.map(f => {
      if (f.id !== fieldId) return f;
      const markers = (f.markers ?? []).filter((_, i) => i !== index);
      return { ...f, markers };
    }));
    this.formSaved.set(false);
  }

  /**
   * Update a marker's letter or label. Letter is normalized to uppercase,
   * clamped to one character; changing the label auto-fills the letter when
   * the admin hasn't overridden it yet, so "Numbness" → N without an extra step.
   */
  updateMarker(fieldId: string, index: number, patch: Partial<ImageMapMarker>) {
    this.editFields.update(list => list.map(f => {
      if (f.id !== fieldId) return f;
      const markers = (f.markers ?? []).slice();
      const existing = markers[index];
      if (!existing) return f;
      const next = { ...existing, ...patch };
      if (typeof patch.letter === 'string') {
        next.letter = patch.letter.slice(0, 1).toUpperCase();
      }
      if (typeof patch.label === 'string' && !patch.letter) {
        // Only auto-sync when the letter still matches the old label's first
        // char — i.e. the admin hasn't manually overridden it.
        const oldAutoLetter = (existing.label ?? '').slice(0, 1).toUpperCase();
        if (!existing.letter || existing.letter === oldAutoLetter) {
          next.letter = (patch.label ?? '').slice(0, 1).toUpperCase();
        }
      }
      markers[index] = next;
      return { ...f, markers };
    }));
    this.formSaved.set(false);
  }

  getOptionsText(field: IntakeFormField): string {
    return (field.options ?? []).join('\n');
  }
  setOptionsText(id: string, text: string) {
    const options = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    this.updateField(id, { options });
  }

  save() {
    const name = this.editName().trim();
    if (!name) {
      this.error.set('Name the form (e.g. Waiver, Intake, New Customer).');
      return;
    }
    const fields = this.editFields()
      .filter(f => f.label.trim().length > 0)
      .map(f => {
        const cleaned: IntakeFormField = {
          ...f,
          label: f.label.trim(),
          options: f.options ? f.options.map(o => o.trim()).filter(o => o.length > 0) : undefined
        };
        if (f.type === 'imagemap') {
          cleaned.imageUrl = (f.imageUrl ?? '').trim();
          // Drop partially-filled marker rows so the client side never sees
          // a marker with "" as its letter.
          cleaned.markers = (f.markers ?? [])
            .map(m => ({
              letter: (m.letter ?? '').slice(0, 1).toUpperCase(),
              label: (m.label ?? '').trim()
            }))
            .filter(m => m.letter && m.label);
        }
        return cleaned;
      });
    const fieldsJson = JSON.stringify(fields);

    this.saving.set(true);
    this.error.set('');
    this.formSaved.set(false);

    const obs = this.isNew()
      ? this.api.createForm(name, fieldsJson)
      : this.api.updateForm(this.selected()!.id, name, fieldsJson);

    obs.subscribe({
      next: saved => {
        this.saving.set(false);
        this.formSaved.set(true);
        this.isNew.set(false);
        this.selected.set(saved);
        this.editFields.set(fields);
        this.load();
      },
      error: err => {
        this.error.set(err?.error || 'Failed to save form.');
        this.saving.set(false);
      }
    });
  }

  deleteForm() {
    const f = this.selected();
    if (!f) return;
    const ok = confirm(`Delete "${f.name}"? Any appointment types using this form will be detached.`);
    if (!ok) return;
    this.deleting.set(true);
    this.api.deleteForm(f.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.cancel();
        this.load();
      },
      error: err => {
        this.error.set(err?.error || 'Failed to delete form.');
        this.deleting.set(false);
      }
    });
  }

  load() {
    this.loadingList.set(true);
    this.api.getForms().subscribe({
      next: list => { this.forms.set(list); this.loadingList.set(false); },
      error: () => { this.loadingList.set(false); }
    });
  }

  // --- Field group picker actions ---

  openPicker() {
    this.pickerOpen.set(true);
    if (this.availableGroups().length === 0) {
      this.pickerLoading.set(true);
      this.api.getAvailableFieldGroups().subscribe({
        next: groups => {
          this.availableGroups.set(groups);
          this.pickerLoading.set(false);
        },
        error: () => {
          this.error.set('Could not load field groups. Try again.');
          this.pickerLoading.set(false);
          this.pickerOpen.set(false);
        }
      });
    }
  }

  closePicker() {
    this.pickerOpen.set(false);
  }

  /**
   * Drop the chosen group's fields into the form editor inline. We translate
   * the rich Field shape into the legacy IntakeFormField shape — lossy but
   * covers the cases the legacy renderer supports. Admins can edit each
   * field afterwards if the translation didn't capture what they wanted.
   *
   * Translation rules:
   *   Rich Text/Email/Phone/Number  → 'text'
   *   Rich Textarea                 → 'textarea'
   *   Rich Date                     → 'date'
   *   Rich Select/Radio             → 'radio'
   *   Rich Multiselect/CheckboxGroup→ 'checkbox'
   *   Rich Signature                → 'signature'
   *   Rich BodyDiagram              → 'imagemap' (with default markers)
   *   anything else                 → 'text' (admins can adjust)
   *
   * The labels and option values are preserved. Width, PHI, conditional
   * logic, placeholders, and validation bounds are dropped — they aren't
   * representable in the legacy shape. This is the deliberate trade-off in
   * keeping the legacy /forms screen alive while practices adopt groups.
   */
  pickGroup(g: FieldGroupDetail) {
    const newFields = g.fields.map(f => this.translateRichField(f));
    if (newFields.length === 0) {
      this.error.set(`Group "${g.name}" has no fields to add.`);
      return;
    }
    this.editFields.update(list => [...list, ...newFields]);
    this.formSaved.set(false);
    this.closePicker();
  }

  private translateRichField(f: RichField): IntakeFormField {
    const id = f.id ?? randomFieldId();
    const label = f.label;
    const required = !!f.required;
    const optionLabels = (f.options ?? []).map(o => o.label).filter(s => !!s);

    const base: IntakeFormField = { id, label, type: 'text', required };

    switch (f.type) {
      case RichFieldType.Textarea:
        base.type = 'textarea';
        break;
      case RichFieldType.Date:
      case RichFieldType.DateTime:
        base.type = 'date';
        break;
      case RichFieldType.Select:
      case RichFieldType.Radio:
        base.type = 'radio';
        base.options = optionLabels.length > 0 ? optionLabels : ['Option 1'];
        break;
      case RichFieldType.Multiselect:
      case RichFieldType.CheckboxGroup:
        base.type = 'checkbox';
        base.options = optionLabels.length > 0 ? optionLabels : ['Option 1'];
        break;
      case RichFieldType.Signature:
        base.type = 'signature';
        break;
      case RichFieldType.BodyDiagram:
        base.type = 'imagemap';
        base.imageUrl = '';
        base.markers = [...DEFAULT_IMAGEMAP_MARKERS];
        break;
      default:
        // Text, Email, Phone, Number, Time, Checkbox (single), File,
        // AddressBlock, PaymentMethod — fall back to short text. Admin can
        // tweak after the drop.
        base.type = 'text';
        break;
    }
    return base;
  }

  ngOnInit() { this.load(); }

  private parseFields(json: string | null | undefined): IntakeFormField[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((f: any) => {
        const type = (FIELD_TYPES.find(t => t.value === f.type)?.value ?? 'text') as IntakeFormField['type'];
        const base: IntakeFormField = {
          id: typeof f.id === 'string' && f.id ? f.id : randomFieldId(),
          label: String(f.label ?? ''),
          type,
          required: Boolean(f.required),
          options: Array.isArray(f.options) ? f.options.map(String) : undefined
        };
        if (type === 'imagemap') {
          base.imageUrl = typeof f.imageUrl === 'string' ? f.imageUrl : '';
          base.markers = Array.isArray(f.markers)
            ? f.markers.map((m: any) => ({
                letter: String(m?.letter ?? '').slice(0, 1).toUpperCase(),
                label: String(m?.label ?? '')
              }))
            : [...DEFAULT_IMAGEMAP_MARKERS];
        }
        return base;
      });
    } catch {
      return [];
    }
  }
}

function randomFieldId(): string {
  return Math.random().toString(36).slice(2, 10);
}
