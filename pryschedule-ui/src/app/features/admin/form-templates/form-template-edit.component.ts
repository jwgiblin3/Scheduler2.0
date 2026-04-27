import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/services/admin-api.service';
import {
  FormTemplateDetail, FormTemplateItem, FieldGroupListItem,
  Field, FieldType, FieldWidth, CreateFormTemplateRequest
} from '../../../core/models/admin-models';

/**
 * Create / edit a global form template. The body is an ordered list of
 * items; each item is either:
 *   - a "group" reference, pinning a specific FieldGroup version, OR
 *   - an inline "field" definition (when a one-off field doesn't belong
 *     in any reusable group).
 *
 * We DON'T hand-edit groups inside this screen — to change a group's
 * fields, jump over to /admin/field-groups. This separation keeps the
 * versioning story simple: editing a template never changes the
 * referenced group.
 */
@Component({
  selector: 'app-admin-form-template-edit',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './form-template-edit.component.html',
  styleUrls: ['./form-template-edit.component.scss']
})
export class FormTemplateEditComponent implements OnInit {
  private api = inject(AdminApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  logicalId = signal<string | null>(null);
  isEdit = computed(() => !!this.logicalId());

  // Template-level fields
  name = '';
  targetAudience = 'generic';

  /** Ordered list of items — group refs and inline fields, mixed. */
  items = signal<FormTemplateItem[]>([]);

  loading = signal(false);
  saving = signal(false);
  error = signal('');

  // ---- Group picker state ----
  pickerOpen = signal(false);
  pickerLoading = signal(false);
  availableGroups = signal<FieldGroupListItem[]>([]);

  // Audience options — same as the list screen.
  audienceOptions = [
    { value: 'chiro',    label: 'Chiropractic' },
    { value: 'massage',  label: 'Massage Therapy' },
    { value: 'pt',       label: 'Personal Training' },
    { value: 'generic',  label: 'Generic' }
  ];

  // Field-type / width options for inline-field rows. Same set as the
  // field-group editor; kept in sync by hand. If we add a type there, add
  // it here too.
  fieldTypeOptions = [
    { value: FieldType.Text,          label: 'Text' },
    { value: FieldType.Textarea,      label: 'Textarea' },
    { value: FieldType.Email,         label: 'Email' },
    { value: FieldType.Phone,         label: 'Phone' },
    { value: FieldType.Number,        label: 'Number' },
    { value: FieldType.Date,          label: 'Date' },
    { value: FieldType.Select,        label: 'Select (one)' },
    { value: FieldType.Multiselect,   label: 'Multiselect' },
    { value: FieldType.Radio,         label: 'Radio buttons' },
    { value: FieldType.Checkbox,      label: 'Checkbox (yes/no)' },
    { value: FieldType.CheckboxGroup, label: 'Checkbox group' },
    { value: FieldType.Signature,     label: 'Signature (typed)' },
    { value: FieldType.BodyDiagram,   label: 'Body diagram' }
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
    }
  }

  load(id: string) {
    this.loading.set(true);
    this.api.getFormTemplate(id).subscribe({
      next: (t: FormTemplateDetail) => {
        this.name = t.name;
        this.targetAudience = t.targetAudience || 'generic';
        this.items.set(t.items);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Failed to load template.');
        this.loading.set(false);
      }
    });
  }

  // ---- Item-list mutations ----

  addInlineField() {
    const blank: FormTemplateItem = {
      kind: 'field',
      field: {
        type: FieldType.Text,
        label: '',
        required: false,
        width: FieldWidth.Full,
        phiFlag: false
      }
    };
    this.items.update(arr => [...arr, blank]);
  }

  removeItem(idx: number) {
    this.items.update(arr => arr.filter((_, i) => i !== idx));
  }

  moveItem(idx: number, direction: -1 | 1) {
    const arr = [...this.items()];
    const target = idx + direction;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    this.items.set(arr);
  }

