import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AppointmentDetail, AppointmentStatus } from '../../core/models/models';

@Component({
  selector: 'app-appointment-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './appointment-detail.component.html',
  styleUrls: ['./appointment-detail.component.scss']
})
export class AppointmentDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  appt = signal<AppointmentDetail | null>(null);

  statusLabel(s: AppointmentStatus) {
    return ['Scheduled', 'Completed', 'Cancelled', 'No Show'][s];
  }

  formatResponses(json: string) {
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json; }
  }

  updateStatus(status: AppointmentStatus) {
    const id = this.appt()!.id;
    this.api.updateAppointmentStatus(id, status).subscribe(() => {
      this.appt.update(a => a ? { ...a, status } : null);
    });
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.getAppointment(id).subscribe({
      next: data => { this.appt.set(data); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }
}
