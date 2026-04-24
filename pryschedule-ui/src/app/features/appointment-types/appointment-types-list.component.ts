import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppointmentType, PracticeForm } from '../../core/models/models';

@Component({
  selector: 'app-appointment-types-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './appointment-types-list.component.html',
  styleUrls: ['./appointment-types-list.component.scss']
})
export class AppointmentTypesListComponent implements OnInit {
  private api = inject(ApiService);

  types = signal<AppointmentType[]>([]);
  selected = signal<AppointmentType | null>(null);
  isNew = signal(false);
  saving = signal(false);
  error = signal('');

  editName = ''; editDesc = ''; editDuration = 60;
  editBufferBefore = 0; editBufferAfter = 0;
  editRequiresIntake = false; editIsActive = true;

  // -------- Form attachments --------
  //
  // Forms live in a practice-level library (see /forms). Admin attaches any
  // subset of those forms to this appointment type via checkboxes. When the
  // list of attached forms changes, requiresIntakeForm is kept in sync so
  // older code paths that read only that flag stay correct.
  availableForms = signal<PracticeForm[]>([]);
  attachedFormIds = signal<number[]>([]);

  readonly sortedAttachedForms = computed(() => {
    const ids = this.attachedFormIds();
    const byId = new Map(this.availableForms().map(f => [f.id, f]));
    return ids.map(id => byId.get(id)).filter((f): f is PracticeForm => !!f);
  });

  select(at: AppointmentType) {
    this.isNew.set(false);
    this.selected.set(at);
    this.editName = at.name; this.editDesc = at.description ?? '';
    this.editDuration = at.durationMinutes; this.editBufferBefore = at.bufferBeforeMinutes;
    this.editBufferAfter = at.bufferAfterMinutes; this.editRequiresIntake = at.requiresIntakeForm;
    this.editIsActive = at.isActive;
    this.attachedFormIds.set(at.formIds ? [...at.formIds] : []);
  }

  openNew() {
    this.isNew.set(true);
    this.selected.set({ id: 0, name: '', durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, requiresIntakeForm: false, isActive: true });
    this.editName = ''; this.editDesc = ''; this.editDuration = 60;
    this.editBufferBefore = 0; this.editBufferAfter = 0;
    this.editRequiresIntake = false; this.editIsActive = true;
    this.attachedFormIds.set([]);
  }

  cancel() { this.selected.set(null); }

  isFormAttached(formId: number): boolean {
    return this.attachedFormIds().includes(formId);
  }

  toggleForm(formId: number, attached: boolean) {
    this.attachedFormIds.update(list => {
      const filtered = list.filter(id => id !== formId);
      return attached ? [...filtered, formId] : filtered;
    });
    // Auto-update the legacy flag so older booking-confirm / badge logic
    // reflects whether any forms are attached.
    this.editRequiresIntake = this.attachedFormIds().length > 0;
  }

  moveAttached(formId: number, direction: -1 | 1) {
    this.attachedFormIds.update(list => {
      const idx = list.indexOf(formId);
      if (idx < 0) return list;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= list.length) return list;
      const copy = list.slice();
      const [item] = copy.splice(idx, 1);
      copy.splice(newIdx, 0, item);
      return copy;
    });
  }

  save() {
    this.saving.set(true);
    const formIds = this.attachedFormIds();
    const body: any = {
      name: this.editName,
      description: this.editDesc,
      durationMinutes: this.editDuration,
      bufferBeforeMinutes: this.editBufferBefore,
      bufferAfterMinutes: this.editBufferAfter,
      requiresIntakeForm: this.editRequiresIntake || formIds.length > 0,
      isActive: this.editIsActive,
      formIds
    };
    const obs = this.isNew()
      ? this.api.createAppointmentType(body)
      : this.api.updateAppointmentType(this.selected()!.id, body);

    obs.subscribe({
      next: () => { this.saving.set(false); this.selected.set(null); this.load(); },
      error: err => { this.error.set(err.error || 'Save failed.'); this.saving.set(false); }
    });
  }

  load() {
    this.api.getAppointmentTypes().subscribe(data => this.types.set(data));
    this.api.getForms().subscribe(data => this.availableForms.set(data));
  }

  ngOnInit() { this.load(); }
}
