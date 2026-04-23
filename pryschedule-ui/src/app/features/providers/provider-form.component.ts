import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AppointmentType } from '../../core/models/models';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-provider-form',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './provider-form.component.html',
  styleUrls: ['./provider-form.component.scss']
})
export class ProviderFormComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  isEdit = false;
  providerId = 0;
  apptTypes = signal<AppointmentType[]>([]);
  selectedApptTypeIds: number[] = [];
  saving = signal(false);
  error = signal('');

  // --- Exceptions editor ---
  // Loaded on entry to the edit form; new exceptions can only be added after
  // the provider has been created and has an id.
  exceptions = signal<{ id: number; startDate: string; endDate: string; reason: string | null }[]>([]);
  newExceptionStart = '';
  newExceptionEnd = '';
  newExceptionReason = '';
  savingException = signal(false);
  exceptionError = signal('');

  dayOptions = [0,1,2,3,4,5,6].map(v => ({ value: v, label: DAYS[v] }));

  form = this.fb.group({
    displayName: ['', Validators.required],
    email: ['', Validators.email], // optional; validated only when filled
    phone: [''],
    description: [''],
    isActive: [true],
    availabilities: this.fb.array([])
  });

  get availabilitiesArray() { return this.form.get('availabilities') as FormArray; }

  getSlotsForDay(day: number): FormGroup[] {
    // Sort by startTime so the UI always renders slots in chronological order,
    // regardless of the order the user added them or the server returned them.
    return (this.availabilitiesArray.controls
      .filter((c: any) => c.get('dayOfWeek')?.value === day) as FormGroup[])
      .slice()
      .sort((a, b) => {
        const aStart = (a.get('startTime')?.value ?? '') as string;
        const bStart = (b.get('startTime')?.value ?? '') as string;
        return aStart.localeCompare(bStart);
      });
  }

  getSlotIndex(day: number, slotIdx: number): number {
    // slotIdx is an index into the *sorted* slots for this day (the UI's view).
    // Walk the same sorted list, then find that FormGroup's index in the raw
    // FormArray so add/remove still target the right control.
    const sorted = this.getSlotsForDay(day);
    if (slotIdx < 0 || slotIdx >= sorted.length) return -1;
    const target = sorted[slotIdx];
    for (let i = 0; i < this.availabilitiesArray.length; i++) {
      if (this.availabilitiesArray.at(i) === target) return i;
    }
    return -1;
  }

  addSlot(day: number) {
    this.availabilitiesArray.push(this.fb.group({
      dayOfWeek: [day],
      startTime: ['09:00'],
      endTime: ['17:00'],
      isActive: [true]
    }));
  }

  removeSlot(day: number, slotIdx: number) {
    const idx = this.getSlotIndex(day, slotIdx);
    if (idx >= 0) this.availabilitiesArray.removeAt(idx);
  }

  isApptTypeSelected(id: number) { return this.selectedApptTypeIds.includes(id); }

  onApptTypeChange(event: Event, id: number) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) { if (!this.selectedApptTypeIds.includes(id)) this.selectedApptTypeIds.push(id); }
    else { this.selectedApptTypeIds = this.selectedApptTypeIds.filter(x => x !== id); }
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value as any;

    const payload = {
      ...v,
      appointmentTypeIds: this.selectedApptTypeIds,
      availabilities: v.availabilities
    };

    const obs = this.isEdit
      ? this.api.updateProvider(this.providerId, payload)
      : this.api.createProvider(payload);

    obs.subscribe({
      next: () => this.router.navigate(['/providers']),
      error: err => {
        this.error.set(err.error || 'Save failed.');
        this.saving.set(false);
      }
    });
  }

  // --- Exceptions actions ---

  addException() {
    this.exceptionError.set('');
    if (!this.newExceptionStart) { this.exceptionError.set('Start date is required.'); return; }
    if (!this.isEdit || !this.providerId) {
      this.exceptionError.set('Save the provider first before adding exceptions.');
      return;
    }
    const end = this.newExceptionEnd || this.newExceptionStart;
    this.savingException.set(true);
    this.api.createProviderException(this.providerId, {
      startDate: this.newExceptionStart,
      endDate: end,
      reason: this.newExceptionReason || null
    }).subscribe({
      next: row => {
        this.exceptions.update(rows => [...rows, row].sort((a, b) => a.startDate.localeCompare(b.startDate)));
        this.newExceptionStart = '';
        this.newExceptionEnd = '';
        this.newExceptionReason = '';
        this.savingException.set(false);
      },
      error: err => {
        this.exceptionError.set(typeof err.error === 'string' ? err.error : 'Could not add exception.');
        this.savingException.set(false);
      }
    });
  }

  removeException(id: number) {
    if (!confirm('Remove this out-of-office entry?')) return;
    this.api.deleteProviderException(this.providerId, id).subscribe({
      next: () => this.exceptions.update(rows => rows.filter(r => r.id !== id)),
      error: () => this.exceptionError.set('Could not delete.')
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!id;
    if (id) this.providerId = Number(id);

    this.api.getAppointmentTypes().subscribe(types => this.apptTypes.set(types));

    if (this.isEdit) {
      this.api.getProviderExceptions(this.providerId).subscribe(rows => this.exceptions.set(rows));
      this.api.getProvider(this.providerId).subscribe(p => {
        this.form.patchValue({ displayName: p.displayName, email: p.email ?? '', phone: p.phone, description: p.description, isActive: p.isActive });
        this.selectedApptTypeIds = [...p.appointmentTypeIds];
        p.availabilities.forEach(a => {
          this.availabilitiesArray.push(this.fb.group({
            id: [a.id],
            dayOfWeek: [a.dayOfWeek],
            startTime: [a.startTime.substring(0, 5)],
            endTime: [a.endTime.substring(0, 5)],
            isActive: [a.isActive]
          }));
        });
      });
    }
  }
}
