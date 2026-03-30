import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppointmentSummary, AppointmentStatus } from '../../core/models/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back, {{ auth.currentUser()?.firstName }}!</p>
        </div>
        <div class="header-actions">
          <a class="btn btn-secondary" [href]="bookingLink" target="_blank">View Booking Page</a>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ todayCount() }}</div>
          <div class="stat-label">Today's Appointments</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ weekCount() }}</div>
          <div class="stat-label">This Week</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ upcomingCount() }}</div>
          <div class="stat-label">Upcoming (Scheduled)</div>
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <div class="view-tabs">
            <button class="tab" [class.active]="calView() === 'day'" (click)="setView('day')">Day</button>
            <button class="tab" [class.active]="calView() === 'week'" (click)="setView('week')">Week</button>
            <button class="tab" [class.active]="calView() === 'month'" (click)="setView('month')">Month</button>
          </div>
          <a routerLink="/appointments" class="link">View all →</a>
        </div>

        @if (loading()) {
          <div class="loading">Loading...</div>
        } @else if (visibleAppts().length === 0) {
          <div class="empty-state">No appointments in this period. <a routerLink="/appointments">View all</a></div>
        } @else {
          @if (calView() === 'month') {
            <div class="month-grid">
              @for (day of monthDays(); track day.date) {
                <div class="month-cell" [class.today]="day.isToday">
                  <div class="month-day-num">{{ day.date | date:'d' }}</div>
                  @for (a of day.appts; track a.id) {
                    <a class="month-appt" [routerLink]="['/appointments', a.id]" [class]="'status-' + a.status">
                      {{ a.startTime | date:'h:mm a' }} {{ a.clientName }}
                    </a>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="appt-list">
              @for (a of visibleAppts(); track a.id) {
                <a class="appt-card" [routerLink]="['/appointments', a.id]">
                  <div class="appt-time">
                    @if (calView() === 'week') { <div class="appt-date">{{ a.startTime | date:'EEE d' }}</div> }
                    {{ a.startTime | date:'h:mm a' }}
                  </div>
                  <div class="appt-info">
                    <div class="appt-client">{{ a.clientName }}</div>
                    <div class="appt-meta">{{ a.appointmentTypeName }} · {{ a.providerName }}</div>
                  </div>
                  <div class="appt-status" [class]="'status-' + a.status">{{ statusLabel(a.status) }}</div>
                </a>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 900px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; }
    h1 { margin: 0; font-size: 1.6rem; color: #1a1f36; }
    p { margin: .25rem 0 0; color: #718096; font-size: .9rem; }
    .btn { padding: .5rem 1rem; border-radius: 6px; text-decoration: none; font-size: .85rem; cursor: pointer; }
    .btn-secondary { border: 1.5px solid #667eea; color: #667eea; background: transparent; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; }
    .stat-card { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    .stat-value { font-size: 2rem; font-weight: 700; color: #1a1f36; }
    .stat-label { font-size: .8rem; color: #718096; margin-top: .25rem; }
    .section { background: #fff; border-radius: 10px; padding: 1.25rem; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    h2 { margin: 0; font-size: 1.1rem; }
    .link { font-size: .85rem; color: #667eea; text-decoration: none; }
    .loading, .empty-state { color: #718096; font-size: .9rem; padding: 1rem 0; }
    .empty-state a { color: #667eea; text-decoration: none; }
    .appt-card { display: flex; align-items: center; gap: 1rem; padding: .75rem; border-radius: 6px; text-decoration: none; color: inherit; transition: background .1s; }
    .appt-card:hover { background: #f7f8fc; }
    .appt-time { width: 70px; font-size: .85rem; color: #667eea; font-weight: 600; flex-shrink: 0; }
    .appt-info { flex: 1; }
    .appt-client { font-weight: 500; font-size: .9rem; }
    .appt-meta { font-size: .78rem; color: #718096; margin-top: 2px; }
    .appt-status { font-size: .75rem; padding: 2px 8px; border-radius: 12px; }
    .status-0 { background: #ebf8ff; color: #2b6cb0; }
    .status-1 { background: #f0fff4; color: #276749; }
    .status-2 { background: #fff5f5; color: #c53030; }
    .status-3 { background: #fffaf0; color: #c05621; }
    .view-tabs { display: flex; gap: 2px; background: #f7f8fc; border-radius: 8px; padding: 3px; }
    .tab { padding: .3rem .8rem; border: none; background: transparent; border-radius: 6px; cursor: pointer; font-size: .82rem; color: #718096; }
    .tab.active { background: #fff; color: #1a1f36; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .appt-date { font-size: .7rem; color: #a0aec0; }
    .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #e2e8f0; border-radius: 8px; overflow: hidden; }
    .month-cell { background: #fff; padding: .4rem .5rem; min-height: 80px; }
    .month-cell.today { background: #f8f9ff; }
    .month-day-num { font-size: .75rem; font-weight: 600; color: #4a5568; margin-bottom: .25rem; }
    .month-appt { display: block; font-size: .68rem; padding: 1px 4px; border-radius: 4px; margin-bottom: 2px; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `]
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  loading = signal(true);
  appointments = signal<AppointmentSummary[]>([]);
  calView = signal<'day' | 'week' | 'month'>('day');

  get bookingLink() { return `/book/`; }

  setView(v: 'day' | 'week' | 'month') {
    this.calView.set(v);
    const now = new Date();
    let from: Date, to: Date;
    if (v === 'day') { from = now; to = new Date(now); to.setHours(23, 59, 59); }
    else if (v === 'week') { from = now; to = new Date(now); to.setDate(now.getDate() + 7); }
    else { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
    this.loading.set(true);
    this.api.getAppointments({ from: from.toISOString(), to: to.toISOString() }).subscribe({
      next: data => { this.appointments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  visibleAppts() {
    return this.appointments().filter(a => a.status === AppointmentStatus.Scheduled);
  }

  monthDays() {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push({ date: null as any, isToday: false, appts: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = date.toDateString();
      days.push({
        date,
        isToday: dateStr === new Date().toDateString(),
        appts: this.appointments().filter(a => new Date(a.startTime).toDateString() === dateStr)
      });
    }
    return days;
  }

  todayAppts() {
    const today = new Date().toDateString();
    return this.appointments().filter(a => new Date(a.startTime).toDateString() === today && a.status === AppointmentStatus.Scheduled);
  }

  todayCount() { return this.todayAppts().length; }

  weekCount() {
    const now = new Date();
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    return this.appointments().filter(a => {
      const t = new Date(a.startTime);
      return t >= now && t <= weekEnd && a.status === AppointmentStatus.Scheduled;
    }).length;
  }

  upcomingCount() {
    return this.appointments().filter(a => a.status === AppointmentStatus.Scheduled).length;
  }

  statusLabel(s: AppointmentStatus) { return ['Scheduled', 'Completed', 'Cancelled', 'No Show'][s]; }

  ngOnInit() { this.setView('day'); }
}
