import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { MyAppointmentsWidgetComponent } from '../../widgets/my-appointments-widget/my-appointments-widget.component';

/**
 * Hosted "My Appointments" page — provides the ProSchedule header chrome
 * around the reusable MyAppointmentsWidgetComponent. The widget carries all
 * appointment-loading logic and state.
 *
 * The same widget is mounted without this chrome at /widget/my/appointments
 * for iframe embedding on third-party sites.
 */
@Component({
  selector: 'app-my-appointments',
  standalone: true,
  imports: [RouterLink, MyAppointmentsWidgetComponent],
  templateUrl: './my-appointments.component.html',
  styleUrls: ['./my-appointments.component.scss']
})
export class MyAppointmentsComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  /** Most recently booked practice slug — used by the "Book an Appointment" link. */
  private latestSlug = signal<string | null>(null);

  /**
   * Where to send the user when they click "Book an Appointment".
   * Prefer the practice they most recently booked with; fall back to the
   * practice their account is attached to. We hide the link entirely if
   * neither is known so we don't route them into /book/undefined.
   */
  bookingSlug = computed(() => this.latestSlug() || this.auth.currentUser()?.practiceSlug || null);
  bookingHref = computed(() => {
    const slug = this.bookingSlug();
    return slug ? `/book/${slug}` : null;
  });

  ngOnInit() {
    // The widget already loads the same appointments; this is a second,
    // lightweight call just to resolve the slug without coupling the two
    // components. If it fails we silently fall back to auth.practiceSlug.
    this.api.getMyAppointments().subscribe({
      next: list => {
        if (list.length > 0) this.latestSlug.set(list[0].practiceSlug);
      },
      error: () => { /* swallow — widget surfaces the real error */ }
    });
  }
}
