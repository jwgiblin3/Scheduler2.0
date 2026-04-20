import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppointmentType } from '../../core/models/models';

@Component({
  selector: 'app-appointment-types-list',
  standalone: true,
  imports: [FormsModule],
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

  select(at: AppointmentType) {
    this.isNew.set(false);
    this.selected.set(at);
    this.editName = at.name; this.editDesc = at.description ?? '';
    this.editDuration = at.durationMinutes; this.editBufferBefore = at.bufferBeforeMinutes;
    this.editBufferAfter = at.bufferAfterMinutes; this.editRequiresIntake = at.requiresIntakeForm;
    this.editIsActive = at.isActive;
  }

  openNew() {
    this.isNew.set(true);
    this.selected.set({ id: 0, name: '', durationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, requiresIntakeForm: false, isActive: true });
    this.editName = ''; this.editDesc = ''; this.editDuration = 60;
    this.editBufferBefore = 0; this.editBufferAfter = 0;
    this.editRequiresIntake = false; this.editIsActive = true;
  }

  cancel() { this.selected.set(null); }

  save() {
    this.saving.set(true);
    const body = { name: this.editName, description: this.editDesc, durationMinutes: this.editDuration, bufferBeforeMinutes: this.editBufferBefore, bufferAfterMinutes: this.editBufferAfter, requiresIntakeForm: this.editRequiresIntake, isActive: this.editIsActive };
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
  }

  ngOnInit() { this.load(); }
}
