import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/services/admin-api.service';
import {
  Field, FieldGroupDetail, FieldType, FieldWidth,
  CreateFieldGroupRequest
} from '../../../core/models/admin-models';

/**
 * Create / edit screen for a global field group. The form is intentionally
 * simple: no drag-drop reordering yet (use up/down buttons), no live
 * preview (Phase 5 renderer is the source of truth for display).
 *
 * Saving:
 *   - In create mode (no logicalId param), POSTs to /api/admin/field-groups
 *     and the API creates v1.
 *   - In edit mode, PUTs to .../{logicalId} and the API creates v(current+1).
 *     The UI doesn't expose version numbers — admins just edit and save.
 *     Old versions stay in the DB so historical FormInstances render.
 */
@Component({
  selector: 'app-admin-field-group-edit',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './field-group-edit.component.html',
  styleUrls: ['./field-group-edit.component.scss']
})
export class FieldGroupEditComponent implements OnInit {
  private api = inject(AdminApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /** null in create mode, set in edit mode. */
  logicalId = signal<string | null>(null);
  isEdit = computed(() => !!this.logicalId());

  // Group-level fields
  name = '';
  category = '';
  description = '';
  phiFlag = true;

  /** The field array — bound directly to the editor rows. */
  fields = signal<Field[]>([]);

  // Surface category typeahead suggestions from common values; admin can
  // type anything (free-form by design — see ADR-001 §4 / FieldGroup).
  categorySuggestions = ['contact', 'address', 'medical', 'insurance', 'consent', 'billing', 'custom'];

  saving = signal(false);
  loading = signal(false);
  error = signal('');

  // Pickers and labels for the field-row UI. Section is listed first
  // (above the data-collecting types) since it's structural — admins
  // typically lay out sections before filling them.
  fieldTypeOptions = [
    { value: FieldType.Section,       label: 'Section heading' },
    { value: FieldType.Text,          label: 'Text' },
    { value: FieldType.Textarea,      label: 'Textarea' },
    { value: FieldType.Email,         label: 'Email' },
    { value: FieldType.Phone,         label: 'Phone' },
    { value: FieldType.Number,        label: 'Number' },
    { value: FieldType.Date,          label: 'Date' },
    { value: FieldType.Time,          label: 'Time' },
    { value: FieldType.DateTime,      label: 'Date + Time' },
    { value: FieldType.Select,        label: 'Select (one)' },
    { value: FieldType.Multiselect,   label: 'Multiselect' },
    { value: FieldType.Radio,         label: 'Radio buttons' },
    { value: FieldType.Checkbox,      label: 'Checkbox (yes/no)' },
    { value: FieldType.CheckboxGroup, label: 'Checkbox group' },
    { value: FieldType.Signature,     label: 'Signature (typed)' },
    { value: FieldType.BodyDiagram,   label: 'Body diagram' },
    { value: FieldType.AddressBlock,  label: 'Address block' },
    { value: FieldType.File,          label: 'File upload (when storage ships)' }
  ];

  widthOptions = [
    { value: FieldWidth.Full,    label: 'Full' },
    { value: FieldWidth.Half,    label: 'Half' },
    { value: FieldWidth.Third,   label: 'Third' },
    { value: FieldWidth.Quarter, label: 'Quarter' }
  ];

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.logicalId.set(id);
      this.load(id);
    } else {
      // Start with one empty field so the UI is never blank.
      this.fields.set([this.makeBlankField()]);
    }
  }

  load(id: string) {
    this.loading.set(true);
    this.api.getFieldGroup(id).subscribe({
      next: (g: FieldGroupDetail) => {
        this.name = g.name;
        this.category = g.category ?? '';
        this.description = g.description ?? '';
        this.phiFlag = g.phiFlag;
        this.fields.set(g.fields.length ? g.fields : [this.makeBlankField()]);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Failed to load group.');
        this.loading.set(false);
      }
    });
  }

  /** Stable factory for a new blank field row. */
  makeBlankField(): Field {
    return {
      type: FieldType.Text,
      label: '',
      required: false,
      width: FieldWidth.Full,
      phiFlag: true
    };
  }

  /** True when this field type uses the Options array (select/radio/etc.). */
  usesOptions(t: FieldType): boolean {
    return t === FieldType.Select
        || t === FieldType.Multiselect
        || t === FieldType.Radio
        || t === FieldType.CheckboxGroup;
  }

  /**
   * Section is a structural type — it has a label (the section title)
   * and optional help text, but doesn't collect data and doesn't accept
   * required/width/options/validation. The editor row shows just the
   * label + help text inputs when this returns true.
   */
  isSection(t: FieldType): boolean {
    return t === FieldType.Section;
  }

  // --- Field-row mutations ---

  addField() {
    this.fields.update(fs => [...fs, this.makeBlankField()]);
  }

  removeField(idx: number) {
    if (this.fields().length === 1) {
      // Don't allow zero fields — replace with a blank instead.
      this.fields.set([this.makeBlankField()]);
      return;
    }
    this.fields.update(fs => fs.filter((_, i) => i !== idx));
  }

  moveField(idx: number, direction: -1 | 1) {
    const fs = [...this.fields()];
    const target = idx + direction;
    if (target < 0 || target >= fs.length) return;
    [fs[idx], fs[target]] = [fs[target], fs[idx]];
    this.fields.set(fs);
  }

  /**
   * When the user changes a field's type, prune Options if the new type
   * doesn't use them. For Section, force the irrelevant flags (Required,
   * PHI) off and width to Full — those settings have no meaning on a
   * non-collecting structural row.
   */
  onTypeChange(idx: number) {
    const fs = [...this.fields()];
    const f = fs[idx];
    if (!this.usesOptions(f.type)) {
      f.options = null;
    } else if (!f.options || f.options.length === 0) {
      f.options = [{ value: '', label: '' }, { value: '', label: '' }];
    }
    if (this.isSection(f.type)) {
      f.required = false;
      f.phiFlag = false;
      f.width = FieldWidth.Full;
      f.options = null;
      f.placeholder = null;
      f.maxLength = null;
      f.minLength = null;
      f.pattern = null;
    }
    this.fields.set(fs);
  }

  addOption(fieldIdx: number) {
    const fs = [...this.fields()];
    const opts = fs[fieldIdx].options ?? [];
    fs[fieldIdx].options = [...opts, { value: '', label: '' }];
    this.fields.set(fs);
  }

  removeOption(fieldIdx: number, optIdx: number) {
    const fs = [...this.fields()];
    const opts = fs[fieldIdx].options ?? [];
    fs[fieldIdx].options = opts.filter((_, i) => i !== optIdx);
    this.fields.set(fs);
  }

  // --- Save ---

  onSave() {
    this.error.set('');
    if (!this.name.trim()) { this.error.set('Name is required.'); return; }
    if (this.fields().some(f => !f.label.trim())) {
      this.error.set('Every field needs a label.');
      return;
    }
    // Options-using fields need at least 2 options with values. Sections
    // are skipped — they have no options or validation by design.
    for (const f of this.fields()) {
      if (this.isSection(f.type)) continue;
      if (this.usesOptions(f.type)) {
        const opts = (f.options ?? []).filter(o => o.value.trim() && o.label.trim());
        if (opts.length < 2) {
          this.error.set(`Field "${f.label}" needs at least 2 options with both value and label.`);
          return;
        }
      }
    }

    const body: CreateFieldGroupRequest = {
      name: this.name.trim(),
      category: this.category.trim() || null,
      description: this.description.trim() || null,
      phiFlag: this.phiFlag,
      fields: this.fields().map(f => ({
        ...f,
        label: f.label.trim(),
        options: this.usesOptions(f.type)
          ? (f.options ?? []).filter(o => o.value.trim() && o.label.trim())
          : null
      }))
    };

    this.saving.set(true);
    const obs = this.isEdit()
      ? this.api.updateFieldGroup(this.logicalId()!, body)
      : this.api.createFieldGroup(body);
    obs.subscribe({
      next: () => this.router.navigate(['/admin/field-groups']),
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Save failed.');
        this.saving.set(false);
      }
    });
  }

  // Expose enums to the template
  FieldType = FieldType;
  FieldWidth = FieldWidth;
}
