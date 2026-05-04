import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  AppointmentStatus,
  MyAppointment,
} from '../../core/models/models';

/**
 * Client-facing appointment detail page at /my/appointments/:id.
 *
 * Fetches via the existing GET /appointments/me list and finds the matching
 * row locally rather than introducing a new GET /appointments/me/:id endpoint.
 * This keeps the API surface area smaller and the page works the moment the
 * server has the per-form completion projection — no second deploy needed.
 *
 * Renders:
 *   - When/Status header
 *   - Practice + provider + appointment type
 *   - Location block (when the practice has filled in any address fields)
 *   - Documents list (full per-form breakdown with Fill out links)
 *   - Cancel / Modify actions (upcoming only)
 */
@Component({
  selector: 'app-my-appointment-detail',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './my-appointment-detail.component.html',
  styleUrls: ['./my-appointment-detail.component.scss']
})
export class MyAppointmentDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  auth = inject(AuthService);

  loading = signal(true);
  error = signal('');
  appt = signal<MyAppointment | null>(null);

  /** True when the appointment is in the future and not cancelled. */
  isUpcoming = computed(() => {
    const a = this.appt();
    if (!a) return false;
    return new Date(a.startTime).getTime() >= Date.now()
      && a.status !== AppointmentStatus.Cancelled;
  });

  /** Forms with completed flag, defensive against undefined. */
  forms = computed(() => this.appt()?.forms ?? []);

  /**
   * Single-line "123 Main St · Apt B · Springfield, IL 62701" address. Returns
   * null when the practice hasn't entered any address fields so the template
   * can suppress the entire Location block instead of rendering empty rows.
   */
  addressLine = computed(() => {
    const a = this.appt();
    if (!a) return null;
    const line1 = (a.addressLine1 ?? '').trim();
    const city  = (a.city ?? '').trim();
    const state = (a.state ?? '').trim();
    const zip   = (a.postalCode ?? '').trim();
    const cityStateZip = [
      city,
      [state, zip].filter(s => s.length > 0).join(' ')
    ].filter(s => s.length > 0).join(', ');
    const parts = [line1, cityStateZip].filter(s => s.length > 0);
    return parts.length === 0 ? null : parts.join(' · ');
  });

  /** "Open in Google Maps" URL — only relevant when we have any address bits. */
  mapsUrl = computed(() => {
    const line = this.addressLine();
    if (!line) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
  });

  statusLabel(status: AppointmentStatus): string {
    switch (status) {
      case AppointmentStatus.Scheduled: return 'Scheduled';
      case AppointmentStatus.Completed: return 'Completed';
      case AppointmentStatus.Cancelled: return 'Cancelled';
      case AppointmentStatus.NoShow:    return 'No-show';
      default: return 'Unknown';
    }
  }

  statusClass(status: AppointmentStatus): string {
    return 'status-' + this.statusLabel(status).toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * Cancel using the same path the widget uses. On success we navigate
   * back to the list, where the row will now appear under "Past &
   * cancelled". On error we surface the message inline.
   */
  cancel() {
    const a = this.appt();
    if (!a?.cancellationToken) {
      this.error.set('This appointment cannot be cancelled from here. Please contact the practice.');
      return;
    }
    if (!confirm(`Cancel your ${a.appointmentTypeName} with ${a.providerName}?`)) return;
    this.api.cancelAppointment(a.cancellationToken).subscribe({
      next: () => this.router.navigate(['/my/appointments']),
      error: () => this.error.set('Cancellation failed. Please try again or contact the practice.')
    });
  }

  ngOnInit() {
    if (!this.auth.isLoggedIn()) {
      // No silent 401 — bounce them through login back to this page.
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: this.router.url }
      });
      return;
    }

    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error.set('Invalid appointment id.');
      this.loading.set(false);
      return;
    }

    this.api.getMyAppointments().subscribe({
      next: list => {
        const found = (list ?? []).find(a => a.id === id) ?? null;
        if (!found) this.error.set("We couldn't find that appointment on your account.");
        this.appt.set(found);
        this.loading.set(false);
      },
      error: err => {
        if (err?.status === 401) {
          this.router.navigate(['/login'], {
            queryParams: { returnUrl: this.router.url }
          });
          return;
        }
        this.error.set(`Unable to load this appointment (HTTP ${err?.status ?? '?'}).`);
        this.loading.set(false);
      }
    });
  }
}
