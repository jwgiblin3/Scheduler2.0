import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
export class MyAppointmentsComponent {
  auth = inject(AuthService);
}
