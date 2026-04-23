import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulerModule, SchedulerEvent } from '@progress/kendo-angular-scheduler';
import { ApiService } from '../../core/services/api.service';
import { AppointmentSummary, AppointmentStatus } from '../../core/models/models';

type ViewMode = 'list' | 'day' | 'week';

@Component({
  selector: 'app-appointments-list',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule, SchedulerModule],
  templateUrl: './appointments-list.component.html',
  styleUrls: ['./appointments-list.component.scss']
})
export class AppointmentsListComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  loading = signal(true);
  appointments = signal<AppointmentSummary[]>([]);

  // View switcher — "list" is the original table; "day" and "week" use the
  // Kendo Scheduler. All three read from the same appointments() signal.
  viewMode = signal<ViewMode>('list');

  // The Kendo scheduler uses its own selected-date anchor (the date it
  // centers on). Defaults to today; the Kendo toolbar's nav arrows update it.
  schedulerDate = signal<Date>(new Date());

  // Transform the flat AppointmentSummary[] into Kendo's {start,end,title,id}
  // event shape. Computed so it re-evaluates when the list changes.
  schedulerEvents = computed<SchedulerEvent[]>(() =>
    this.appointments()
      .filter(a => a.status !== AppointmentStatus.Cancelled)
      .map(a => ({
        id: a.id,
        title: `${a.clientName} · ${a.appointmentTypeName}`,
        start: new Date(a.startTime),
        end: new Date(a.endTime),
        // Extra fields for the template's event renderer.
        providerName: a.providerName,
        status: a.status
      } as SchedulerEvent))
  );

  filterFrom = new Date().toISOString().split('T')[0];
  filterTo = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  filterStatus = '';

  setViewMode(mode: ViewMode) { this.viewMode.set(mode); }

  // Clicking an event on the scheduler opens the existing appointment detail
  // page — the scheduler is read-only here, no drag-to-reschedule (yet).
  onSchedulerSelect(event: SchedulerEvent) {
    const id = (event as any).id ?? (event as any).dataItem?.id;
    if (id != null) this.router.navigate(['/appointments', id]);
  }

  onSchedulerDateChange(date: Date) {
    this.schedulerDate.set(date);
  }

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
