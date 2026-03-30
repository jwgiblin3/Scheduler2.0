import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="shell">
      <nav class="sidebar">
        <div class="sidebar-logo">
          <span class="logo-icon">📅</span>
          <span class="logo-text">ProSchedule</span>
        </div>
        <div class="sidebar-user">
          <div class="user-name">{{ user()?.firstName }} {{ user()?.lastName }}</div>
          <div class="user-practice">{{ user()?.practiceName }}</div>
          <div class="user-role badge">{{ user()?.role }}</div>
        </div>
        <ul class="nav-links">
          <li><a routerLink="/dashboard" routerLinkActive="active">
            <span class="nav-icon">🏠</span> Dashboard
          </a></li>
          <li><a routerLink="/appointments" routerLinkActive="active">
            <span class="nav-icon">📋</span> Appointments
          </a></li>
          @if (auth.isAdmin()) {
            <li><a routerLink="/providers" routerLinkActive="active">
              <span class="nav-icon">👤</span> Providers
            </a></li>
            <li><a routerLink="/appointment-types" routerLinkActive="active">
              <span class="nav-icon">⚙️</span> Appointment Types
            </a></li>
            <li><a routerLink="/settings" routerLinkActive="active">
              <span class="nav-icon">🔧</span> Settings
            </a></li>
          }
        </ul>
        <button class="logout-btn" (click)="auth.logout()">Sign Out</button>
      </nav>
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .shell { display: flex; min-height: 100vh; }
    .sidebar {
      width: 240px; background: #1a1f36; color: #fff;
      display: flex; flex-direction: column; padding: 1.5rem 1rem;
      flex-shrink: 0;
    }
    .sidebar-logo { display: flex; align-items: center; gap: .5rem; font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }
    .sidebar-user { padding: .75rem; background: rgba(255,255,255,.08); border-radius: 8px; margin-bottom: 1.5rem; }
    .user-name { font-weight: 600; font-size: .9rem; }
    .user-practice { font-size: .75rem; color: #a0aec0; margin-top: 2px; }
    .badge { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 12px; font-size: .7rem; background: #4a5568; }
    .nav-links { list-style: none; padding: 0; margin: 0; flex: 1; }
    .nav-links li { margin-bottom: .25rem; }
    .nav-links a {
      display: flex; align-items: center; gap: .6rem; padding: .6rem .75rem;
      color: #a0aec0; text-decoration: none; border-radius: 6px; font-size: .9rem; transition: all .15s;
    }
    .nav-links a:hover, .nav-links a.active { background: rgba(255,255,255,.1); color: #fff; }
    .logout-btn {
      margin-top: auto; width: 100%; padding: .6rem; background: transparent;
      border: 1px solid #4a5568; color: #a0aec0; border-radius: 6px; cursor: pointer; font-size: .85rem;
    }
    .logout-btn:hover { background: rgba(255,255,255,.05); color: #fff; }
    .main-content { flex: 1; background: #f7f8fc; overflow: auto; }
  `]
})
export class ShellComponent {
  auth = inject(AuthService);
  user = this.auth.currentUser;
}
