import { Component, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AppointmentType } from '../../core/models/models';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-provider-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="page">
      <a routerLink="/providers" class="back">← Back to Providers</a>
      <h1>{{ isEdit ? 'Edit Provider' : 'Add Provider' }}</h1>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="card">
        <div class="section-title">Basic Info</div>
        <div class="form-row">
          <div class="form-group">
            <label>First Name *</label>
            <input formControlName="firstName" />
          </div>
          <div class="form-group">
            <label>Last Name *</label>
            <input formControlName="lastName" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Email *</label>
            <input type="email" formControlName="email" />
          </div>
          <div class="form-group">
            <label>Phone</label>
            <input formControlName="phone" placeholder="Optional" />
          </div>
        </div>
        <div class="form-group">
          <label>Bio</label>
          <textarea formControlName="bio" rows="3" placeholder="Brief description shown to clients..."></textarea>
        </div>

        @if (isEdit) {
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" formControlName="isActive" /> Active
            </label>
          </div>
        }

        <div class="section-title">Appointment Types</div>
        <div class="appt-types">
          @for (at of apptTypes(); track at.id) {
            <label class="checkbox-label">
              <input type="checkbox" [value]="at.id" (change)="onApptTypeChange($event, at.id)" [checked]="isApptTypeSelected(at.id)" />
              {{ at.name }} ({{ at.durationMinutes }}min)
            </label>
          }
        </div>

        <div class="section-title">Weekly Availability</div>
        <div formArrayName="availabilities">
          @for (day of dayOptions; track day.value) {
            <div class="day-row">
              <label class="day-label">{{ day.label }}</label>
              <button type="button" class="btn-add-slot" (click)="addSlot(day.value)">+ Add slot</button>
              @for (ctrl of getSlotsForDay(day.value); track $index) {
                <div class="time-slot" [formGroupName]="getSlotIndex(day.value, $index)">
                  <input type="time" formControlName="startTime" class="time-input" />
                  <span>to</span>
                  <input type="time" formControlName="endTime" class="time-input" />
                  <button type="button" class="btn-remove" (click)="removeSlot(day.value, $index)">✕</button>
                </div>
              }
            </div>
          }
        </div>

        @if (error()) {
          <div class="alert-error">{{ error() }}</div>
        }

        <div class="form-actions">
          <a routerLink="/providers" class="btn btn-secondary">Cancel</a>
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Provider') }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 700px; }
    .back { color: #667eea; text-decoration: none; font-size: .85rem; display: block; margin-bottom: 1rem; }
    h1 { margin: 0 0 1.5rem; font-size: 1.4rem; color: #1a1f36; }
    .card { background: #fff; border-radius: 10px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    .section-title { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: #a0aec0; margin: 1.5rem 0 .75rem; padding-bottom: .5rem; border-bottom: 1px solid #f7f8fc; }
    .section-title:first-child { margin-top: 0; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: .85rem; font-weight: 500; color: #4a5568; margin-bottom: 4px; }
    input, textarea, select { width: 100%; padding: .6rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; box-sizing: border-box; }
    textarea { resize: vertical; }
    .checkbox-label { display: flex; align-items: center; gap: .4rem; font-size: .9rem; cursor: pointer; margin-bottom: .4rem; }
    .checkbox-label input { width: auto; }
    .appt-types { display: flex; flex-direction: column; gap: .3rem; }
    .day-row { margin-bottom: .75rem; }
    .day-label { font-size: .85rem; font-weight: 500; color: #4a5568; display: inline-block; width: 90px; }
    .btn-add-slot { background: transparent; border: 1px dashed #e2e8f0; color: #667eea; border-radius: 6px; padding: .2rem .6rem; font-size: .78rem; cursor: pointer; }
    .time-slot { display: flex; align-items: center; gap: .5rem; margin-top: .4rem; margin-left: 90px; }
    .time-input { width: 120px; padding: .4rem .5rem; }
    .btn-remove { background: transparent; border: none; color: #fc8181; cursor: pointer; font-size: 1rem; }
    .alert-error { background: #fff5f5; color: #c53030; padding: .6rem .75rem; border-radius: 6px; font-size: .85rem; margin-bottom: .75rem; }
    .form-actions { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1.5rem; }
    .btn { text-decoration: none; padding: .6rem 1.25rem; border-radius: 6px; font-size: .9rem; cursor: pointer; border: none; display: inline-block; }
    .btn-primary { background: #667eea; color: #fff; }
    .btn-secondary { border: 1.5px solid #e2e8f0; color: #4a5568; background: transparent; }
    .btn-primary:disabled { opacity: .6; }
  `]
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

  dayOptions = [0,1,2,3,4,5,6].map(v => ({ value: v, label: DAYS[v] }));

  form = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    bio: [''],
    isActive: [true],
    availabilities: this.fb.array([])
  });

  get availabilitiesArray() { return this.form.get('availabilities') as FormArray; }

  getSlotsForDay(day: number): FormGroup[] {
    return this.availabilitiesArray.controls
      .filter((c: any) => c.get('dayOfWeek')?.value === day) as FormGroup[];
  }

  getSlotIndex(day: number, slotIdx: number): number {
    let count = 0;
    for (let i = 0; i < this.availabilitiesArray.length; i++) {
      const c = this.availabilitiesArray.at(i) as FormGroup;
      if (c.get('dayOfWeek')?.value === day) {
        if (count === slotIdx) return i;
        count++;
      }
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

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!id;
    if (id) this.providerId = Number(id);

    this.api.getAppointmentTypes().subscribe(types => this.apptTypes.set(types));

    if (this.isEdit) {
      this.api.getProvider(this.providerId).subscribe(p => {
        this.form.patchValue({ firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, bio: p.bio, isActive: p.isActive });
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
