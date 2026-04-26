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

  // Week picker — rolling 7-day window that always starts on today.
  // Past days are never shown; prevWeek() clamps to today so users can't
  // page back into the past.
  weekStart = signal<Date>(todayAtMidnight());

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
  // SMS reminders default ON — patients overwhelmingly want them; opt-out
  // is friendlier than opt-in.
  clientPhone = '';
  smsOptIn = true;
  booking = signal(false);
  bookError = signal('');

  // ---- Reschedule mode --------------------------------------------------
  //
  // When the booking page is opened from "Modify" on /my/appointments, the
  // URL carries ?reschedule=<token> plus context about the existing booking.
  // In this mode the API call switches from POST /book to POST /reschedule
  // (which keeps the same provider/type and just moves the start time), and
  // the UI shows a banner so the user knows they're not booking a brand-new
  // appointment.
  rescheduleToken = signal<string | null>(null);
  rescheduleOriginal = signal<{ start: string; type: string; provider: string } | null>(null);
  isReschedule = computed(() => !!this.rescheduleToken());

  // ---- Availability alert modal ("notify me if earlier slot opens") ----
  //
  // Preferences shape (PreferencesJson on the backend):
  //   {
  //     anyDay: bool,
  //     days: {
  //       sunday: {
  //         enabled:           bool,
  //         startTime:         "HH:MM" | "",   // general window start
  //         endTime:           "HH:MM" | "",   // general window end
  //         specificStartTime: "HH:MM" | "",   // narrower preferred slot start
  //         specificEndTime:   "HH:MM" | ""    // narrower preferred slot end
  //       }, ...
  //     }
  //   }
  //
  // The general [startTime, endTime] range is the outer window the client will
  // accept; the specific pair lets them call out a sweet-spot inside it (e.g.
  // "I'll take 9-5 Monday, but I REALLY want 12:00-13:00 if it opens up").
  alertModalOpen = signal(false);
  alertSubmitting = signal(false);
  alertError = signal('');
  alertSubmitted = signal(false);
  alertName = '';
  alertEmail = '';
  alertPhone = '';
  alertAnyDay = true;
  // Day keys match what the server expects, lowercase English day names.
  readonly alertDayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

  /** Default general window — "business hours" so the user only needs to tweak exceptions. */
  private readonly DEFAULT_START = '09:00';
  private readonly DEFAULT_END = '17:00';

  alertDays: Record<string, {
    enabled: boolean;
    startTime: string;
    endTime: string;
    specificStartTime: string;
    specificEndTime: string;
  }> = {
    sunday:    this.freshDay(),
    monday:    this.freshDay(),
    tuesday:   this.freshDay(),
    wednesday: this.freshDay(),
    thursday:  this.freshDay(),
    friday:    this.freshDay(),
    saturday:  this.freshDay()
  };

  private freshDay() {
    return {
      enabled: false,
      startTime: this.DEFAULT_START,
      endTime: this.DEFAULT_END,
      specificStartTime: '',
      specificEndTime: ''
    };
  }

  /** Human labels for the day-of-week column headers in the modal. */
  readonly alertDayLabels: Record<string, string> = {
    sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday',
    wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday'
  };

  openAlertModal() {
    // Prefill with the signed-in user's identity if we have it; the form
    // still works for unauthenticated visitors who type their own name/email.
    const user = this.auth.currentUser();
    this.alertName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
    this.alertEmail = user?.email ?? '';
    this.alertPhone = user?.phone ?? '';
    this.alertError.set('');
    this.alertSubmitted.set(false);
    this.alertModalOpen.set(true);
  }

  closeAlertModal() {
    this.alertModalOpen.set(false);
  }

  /** Flipping "any day" off doesn't erase per-day selections — preserves intent if the user toggles back. */
  toggleAnyDay(value: boolean) {
    this.alertAnyDay = value;
  }

  submitAlert() {
    if (!this.selectedType()) return;
    const name = this.alertName.trim();
    const email = this.alertEmail.trim();
    if (!name) { this.alertError.set('Please enter your name.'); return; }
    if (!email || !email.includes('@')) { this.alertError.set('Please enter a valid email.'); return; }

    // Validate: must have anyDay OR at least one enabled day with a valid
    // start/end window. "Specific" times are optional, so they're not
    // required for a submission to be valid.
    if (!this.alertAnyDay) {
      const anyDayPicked = this.alertDayKeys.some(k => this.alertDays[k].enabled);
      if (!anyDayPicked) {
        this.alertError.set('Enable at least one day, or choose "Any day".');
        return;
      }
      // Per-day sanity check — end time must be after start time.
      for (const k of this.alertDayKeys) {
        const d = this.alertDays[k];
        if (!d.enabled) continue;
        if (!d.startTime || !d.endTime) {
          this.alertError.set(`${this.alertDayLabels[k]}: please set both a start and end time.`);
          return;
        }
        if (d.startTime >= d.endTime) {
          this.alertError.set(`${this.alertDayLabels[k]}: end time must be after start time.`);
          return;
        }
        // If the user filled one half of the "specific" pair, require the other.
        const hasSpecStart = !!d.specificStartTime;
        const hasSpecEnd = !!d.specificEndTime;
        if (hasSpecStart !== hasSpecEnd) {
          this.alertError.set(`${this.alertDayLabels[k]}: specific time needs both a start and an end, or neither.`);
          return;
        }
        if (hasSpecStart && hasSpecEnd && d.specificStartTime >= d.specificEndTime) {
          this.alertError.set(`${this.alertDayLabels[k]}: specific end time must be after specific start time.`);
          return;
        }
      }
    }

    const preferences = {
      anyDay: this.alertAnyDay,
      days: this.alertDayKeys.reduce<Record<string, unknown>>((acc, k) => {
        const d = this.alertDays[k];
        acc[k] = {
          enabled: d.enabled,
          startTime: d.startTime,
          endTime: d.endTime,
          specificStartTime: d.specificStartTime,
          specificEndTime: d.specificEndTime
        };
        return acc;
      }, {})
    };

    const provider = this.selectedProvider();
    this.alertSubmitting.set(true);
    this.alertError.set('');
    this.api.createAvailabilityAlert(this.bookingSlug, {
      appointmentTypeId: this.selectedType()!.id,
      providerId: provider?.id ?? null,
      clientName: name,
      email,
      phone: this.alertPhone.trim() || null,
      preferencesJson: JSON.stringify(preferences)
    }).subscribe({
      next: () => {
        this.alertSubmitting.set(false);
        this.alertSubmitted.set(true);
      },
      error: err => {
        this.alertSubmitting.set(false);
        this.alertError.set(err?.error || 'Could not save your alert. Please try again.');
      }
    });
  }

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
    this.persistDraft();
  }

  selectProvider(p: PublicProvider | null) {
    this.selectedProvider.set(p);
    this.selectedSlot.set(null);
    this.slots.set([]);
    // Reset the week to today whenever a new provider is picked — avoids
    // carrying a stale "next week" view forward when the user changes their mind.
    this.weekStart.set(todayAtMidnight());
    this.loadSlotsForCurrentView();
    this.persistDraft();
  }

  /** Click handler for chip / Next Available card. */
  selectSlot(s: AvailableSlot) {
    this.selectedSlot.set(s);
    this.persistDraft();
  }

  clearSlot() {
    this.selectedSlot.set(null);
    this.loadSlotsForCurrentView();
    this.persistDraft();
  }

  /** "Change" button for step 1 — back to the type picker, resets downstream choices. */
  editType() {
    this.selectedType.set(null);
    this.selectedProvider.set(undefined);
    this.selectedSlot.set(null);
    this.slots.set([]);
    this.persistDraft();
  }

  /** "Change" button for step 2 — back to the provider picker, resets downstream choices. */
  editProvider() {
    this.selectedProvider.set(undefined);
    this.selectedSlot.set(null);
    this.slots.set([]);
    this.persistDraft();
  }

  /** "Change" button for step 3 — back to the time picker. */
  editSlot() {
    this.clearSlot();
  }

  // ---- Booking draft persistence ---------------------------------------
  //
  // Booking selections live in component-local signals which means they're
  // wiped whenever Angular tears the component down — including when the
  // user clicks "Sign in as someone else" (which navigates to /login and
  // back). To keep the picks across that round trip we mirror them into
  // sessionStorage, keyed by the practice slug, and restore them in
  // ngOnInit. sessionStorage (not localStorage) is correct here: it dies
  // when the tab closes, which matches how long a half-finished booking
  // should reasonably hang around.
  private draftKey(): string { return `booking-draft:${this.bookingSlug}`; }

  private persistDraft() {
    if (!this.bookingSlug) return;
    // We deliberately persist only practice-level picks (type/provider/slot),
    // NOT clientPhone or smsOptIn. Those are per-user and shouldn't carry
    // across a "sign in as someone else" round trip — the new user gets
    // their own phone pre-filled and the SMS default re-applied.
    try {
      const draft = {
        typeId: this.selectedType()?.id ?? null,
        providerId: this.selectedProvider() === undefined
          ? undefined                                       // not picked yet
          : (this.selectedProvider()?.id ?? null),          // null = Any Available
        slotStart: this.selectedSlot()?.start ?? null
      };
      sessionStorage.setItem(this.draftKey(), JSON.stringify(draft));
    } catch { /* sessionStorage unavailable (privacy mode); ignore */ }
  }

  /**
   * Rehydrate a saved draft after the practice + appointment types have
   * loaded. Caller must pass the loaded `BookingInfo` so we can resolve the
   * type and provider IDs back to the actual objects.
   */
  private restoreDraft(info: BookingInfo) {
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(this.draftKey()); } catch { return; }
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as {
        typeId: number | null;
        providerId: number | null | undefined;
        slotStart: string | null;
      };
      const type = draft.typeId != null
        ? info.appointmentTypes.find(t => t.id === draft.typeId) ?? null
        : null;
      if (type) this.selectedType.set(type);

      if (draft.providerId === null) {
        this.selectedProvider.set(null);                  // "Any Available"
      } else if (typeof draft.providerId === 'number') {
        const p = info.providers.find(pr => pr.id === draft.providerId) ?? null;
        this.selectedProvider.set(p);
      } // else undefined → leave at the initial "not picked" state

      // Reload slots for the restored type/provider, then re-select the
      // slot once the new list arrives.
      if (type && this.selectedProvider() !== undefined) {
        this.loadSlotsForCurrentView();
        if (draft.slotStart) {
          // The slot list is loaded async; poll the signal briefly until it
          // arrives, then restore the chosen start. Falls back gracefully if
          // the slot is no longer available (e.g. someone else booked it).
          const tryRestore = (attempts: number) => {
            const match = this.slots().find(s => s.start === draft.slotStart);
            if (match) { this.selectedSlot.set(match); return; }
            if (attempts > 0) setTimeout(() => tryRestore(attempts - 1), 250);
          };
          setTimeout(() => tryRestore(8), 250);
        }
      }
    } catch { /* corrupt draft, ignore */ }
  }

  /** Clear the persisted draft once the booking is complete. */
  private clearDraft() {
    try { sessionStorage.removeItem(this.draftKey()); } catch { /* ignore */ }
  }

  /** True when the visible week already starts at today — prevents paging past today. */
  readonly atEarliestWeek = computed(() => {
    const start = this.weekStart();
    const today = todayAtMidnight();
    return start.getTime() <= today.getTime();
  });

  prevWeek() {
    if (this.atEarliestWeek()) return;
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() - 7);
    // Clamp to today so we never scroll past the present.
    const today = todayAtMidnight();
    if (d.getTime() < today.getTime()) {
      this.weekStart.set(today);
    } else {
      this.weekStart.set(d);
    }
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

  /**
   * "Not you? Sign in as someone else" handler. Persists the current draft
   * (including the typed phone + SMS choice, which aren't otherwise saved
   * on every keystroke) before the auth service logs the user out and
   * redirects to /login. After the new user signs in they come back to
   * /book/:slug and ngOnInit's restoreDraft() puts the picks back.
   */
  signOutKeepingDraft() {
    this.persistDraft();
    this.auth.logout({ returnUrl: this.returnUrl() });
  }

  book() {
    // No guest bookings — the user must be signed in before step 4 is even visible.
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.returnUrl() } });
      return;
    }

    // Reschedule mode: API only needs the cancellation token + new start time.
    // The server keeps the original provider, appointment type, and client
    // info; we just shift the time. Provider/type IDs the user picked here
    // are intentionally ignored — the modify flow can't re-target.
    const token = this.rescheduleToken();
    if (token) {
      this.booking.set(true);
      this.api.rescheduleAppointment(token, this.selectedSlot()!.start).subscribe({
        next: () => {
          this.clearDraft();
          this.router.navigate([`/book/${this.bookingSlug}/confirm`], {
            queryParams: {
              token,
              start:        this.selectedSlot()!.start,
              end:          this.selectedSlot()!.end,
              apptTypeId:   this.selectedType()!.id,
              typeName:     this.selectedType()!.name,
              practiceName: this.practice()?.name ?? '',
              providerName: this.providerName(this.selectedProvider() ?? null),
              rescheduled: 'true'
            }
          });
        },
        error: err => {
          this.bookError.set(err?.error || 'Reschedule failed. Please try a different time.');
          this.booking.set(false);
        }
      });
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
        // Booking succeeded — drop the saved draft so it doesn't auto-restore
        // the next time this user opens the booking page.
        this.clearDraft();
        this.router.navigate([`/book/${this.bookingSlug}/confirm`], {
          queryParams: {
            apptId: res.id,
            token: res.cancellationToken,
            start: res.startTime,
            end: res.endTime,
            needsIntake: res.requiresIntakeForm,
            apptTypeId: this.selectedType()!.id,
            // Extra context for the "Add to Calendar" buttons on the confirm
            // page. Cheap to pass through query params; saves an extra API call.
            typeName: this.selectedType()!.name,
            practiceName: this.practice()?.name ?? '',
            providerName: this.providerName(this.selectedProvider() ?? null)
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

    // Reschedule mode? The "Modify" button on /my/appointments adds these.
    const q = this.route.snapshot.queryParamMap;
    const rt = q.get('reschedule');
    if (rt) {
      this.rescheduleToken.set(rt);
      this.rescheduleOriginal.set({
        start:    q.get('originalStart')    ?? '',
        type:     q.get('originalType')     ?? '',
        provider: q.get('originalProvider') ?? ''
      });
    }

    // Pre-fill phone from the signed-in user's profile so they don't have
    // to retype it every time. They can still edit it before confirming.
    const user = this.auth.currentUser();
    if (user?.phone) this.clientPhone = user.phone;

    this.api.getPublicPractice(this.bookingSlug).subscribe({
      next: data => {
        this.practice.set(data);
        // Re-hydrate any in-progress booking from before a logout/login round
        // trip. Has to wait until appointment types + providers are loaded
        // because we look the IDs back up against the practice.
        this.restoreDraft(data);
      },
      error: () => this.error.set('Practice not found. Please check your booking link.')
    });
  }
}

/** Midnight at the start of today, in local time. */
function todayAtMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
