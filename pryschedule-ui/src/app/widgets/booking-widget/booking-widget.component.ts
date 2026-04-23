import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppointmentType, AvailableSlot, BookingInfo, PublicProvider } from '../../core/models/models';

/**
 * Body-only booking flow (steps 1–4). Contains all state and logic; no
 * header / footer chrome. Used both by the hosted /book/:slug page (wrapped
 * in an outer header) and by the embeddable /widget/book/:slug route (no
 * chrome at all) so a third-party site can iframe it.
 *
 * The slug can either be passed explicitly via @Input() or resolved from
 * the current route, so the same widget works in both contexts.
 */
@Component({
  selector: 'app-booking-widget',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './booking-widget.component.html',
  styleUrls: ['./booking-widget.component.scss']
})
export class BookingWidgetComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  auth = inject(AuthService);

  /** Practice slug. If not supplied as an input, we read it from the route. */
  @Input() slug?: string;

  /** Resolved slug — input wins, else ActivatedRoute :slug param. */
  private resolvedSlug = '';
  get bookingSlug(): string { return this.slug ?? this.resolvedSlug; }

  practice = signal<BookingInfo | null>(null);
  error = signal('');

  selectedType = signal<AppointmentType | null>(null);
  selectedProvider = signal<PublicProvider | null | undefined>(undefined);

  // Week picker — start on tomorrow so the visible week shows future days.
  // The backend filters out slots that are already in the past.
  weekStart = signal<Date>((() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Align to Sunday of the current week.
    d.setDate(d.getDate() - d.getDay());
    return d;
  })());

  slots = signal<AvailableSlot[]>([]);
  loadingSlots = signal(false);
  selectedSlot = signal<AvailableSlot | null>(null);

  // Earliest available slot — displayed prominently above the grid.
  nextAvailableSlot = computed<AvailableSlot | null>(() => {
    const all = this.slots();
    return all.length ? all[0] : null;
  });

  // Slots grouped by YYYY-MM-DD so we can render a chip list by day.
  slotsByDay = computed(() => {
    const groups = new Map<string, AvailableSlot[]>();
    for (const slot of this.slots()) {
      const d = new Date(slot.start);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(slot);
    }
    // Ensure all 7 days of the visible week appear, even if empty.
    const week = this.currentDateRange();
    const ordered: Array<{ date: string; slots: AvailableSlot[] }> = [];
    for (const key of week) {
      ordered.push({ date: key, slots: groups.get(key) ?? [] });
    }
    return ordered;
  });

  // Human-readable range label (e.g. "Sun, Apr 19 – Sat, Apr 25").
  dateRangeLabel = computed(() => {
    const range = this.currentDateRange();
    if (range.length === 0) return '';
    const first = new Date(range[0] + 'T00:00:00');
    const last = new Date(range[range.length - 1] + 'T00:00:00');
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return `${fmt(first)} – ${fmt(last)}`;
  });

  // Optional phone override and SMS opt-in captured at booking time. Name /
  // email come from the signed-in user's session (no guest bookings).
  clientPhone = '';
  smsOptIn = false;
  booking = signal(false);
  bookError = signal('');

  allProviders() { return this.practice()?.providers ?? []; }

  initials(name: string): string {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  providerName(p: PublicProvider | null) {
    return p ? p.displayName : 'Any Available';
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
    // Start on the week containing tomorrow so we're fetching future days.
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const weekStart = new Date(tomorrow);
    weekStart.setDate(tomorrow.getDate() - tomorrow.getDay());
    this.weekStart.set(weekStart);
    this.loadSlotsForCurrentView();
  }

  /** Click handler for chip / Next Available card. */
  selectSlot(s: AvailableSlot) {
    this.selectedSlot.set(s);
  }

  clearSlot() {
    this.selectedSlot.set(null);
    this.loadSlotsForCurrentView();
  }

  /** "Change" button for step 1 — back to the type picker, resets downstream choices. */
  editType() {
    this.selectedType.set(null);
    this.selectedProvider.set(undefined);
    this.selectedSlot.set(null);
    this.slots.set([]);
  }

  /** "Change" button for step 2 — back to the provider picker, resets downstream choices. */
  editProvider() {
    this.selectedProvider.set(undefined);
    this.selectedSlot.set(null);
    this.slots.set([]);
  }

  /** "Change" button for step 3 — back to the time picker. */
  editSlot() {
    this.clearSlot();
  }

  prevWeek() {
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() - 7);
    this.weekStart.set(d);
    this.loadSlotsForCurrentView();
  }

  nextWeek() {
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() + 7);
    this.weekStart.set(d);
    this.loadSlotsForCurrentView();
  }

  /**
   * Load availability for every day in the currently visible week.
   * The backend endpoint is per-day, so we fan out across the 7 days × N providers.
   */
  private loadSlotsForCurrentView() {
    const type = this.selectedType();
    const providerCandidate = this.selectedProvider();
    if (!type || providerCandidate === undefined) return;

    // Specific provider OR all providers that offer this service. If the admin
    // hasn't linked any providers yet, fall back to all active providers so the
    // picker isn't empty because of missing wiring.
    let candidates: PublicProvider[];
    if (providerCandidate) {
      candidates = [providerCandidate];
    } else {
      const linked = this.allProviders().filter(p => p.appointmentTypeIds.includes(type.id));
      candidates = linked.length > 0 ? linked : this.allProviders();
    }

    if (candidates.length === 0) {
      this.slots.set([]);
      return;
    }

    const range = this.currentDateRange();
    this.loadingSlots.set(true);

    const requests = [] as Array<ReturnType<typeof this.api.getAvailability>>;
    for (const d of range) {
      for (const p of candidates) {
        requests.push(
          this.api.getAvailability(p.id, type.id, d).pipe(catchError(() => of([] as AvailableSlot[])))
        );
      }
    }

    forkJoin(requests)
      .pipe(finalize(() => this.loadingSlots.set(false)))
      .subscribe({
        next: results => {
          // Union + dedupe by start time (handles "Any Available" overlap).
          const merged = new Map<string, AvailableSlot>();
          for (const list of results) {
            for (const slot of list) {
              if (!merged.has(slot.start)) merged.set(slot.start, slot);
            }
          }
          this.slots.set([...merged.values()].sort((a, b) => a.start.localeCompare(b.start)));
        },
        error: () => this.slots.set([])
      });
  }

  /** The 7 YYYY-MM-DD strings visible in the current week. */
  currentDateRange(): string[] {
    const base = new Date(this.weekStart());
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    // Local date string — do NOT use toISOString() (it shifts by UTC offset).
    return days.map(d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    });
  }

  /** Current return URL to preserve booking context across login/register. */
  returnUrl(): string {
    return `/book/${this.bookingSlug}`;
  }

  book() {
    // No guest bookings — the user must be signed in before step 4 is even visible.
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl() } });
      return;
    }

    const user = this.auth.currentUser()!;
    this.booking.set(true);
    const provider = this.selectedProvider();
    const providerId = provider?.id
      ?? this.allProviders().find(p => p.appointmentTypeIds.includes(this.selectedType()!.id))?.id;

    this.api.bookAppointment(this.bookingSlug, {
      providerId,
      appointmentTypeId: this.selectedType()!.id,
      startTime: this.selectedSlot()!.start,
      // Client identity comes from the JWT on the server; these fields are
      // sent for legacy backends that still read from the body. The server
      // should trust the authenticated user over these values.
      clientFirstName: user.firstName,
      clientLastName: user.lastName,
      clientEmail: user.email,
      clientPhone: this.clientPhone || user.phone || '',
      smsOptIn: this.smsOptIn
    }).subscribe({
      next: res => {
        // Now that we've booked, the user has client appointments — update
        // the cached session so /home and the nav show the right cards.
        this.auth.patchUser({ hasClientAppointments: true });
        this.router.navigate([`/book/${this.bookingSlug}/confirm`], {
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
    // Prefer the input-supplied slug; otherwise resolve from the active route.
    this.resolvedSlug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!this.bookingSlug) {
      this.error.set('Missing practice slug.');
      return;
    }
    this.api.getPublicPractice(this.bookingSlug).subscribe({
      next: data => this.practice.set(data),
      error: () => this.error.set('Practice not found. Please check your booking link.')
    });
  }
}
