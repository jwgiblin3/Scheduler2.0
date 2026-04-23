import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppointmentStatus, MyAppointment } from '../../core/models/models';

/**
 * Body-only "My Appointments" list. No header/footer. When the visitor is
 * not signed in — or a call returns 401 — we render an inline sign-in panel
 * instead of redirecting, so the widget stays self-contained inside an
 * iframe embed on a third-party site.
 */
@Component({
  selector: 'app-my-appointments-widget',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './my-appointments-widget.component.html',
  styleUrls: ['./my-appointments-widget.component.scss']
})
export class MyAppointmentsWidgetComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  appointments = signal<MyAppointment[]>([]);
  loading = signal(true);
  error = signal('');
  /** Set to true if the GET returned 404 — the backend endpoint isn't wired. */
  endpointMissing = signal(false);
  /** Set to true if the GET returned 401 — show an inline sign-in prompt
   *  instead of redirecting (so iframe embeds stay intact). */
  needsSignIn = signal(false);
  /** Raw server response body for non-401/404 errors, surfaced to the user so
   * they can share the exact backend complaint when debugging a 400/500. */
  errorDetails = signal('');

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
    // Not logged in → skip the network round-trip and just show the inline
    // sign-in prompt. Saves a guaranteed-401 request.
    if (!this.auth.isLoggedIn()) {
      this.needsSignIn.set(true);
      this.loading.set(false);
      return;
    }
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.errorDetails.set('');
    this.endpointMissing.set(false);
    this.needsSignIn.set(false);
    this.api.getMyAppointments().subscribe({
      next: list => {
        // Normalize whatever the server sent us into a proper array.
        this.appointments.set(Array.isArray(list) ? list : []);
        this.loading.set(false);
      },
      error: err => {
        // eslint-disable-next-line no-console
        console.error('[MyAppointmentsWidget] getMyAppointments failed', err);
        if (err?.status === 401) {
          // Embedded in an iframe? Don't break out with router.navigate —
          // show the inline prompt instead. The "Sign in" link in the prompt
          // uses target="_top" so it opens in the parent window on click.
          this.needsSignIn.set(true);
        } else if (err?.status === 404) {
          this.endpointMissing.set(true);
        } else if (err?.status === 0) {
          this.error.set('Unable to reach the server. Please check your connection.');
        } else {
          this.error.set(`Unable to load your appointments (HTTP ${err?.status ?? '?'}).`);
          this.errorDetails.set(this.extractErrorBody(err));
        }
        this.loading.set(false);
      }
    });
  }

  /**
   * Pulls the most informative human-readable string out of an HttpErrorResponse.
   * ASP.NET Core ProblemDetails JSON typically has { title, detail, errors }.
   * If the body is a plain string we show it as-is.
   */
  private extractErrorBody(err: any): string {
    if (!err) return '';
    const body = err.error;
    if (!body) return '';
    if (typeof body === 'string') return body.trim();
    if (typeof body === 'object') {
      const parts: string[] = [];
      if (body.title) parts.push(String(body.title));
      if (body.detail) parts.push(String(body.detail));
      if (body.errors && typeof body.errors === 'object') {
        for (const [k, v] of Object.entries(body.errors)) {
          const msgs = Array.isArray(v) ? v.join('; ') : String(v);
          parts.push(`${k}: ${msgs}`);
        }
      }
      if (body.message) parts.push(String(body.message));
      if (parts.length === 0) {
        try { return JSON.stringify(body, null, 2); } catch { return ''; }
      }
      return parts.join('\n');
    }
    return '';
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
