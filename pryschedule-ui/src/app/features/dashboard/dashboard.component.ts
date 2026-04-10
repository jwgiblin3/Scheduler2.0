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
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
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
