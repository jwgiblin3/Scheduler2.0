import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppointmentStatus, MyAppointment } from '../../core/models/models';

@Component({
  selector: 'app-my-appointments',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './my-appointments.component.html',
  styleUrls: ['./my-appointments.component.scss']
})
export class MyAppointmentsComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private router = inject(Router);

  appointments = signal<MyAppointment[]>([]);
  loading = signal(true);
  error = signal('');
  /** Set to true if the GET returned 404 — the backend endpoint isn't wired. */
  endpointMissing = signal(false);

  // Split into upcoming / past for easier scanning. Wrapped in defensive array
  // checks so a malformed server response can never crash the template.
  upcoming = computed(() => {
    const list = this.appointments();
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    return list.filter(a =>
      a && a.startTime &&
      new Date(a.startTime).getTime() >= now &&
      a.status !== AppointmentStatus.Cancelled
    );
  });

  past = computed(() => {
    const list = this.appointments();
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    return list.filter(a =>
      a && a.startTime && (
        new Date(a.startTime).getTime() < now ||
        a.status === AppointmentStatus.Cancelled
      )
    );
  });

  /** Safe length that never throws even if the signal somehow held a non-array. */
  totalCount = computed(() => {
    const list = this.appointments();
    return Array.isArray(list) ? list.length : 0;
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.endpointMissing.set(false);
    this.api.getMyAppointments().subscribe({
      next: list => {
        // Normalize whatever the server sent us into a proper array.
        this.appointments.set(Array.isArray(list) ? list : []);
        this.loading.set(false);
      },
      error: err => {
        // eslint-disable-next-line no-console
        console.error('[MyAppointments] getMyAppointments failed', err);
        if (err?.status === 401) {
          this.router.navigate(['/login'], { queryParams: { returnUrl: '/my/appointments' } });
          return;
        }
        if (err?.status === 404) {
          this.endpointMissing.set(true);
        } else if (err?.status === 0) {
          this.error.set('Unable to reach the server. Please check your connection.');
        } else if (typeof err?.error === 'string' && err.error.trim()) {
          this.error.set(err.error);
        } else {
          this.error.set(`Unable to load your appointments (HTTP ${err?.status ?? '?'}). Please try again.`);
        }
        this.loading.set(false);
      }
    });
  }

  statusLabel(status: AppointmentStatus): string {
    switch (status) {
      case AppointmentStatus.Scheduled: return 'Scheduled';
      case AppointmentStatus.Completed: return 'Completed';
      case AppointmentStatus.Cancelled: return 'Cancelled';
      case AppointmentStatus.NoShow: return 'No-show';
      default: return 'Unknown';
    }
  }

  statusClass(status: AppointmentStatus): string {
    return 'status-' + this.statusLabel(status).toLowerCase().replace(/\s+/g, '-');
  }

  cancel(a: MyAppointment) {
    if (!a.cancellationToken) {
      alert('This appointment cannot be cancelled from here. Please contact the practice.');
      return;
    }
    if (!confirm(`Cancel your ${a.appointmentTypeName} with ${a.providerName}?`)) return;
    this.api.cancelAppointment(a.cancellationToken).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Cancellation failed. Please try again or contact the practice.')
    });
  }
}