  /** Field-type change for an inline field — prune options if not needed. */
  onInlineTypeChange(idx: number) {
    const arr = [...this.items()];
    const it = arr[idx];
    if (!it.field) return;
    if (!this.usesOptions(it.field.type)) {
      it.field.options = null;
    } else if (!it.field.options || it.field.options.length === 0) {
      it.field.options = [{ value: '', label: '' }, { value: '', label: '' }];
    }
    this.items.set(arr);
  }

  usesOptions(t: FieldType): boolean {
    return t === FieldType.Select
        || t === FieldType.Multiselect
        || t === FieldType.Radio
        || t === FieldType.CheckboxGroup;
  }

  addInlineOption(itemIdx: number) {
    const arr = [...this.items()];
    const f = arr[itemIdx].field;
    if (!f) return;
    f.options = [...(f.options ?? []), { value: '', label: '' }];
    this.items.set(arr);
  }

  removeInlineOption(itemIdx: number, optIdx: number) {
    const arr = [...this.items()];
    const f = arr[itemIdx].field;
    if (!f || !f.options) return;
    f.options = f.options.filter((_, i) => i !== optIdx);
    this.items.set(arr);
  }

  // ---- Group picker ----

  openPicker() {
    this.pickerOpen.set(true);
    if (this.availableGroups().length === 0) {
      this.pickerLoading.set(true);
      this.api.listFieldGroups().subscribe({
        next: groups => {
          // Filter out soft-deleted; admins picking groups for a fresh
          // template never want a deleted one referenced.
          this.availableGroups.set(groups.filter(g => !g.deleted));
          this.pickerLoading.set(false);
        },
        error: () => {
          this.error.set('Could not load field groups for the picker.');
          this.pickerLoading.set(false);
          this.pickerOpen.set(false);
        }
      });
    }
  }

  closePicker() { this.pickerOpen.set(false); }

  /**
   * Append a group reference to the items list. Pins the group's CURRENT
   * version at the time of pick. If the group is later edited, this
   * template will keep showing the pinned version until the admin
   * explicitly edits the template and re-picks.
   */
  pickGroup(g: FieldGroupListItem) {
    const ref: FormTemplateItem = {
      kind: 'group',
      groupLogicalId: g.logicalId,
      groupVersion: g.currentVersion,
      groupName: g.name,
      groupFieldCount: null    // server fills on next read
    };
    this.items.update(arr => [...arr, ref]);
    this.closePicker();
  }

  // ---- Save ----

  onSave() {
    this.error.set('');
    if (!this.name.trim()) { this.error.set('Name is required.'); return; }
    if (this.items().length === 0) {
      this.error.set('Add at least one item (field group or inline field) before saving.');
      return;
    }
    // Validate inline fields
    for (const it of this.items()) {
      if (it.kind === 'field') {
        if (!it.field || !it.field.label.trim()) {
          this.error.set('Every inline field needs a label.');
          return;
        }
        if (this.usesOptions(it.field.type)) {
          const opts = (it.field.options ?? []).filter(o => o.value.trim() && o.label.trim());
          if (opts.length < 2) {
            this.error.set(`Inline field "${it.field.label}" needs at least 2 options with both value and label.`);
            return;
          }
        }
      }
    }

    const body: CreateFormTemplateRequest = {
      name: this.name.trim(),
      targetAudience: this.targetAudience.trim().toLowerCase() || 'generic',
      items: this.items().map(it => {
        if (it.kind !== 'field' || !it.field) return it;
        return {
          ...it,
          field: {
            ...it.field,
            label: it.field.label.trim(),
            options: this.usesOptions(it.field.type)
              ? (it.field.options ?? []).filter(o => o.value.trim() && o.label.trim())
              : null
          }
        };
      })
    };

    this.saving.set(true);
    const obs = this.isEdit()
      ? this.api.updateFormTemplate(this.logicalId()!, body)
      : this.api.createFormTemplate(body);
    obs.subscribe({
      next: () => this.router.navigate(['/admin/form-templates']),
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
