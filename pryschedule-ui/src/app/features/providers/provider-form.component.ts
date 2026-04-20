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

  dayOptions = [0,1,2,3,4,5,6].map(v => ({ value: v, label: DAYS[v] }));

  form = this.fb.group({
    displayName: ['', Validators.required],
    email: ['', Validators.email], // optional; validated only when filled
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
        this.form.patchValue({ displayName: p.displayName, email: p.email ?? '', phone: p.phone, bio: p.bio, isActive: p.isActive });
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
