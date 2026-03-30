import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppointmentSummary, AppointmentStatus } from '../../core/models/models';

@Component({
  selector: 'app-appointments-list',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Appointments</h1>
        <div class="header-right">
        <button class="btn btn-export" (click)="exportCsv()">⬇ Export CSV</button>
        <div class="filters">
          <input type="date" [(ngModel)]="filterFrom" (change)="load()" class="filter-input" />
          <input type="date" [(ngModel)]="filterTo" (change)="load()" class="filter-input" />
        </div>
          <select [(ngModel)]="filterStatus" (change)="load()" class="filter-select">
            <option value="">All statuses</option>
            <option value="0">Scheduled</option>
            <option value="1">Completed</option>
            <option value="2">Cancelled</option>
            <option value="3">No Show</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="loading">Loading...</div>
      } @else if (appointments().length === 0) {
        <div class="empty-state">No appointments found for selected filters.</div>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Client</th>
                <th>Provider</th>
                <th>Type</th>
                <th>Status</th>
                <th>Intake</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (a of appointments(); track a.id) {
                <tr>
                  <td>
                    <div class="date">{{ a.startTime | date:'MMM d, y' }}</div>
                    <div class="time">{{ a.startTime | date:'h:mm a' }}</div>
                  </td>
                  <td>
                    <div>{{ a.clientName }}</div>
                    <div class="sub">{{ a.clientEmail }}</div>
                  </td>
                  <td>{{ a.providerName }}</td>
                  <td>{{ a.appointmentTypeName }}</td>
                  <td><span class="badge status-{{ a.status }}">{{ statusLabel(a.status) }}</span></td>
                  <td>
                    @if (a.hasIntakeResponse) {
                      <span class="badge badge-green">Submitted</span>
                    } @else {
                      <span class="badge badge-gray">Pending</span>
                    }
                  </td>
                  <td><a [routerLink]="['/appointments', a.id]" class="link">View →</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 2rem; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem; }
    h1 { margin: 0; font-size: 1.6rem; color: #1a1f36; }
    .filters { display: flex; gap: .5rem; flex-wrap: wrap; }
    .header-right { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
    .btn-export { padding: .4rem .85rem; background: #fff; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .82rem; cursor: pointer; color: #4a5568; }
    .btn-export:hover { border-color: #667eea; color: #667eea; }
    .filter-input, .filter-select { padding: .4rem .6rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .85rem; }
    .loading, .empty-state { color: #718096; padding: 2rem 0; }
    .table-wrap { background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.06); overflow: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: .75rem 1rem; font-size: .8rem; color: #718096; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #e2e8f0; }
    td { padding: .75rem 1rem; border-bottom: 1px solid #f7f8fc; font-size: .9rem; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .date { font-weight: 500; }
    .time, .sub { font-size: .78rem; color: #718096; margin-top: 2px; }
    .badge { font-size: .75rem; padding: 2px 8px; border-radius: 12px; display: inline-block; }
    .status-0 { background: #ebf8ff; color: #2b6cb0; }
    .status-1 { background: #f0fff4; color: #276749; }
    .status-2 { background: #fff5f5; color: #c53030; }
    .status-3 { background: #fffaf0; color: #c05621; }
    .badge-green { background: #f0fff4; color: #276749; }
    .badge-gray { background: #f7f8fc; color: #718096; }
    .link { color: #667eea; text-decoration: none; font-size: .85rem; }
  `]
})
export class AppointmentsListComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  appointments = signal<AppointmentSummary[]>([]);

  filterFrom = new Date().toISOString().split('T')[0];
  filterTo = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  filterStatus = '';

  statusLabel(s: AppointmentStatus) {
    return ['Scheduled', 'Completed', 'Cancelled', 'No Show'][s];
  }

  load() {
    this.loading.set(true);
    const filters: any = { from: this.filterFrom, to: this.filterTo };
    if (this.filterStatus !== '') filters.status = Number(this.filterStatus);
    this.api.getAppointments(filters).subscribe({
      next: data => { this.appointments.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  exportCsv() {
    const filters: any = { from: this.filterFrom, to: this.filterTo };
    if (this.filterStatus !== '') filters.status = Number(this.filterStatus);
    this.api.exportAppointmentsCsv(filters).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `appointments-${new Date().toISOString().split('T')[0]}.csv`;
      a.click(); window.URL.revokeObjectURL(url);
    });
  }

  ngOnInit() { this.load(); }
}
