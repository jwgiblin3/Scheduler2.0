import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/**
 * Admin Console landing page. Reachable only by SuperAdmin accounts (gated
 * by the superAdminGuard on the /admin route, plus server-side
 * [Authorize(Policy = "ManageGlobals")] on the actual API endpoints).
 *
 * v1 (Phase 1) is a shell with placeholder tiles for the screens scheduled
 * in Phase 3+. Each tile shows what's coming and is intentionally not
 * clickable yet — clicking would 404 today, and a disabled-looking tile is
 * a better signal than a dead link.
 *
 * As each Phase 3 screen ships, swap its tile from <div class="placeholder">
 * to <a routerLink="...">.
 */
@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './admin-home.component.html',
  styleUrls: ['./admin-home.component.scss']
})
export class AdminHomeComponent {
  auth = inject(AuthService);
  user = this.auth.currentUser;
}
