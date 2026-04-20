import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/**
 * Unified landing page for any signed-in user.
 * - If they own a practice, shows the "My Practice" card (links to /dashboard).
 * - Always shows the "My Appointments" card (links to /my/appointments).
 * - Users who have both get to pick; users who have only one just click through.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  auth = inject(AuthService);
  user = this.auth.currentUser;
}
