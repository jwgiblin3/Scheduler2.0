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
  template: `
    <div class="booking-page">
      <div class="booking-header">
        <div class="header-inner">
          <div class="logo">📅 ProSchedule</div>
          @if (practice()) {
            <div class="practice-name">{{ practice()!.name }}</div>
          }
        </div>
      </div>

      @if (error()) {
        <div class="container"><div class="alert-error">{{ error() }}</div></div>
      } @else if (!practice()) {
        <div class="container loading">Loading...</div>
      } @else {
        <div class="container">
          <div class="booking-card">
            <h2>Book an Appointment</h2>

            <!-- Step 1: Select appointment type -->
            <div class="step" [class.completed]="selectedType()">
              <div class="step-header">
                <span class="step-num">1</span>
                <span class="step-label">Select Appointment Type</span>
                @if (selectedType()) { <span class="step-value">{{ selectedType()!.name }}</span> }
              </div>
              @if (!selectedType()) {
                <div class="type-list">
                  @for (t of practice()!.appointmentTypes; track t.id) {
                    <div class="type-item" (click)="selectType(t)">
                      <div class="type-name">{{ t.name }}</div>
                      <div class="type-meta">{{ t.durationMinutes }} min @if (t.description) { · {{ t.description }} }</div>
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Step 2: Select provider -->
            @if (selectedType()) {
              <div class="step" [class.completed]="selectedProvider()">
                <div class="step-header">
                  <span class="step-num">2</span>
                  <span class="step-label">Select Provider</span>
                  @if (selectedProvider()) { <span class="step-value">{{ providerName(selectedProvider()!) }}</span> }
                </div>
                @if (!selectedProvider()) {
                  <div class="provider-list">
                    <div class="provider-item" (click)="selectProvider(null)">
                      <div class="prov-name">Any Available Provider</div>
                    </div>
                    @for (p of availableProviders(); track p.id) {
                      <div class="provider-item" (click)="selectProvider(p)">
                        <div class="prov-avatar">{{ p.firstName[0] }}{{ p.lastName[0] }}</div>
                        <div>
                          <div class="prov-name">{{ p.firstName }} {{ p.lastName }}</div>
                          @if (p.bio) { <div class="prov-bio">{{ p.bio }}</div> }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Step 3: Select date & time -->
            @if (selectedProvider() !== undefined) {
              <div class="step" [class.completed]="selectedSlot()">
                <div class="step-header">
                  <span class="step-num">3</span>
                  <span class="step-label">Select Date & Time</span>
                  @if (selectedSlot()) { <span class="step-value">{{ selectedSlot()!.start | date:'EEE, MMM d · h:mm a' }}</span> }
                </div>
                @if (!selectedSlot()) {
                  <div class="date-picker">
                    <label>Date</label>
                    <input type="date" [(ngModel)]="selectedDate" [min]="minDate" (change)="loadSlots()" />
                  </div>
                  @if (loadingSlots()) {
                    <div class="slots-loading">Loading available times...</div>
                  } @else if (slots().length === 0 && selectedDate) {
                    <div class="no-slots">No available times on this date. Try another day.</div>
                  } @else {
                    <div class="slots-grid">
                      @for (slot of slots(); track slot.start) {
                        <button class="slot-btn" (click)="selectSlot(slot)">
                          {{ slot.start | date:'h:mm a' }}
                        </button>
                      }
                    </div>
                  }
                }
              </div>
            }

            <!-- Step 4: Your info -->
            @if (selectedSlot()) {
              <div class="step">
                <div class="step-header">
                  <span class="step-num">4</span>
                  <span class="step-label">Your Information</span>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label>First Name *</label>
                    <input [(ngModel)]="clientFirstName" />
                  </div>
                  <div class="form-group">
                    <label>Last Name *</label>
                    <input [(ngModel)]="clientLastName" />
                  </div>
                </div>
                <div class="form-group">
                  <label>Email *</label>
                  <input type="email" [(ngModel)]="clientEmail" />
                </div>
                <div class="form-group">
                  <label>Phone</label>
                  <input type="tel" [(ngModel)]="clientPhone" />
                </div>
                <div class="form-group">
                  <label class="checkbox-label">
                    <input type="checkbox" [(ngModel)]="smsOptIn" />
                    Text me reminders and updates
                  </label>
                </div>
                @if (bookError()) { <div class="alert-error">{{ bookError() }}</div> }
                <button class="btn-confirm" [disabled]="booking()" (click)="book()">
                  {{ booking() ? 'Booking...' : 'Confirm Appointment' }}
                </button>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .booking-page { min-height: 100vh; background: #f7f8fc; }
    .booking-header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 1rem 0; }
    .header-inner { max-width: 700px; margin: 0 auto; padding: 0 1.5rem; display: flex; align-items: center; gap: 1rem; }
    .logo { font-size: 1.2rem; font-weight: 700; color: #1a1f36; }
    .practice-name { font-size: 1rem; color: #718096; }
    .container { max-width: 700px; margin: 0 auto; padding: 2rem 1.5rem; }
    .loading, .alert-error { padding: 1.5rem; }
    .alert-error { background: #fff5f5; color: #c53030; border-radius: 8px; }
    .booking-card { background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.07); overflow: hidden; }
    h2 { margin: 0; padding: 1.5rem; border-bottom: 1px solid #f7f8fc; font-size: 1.2rem; color: #1a1f36; }
    .step { padding: 1.25rem 1.5rem; border-bottom: 1px solid #f7f8fc; }
    .step:last-child { border-bottom: none; }
    .step.completed .step-label { color: #a0aec0; text-decoration: line-through; font-size: .85rem; }
    .step-header { display: flex; align-items: center; gap: .75rem; margin-bottom: .75rem; }
    .step-num { width: 24px; height: 24px; border-radius: 50%; background: #667eea; color: #fff; display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 700; flex-shrink: 0; }
    .step-label { font-weight: 600; font-size: .95rem; }
    .step-value { margin-left: auto; font-size: .85rem; color: #667eea; font-weight: 500; }
    .type-list, .provider-list { display: flex; flex-direction: column; gap: .5rem; }
    .type-item, .provider-item { padding: .75rem 1rem; border: 1.5px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: border-color .15s; display: flex; align-items: center; gap: .75rem; }
    .type-item:hover, .provider-item:hover { border-color: #667eea; background: #f8f9ff; }
    .type-name, .prov-name { font-weight: 500; font-size: .9rem; }
    .type-meta, .prov-bio { font-size: .78rem; color: #718096; margin-top: 2px; }
    .prov-avatar { width: 36px; height: 36px; border-radius: 50%; background: #667eea; color: #fff; display: flex; align-items: center; justify-content: center; font-size: .85rem; font-weight: 700; flex-shrink: 0; }
    .date-picker { margin-bottom: 1rem; }
    .date-picker label { display: block; font-size: .85rem; font-weight: 500; color: #4a5568; margin-bottom: 4px; }
    .date-picker input { padding: .6rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; }
    .slots-loading, .no-slots { color: #718096; font-size: .85rem; }
    .slots-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: .5rem; }
    .slot-btn { padding: .5rem; border: 1.5px solid #e2e8f0; background: #fff; border-radius: 6px; cursor: pointer; font-size: .85rem; transition: all .15s; }
    .slot-btn:hover { border-color: #667eea; background: #f8f9ff; color: #667eea; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-group { margin-bottom: .85rem; }
    label { display: block; font-size: .85rem; font-weight: 500; color: #4a5568; margin-bottom: 4px; }
    input[type=text], input[type=email], input[type=tel] { width: 100%; padding: .6rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; box-sizing: border-box; }
    .checkbox-label { display: flex; align-items: center; gap: .4rem; font-size: .9rem; cursor: pointer; }
    .checkbox-label input { width: auto; }
    .btn-confirm { width: 100%; padding: .85rem; background: #667eea; color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: .5rem; }
    .btn-confirm:hover:not(:disabled) { background: #5a67d8; }
    .btn-confirm:disabled { opacity: .6; }
    .alert-error { background: #fff5f5; color: #c53030; padding: .6rem .75rem; border-radius: 6px; font-size: .85rem; margin-bottom: .75rem; }
  `]
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
