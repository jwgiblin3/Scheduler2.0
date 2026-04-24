import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppointmentSummary, AppointmentStatus } from '../../core/models/models';

type ViewMode = 'list' | 'day' | 'week';

// Time grid config — Day and Week views render rows for each hour in this
// window. Widen the window here if the practice takes appointments outside
// 7am–8pm; the math below will scale automatically.
const GRID_START_HOUR = 7;
const GRID_END_HOUR = 20;          // exclusive (last row is 19:00-20:00)
const HOUR_HEIGHT_PX = 56;

// Lightweight row shape rendered inside the time grid. We pre-compute pixel
// offsets so the template stays dumb (no math in bindings).
interface GridEvent {
  id: number;
  title: string;
  subtitle: string;
  status: AppointmentStatus;
  /** Top offset within its column, in px. */
  top: number;
  /** Block height in px. */
  height: number;
  /** Which weekday column it belongs to (0-6, Sunday-origin). Only used by week view. */
  dayIndex: number;
  /** HH:mm display string. */
  timeLabel: string;
}

@Component({
  selector: 'app-appointments-list',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './appointments-list.component.html',
  styleUrls: ['./appointments-list.component.scss']
})
export class AppointmentsListComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  loading = signal(true);
  appointments = signal<AppointmentSummary[]>([]);

  // View switcher — "list" is the original table; "day" and "week" use a
  // hand-built time-grid. All three read from the same appointments() signal.
  viewMode = signal<ViewMode>('list');

  // Anchor date for the time-grid views. Day view shows just this date;
  // Week view shows the full Sun-Sat week containing this date.
  gridAnchor = signal<Date>(startOfDay(new Date()));

  filterFrom = new Date().toISOString().split('T')[0];
  filterTo = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  filterStatus = '';

  // ---- Grid geometry (exposed to template) ----
  readonly hourLabels = computed(() => {
    const labels: string[] = [];
    for (let h = GRID_START_HOUR; h < GRID_END_HOUR; h++) {
      const hour12 = ((h + 11) % 12) + 1;
      const suffix = h < 12 ? 'AM' : 'PM';
      labels.push(`${hour12} ${suffix}`);
    }
    return labels;
  });
  readonly hourHeight = HOUR_HEIGHT_PX;
  readonly gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT_PX;

  // ---- Day view ----
  readonly dayEvents = computed<GridEvent[]>(() => {
    const anchor = this.gridAnchor();
    return this.appointmentsForDay(anchor);
  });

  // ---- Week view ----
  readonly weekStart = computed(() => startOfWeek(this.gridAnchor()));
  readonly weekDays = computed(() => {
    const start = this.weekStart();
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  });
  readonly weekEvents = computed<GridEvent[]>(() => {
    const start = this.weekStart();
    const weekEndExclusive = new Date(start);
    weekEndExclusive.setDate(start.getDate() + 7);
    return this.appointments()
      .filter(a => a.status !== AppointmentStatus.Cancelled)
      .map(a => this.toGridEvent(a, start))
      .filter((e): e is GridEvent => e !== null)
      .filter(e => e.dayIndex >= 0 && e.dayIndex < 7);
  });

  // Heading shown above the day grid.
  readonly dayHeading = computed(() => {
    const d = this.gridAnchor();
    return d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  });

  // Heading shown above the week grid.
  readonly weekHeading = computed(() => {
    const start = this.weekStart();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
  });

  setViewMode(mode: ViewMode) { this.viewMode.set(mode); }

  // Navigate forward/back. Day view moves one day; Week view moves 7 days.
  shiftGrid(direction: -1 | 1) {
    const step = this.viewMode() === 'week' ? 7 : 1;
    const next = new Date(this.gridAnchor());
    next.setDate(next.getDate() + step * direction);
    this.gridAnchor.set(next);
  }

  goToday() { this.gridAnchor.set(startOfDay(new Date())); }

  openEvent(id: number) {
    this.router.navigate(['/appointments', id]);
  }

  statusLabel(s: AppointmentStatus) {
    return ['Scheduled', 'Completed', 'Cancelled', 'No Show'][s];
  }

  isToday(d: Date) {
    const today = startOfDay(new Date());
    return sameDay(d, today);
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

  // ---- internals ----

  private appointmentsForDay(day: Date): GridEvent[] {
    return this.appointments()
      .filter(a => a.status !== AppointmentStatus.Cancelled)
      .map(a => this.toGridEvent(a, day))
      .filter((e): e is GridEvent => e !== null && e.dayIndex === 0);
  }

  /**
   * Convert an AppointmentSummary to pixel-positioned grid event data.
   * `columnOrigin` is the date that maps to dayIndex 0; the day view passes
   * the day itself (so matching events get dayIndex 0), the week view passes
   * weekStart (so events get dayIndex 0..6).
   */
  private toGridEvent(a: AppointmentSummary, columnOrigin: Date): GridEvent | null {
    const start = new Date(a.startTime);
    const end = new Date(a.endTime);

    // Figure out which column (day) this event lives in.
    const columnDay = startOfDay(columnOrigin);
    const eventDay = startOfDay(start);
    const dayDiffMs = eventDay.getTime() - columnDay.getTime();
    const dayIndex = Math.round(dayDiffMs / 86400000);

    // Reject events outside the grid's hour window rather than drawing
    // offscreen blocks — otherwise a 6am appointment would leak above the grid.
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    if (endHour <= GRID_START_HOUR || startHour >= GRID_END_HOUR) return null;

    const clampedStart = Math.max(startHour, GRID_START_HOUR);
    const clampedEnd = Math.min(endHour, GRID_END_HOUR);
    const top = (clampedStart - GRID_START_HOUR) * HOUR_HEIGHT_PX;
    const height = Math.max(22, (clampedEnd - clampedStart) * HOUR_HEIGHT_PX);

    const hh = start.getHours();
    const mm = start.getMinutes();
    const hour12 = ((hh + 11) % 12) + 1;
    const suffix = hh < 12 ? 'am' : 'pm';
    const timeLabel = mm === 0
      ? `${hour12} ${suffix}`
      : `${hour12}:${mm.toString().padStart(2, '0')} ${suffix}`;

    return {
      id: a.id,
      title: `${a.clientName}`,
      subtitle: `${a.appointmentTypeName} · ${a.providerName}`,
      status: a.status,
      top,
      height,
      dayIndex,
      timeLabel
    };
  }
}

// ---- date helpers (local time, not UTC) ----
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  // Sunday-origin week start — matches Kendo's default and the mental model
  // most US practices expect on a weekly calendar.
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}
