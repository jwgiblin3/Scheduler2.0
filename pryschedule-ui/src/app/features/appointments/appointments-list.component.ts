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
  templateUrl: './appointments-list.component.html',
  styleUrl: './appointments-list.component.scss'
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
