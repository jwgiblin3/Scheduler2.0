import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { PracticeForm, IntakeFormField } from '../../core/models/models';

const FIELD_TYPES: Array<{ value: IntakeFormField['type']; label: string; hasOptions: boolean }> = [
  { value: 'text',      label: 'Short text',               hasOptions: false },
  { value: 'textarea',  label: 'Long text',                hasOptions: false },
  { value: 'radio',     label: 'Single choice (radio)',    hasOptions: true  },
  { value: 'checkbox',  label: 'Multiple choice (checkbox)', hasOptions: true  },
  { value: 'date',      label: 'Date',                     hasOptions: false },
  { value: 'signature', label: 'Signature',                hasOptions: false }
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

  /** True when the editor panel should render. */
  showEditor = computed(() => this.isNew() || this.selected() !== null);

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
    this.editFields.update(list => [...list, {
      id: randomFieldId(),
      label: '',
      type,
      required: false,
      options: needsOptions ? ['Option 1'] : undefined
    }]);
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
      return merged;
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
      .map(f => ({
        ...f,
        label: f.label.trim(),
        options: f.options ? f.options.map(o => o.trim()).filter(o => o.length > 0) : undefined
      }));
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

  ngOnInit() { this.load(); }

  private parseFields(json: string | null | undefined): IntakeFormField[] {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((f: any) => ({
        id: typeof f.id === 'string' && f.id ? f.id : randomFieldId(),
        label: String(f.label ?? ''),
        type: (FIELD_TYPES.find(t => t.value === f.type)?.value ?? 'text') as IntakeFormField['type'],
        required: Boolean(f.required),
        options: Array.isArray(f.options) ? f.options.map(String) : undefined
      }));
    } catch {
      return [];
    }
  }
}

function randomFieldId(): string {
  return Math.random().toString(36).slice(2, 10);
}
