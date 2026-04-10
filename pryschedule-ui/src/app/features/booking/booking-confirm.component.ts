import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-booking-confirm',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './booking-confirm.component.html',
  styleUrl: './booking-confirm.component.scss'
})
export class BookingConfirmComponent implements OnInit {
  private route = inject(ActivatedRoute);

  apptId = signal(0);
  token = signal('');
  startTime = signal('');
  needsIntake = signal(false);
  apptTypeId = signal(0);
  slug = '';

  intakeLink() { return `/book/${this.slug}/intake`; }
  intakeParams() { return { apptId: this.apptId(), token: this.token(), apptTypeId: this.apptTypeId() }; }
  cancelLink() { return `/book/${this.slug}/cancel?token=${this.token()}`; }

  ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug')!;
    const q = this.route.snapshot.queryParams;
    this.apptId.set(Number(q['apptId']));
    this.token.set(q['token']);
    this.startTime.set(q['start']);
    this.needsIntake.set(q['needsIntake'] === 'true');
    this.apptTypeId.set(Number(q['apptTypeId']));
  }
}
