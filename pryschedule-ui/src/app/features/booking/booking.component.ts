import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AppointmentType, AvailableSlot, BookingInfo, PublicProvider } from '../../core/models/models';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './booking.component.html',
  styleUrl: './booking.component.scss'
})
export class BookingComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  practice = signal<BookingInfo | null>(null);
  error = signal('');

  selectedType = signal<AppointmentType | null>(null);
  selectedProvider = signal<PublicProvider | null | undefined>(undefined);
  selectedDate = '';
  slots = signal<AvailableSlot[]>([]);
  loadingSlots = signal(false);
  selectedSlot = signal<AvailableSlot | null>(null);

  clientFirstName = ''; clientLastName = ''; clientEmail = ''; clientPhone = ''; smsOptIn = false;
  booking = signal(false);
  bookError = signal('');

  get slug() { return this.route.snapshot.paramMap.get('slug')!; }
  get minDate() { return new Date().toISOString().split('T')[0]; }

  availableProviders() {
    if (!this.selectedType() || !this.practice()) return [];
    return this.practice()!.providers.filter(p =>
      p.appointmentTypeIds.includes(this.selectedType()!.id)
    );
  }

  providerName(p: PublicProvider | null) {
    return p ? `${p.firstName} ${p.lastName}` : 'Any Available';
  }

  selectType(t: AppointmentType) {
    this.selectedType.set(t);
    this.selectedProvider.set(undefined);
    this.selectedSlot.set(null);
    this.slots.set([]);
  }

  selectProvider(p: PublicProvider | null) {
    this.selectedProvider.set(p);
    this.selectedSlot.set(null);
    this.slots.set([]);
    if (this.selectedDate) this.loadSlots();
  }

  loadSlots() {
    if (!this.selectedDate || !this.selectedType() || this.selectedProvider() === undefined) return;
    const provider = this.selectedProvider();
    const providerId = provider?.id ?? this.availableProviders()[0]?.id;
    if (!providerId) return;
    this.loadingSlots.set(true);
    this.api.getAvailability(providerId, this.selectedType()!.id, this.selectedDate).subscribe({
      next: s => { this.slots.set(s); this.loadingSlots.set(false); },
      error: () => this.loadingSlots.set(false)
    });
  }

  selectSlot(slot: AvailableSlot) { this.selectedSlot.set(slot); }

  book() {
    if (!this.clientFirstName || !this.clientLastName || !this.clientEmail) {
      this.bookError.set('Please fill in all required fields.');
      return;
    }
    this.booking.set(true);
    const provider = this.selectedProvider();
    const providerId = provider?.id ?? this.availableProviders()[0]?.id;

    this.api.bookAppointment(this.slug, {
      providerId,
      appointmentTypeId: this.selectedType()!.id,
      startTime: this.selectedSlot()!.start,
      clientFirstName: this.clientFirstName,
      clientLastName: this.clientLastName,
      clientEmail: this.clientEmail,
      clientPhone: this.clientPhone,
      smsOptIn: this.smsOptIn
    }).subscribe({
      next: res => {
        this.router.navigate([`/book/${this.slug}/confirm`], {
          queryParams: {
            apptId: res.id,
            token: res.cancellationToken,
            start: res.startTime,
            end: res.endTime,
            needsIntake: res.requiresIntakeForm,
            apptTypeId: this.selectedType()!.id
          }
        });
      },
      error: err => {
        this.bookError.set(err.error || 'Booking failed. Please try again.');
        this.booking.set(false);
      }
    });
  }

  ngOnInit() {
    this.api.getPublicPractice(this.slug).subscribe({
      next: data => this.practice.set(data),
      error: () => this.error.set('Practice not found. Please check your booking link.')
    });
  }
}
