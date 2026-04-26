import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-booking-confirm',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './booking-confirm.component.html',
  styleUrls: ['./booking-confirm.component.scss']
})
export class BookingConfirmComponent implements OnInit {
  private route = inject(ActivatedRoute);

  apptId = signal(0);
  token = signal('');
  startTime = signal('');
  endTime = signal('');
  needsIntake = signal(false);
  apptTypeId = signal(0);
  typeName = signal('');
  practiceName = signal('');
  providerName = signal('');
  slug = '';

  /**
   * True when this page is rendered inside an iframe (i.e. the embeddable
   * booking widget on a third-party site). We detect by comparing window.self
   * to window.top — if the access throws (cross-origin parent), we're definitely
   * in an iframe so default to true.
   *
   * Drives the "View my bookings" link: in standalone web-app mode we use
   * the Angular router; in iframe mode we use a plain href with target=_top
   * so the user breaks out of the iframe and sees the full appointments view.
   */
  inWidget = signal(false);

  /** True when the user just rescheduled (modify flow) rather than booking new. */
  wasRescheduled = signal(false);

  /**
   * Absolute URL to /my/appointments under the deployed base href. document.baseURI
   * resolves "/Scheduler/ScheduleUI/" automatically when the production build
   * sets <base href="/Scheduler/ScheduleUI/">, so this works for any deployment
   * path without hardcoding.
   */
  myAppointmentsUrl = computed(() => {
    try { return new URL('my/appointments', document.baseURI).href; }
    catch { return '/my/appointments'; }
  });

  intakeLink() { return `/book/${this.slug}/intake`; }
  intakeParams() { return { apptId: this.apptId(), token: this.token(), apptTypeId: this.apptTypeId() }; }
  cancelLink() { return `/book/${this.slug}/cancel?token=${this.token()}`; }

  /** Event title — "<Type> with <Provider>" if both known, else best fallback. */
  eventTitle = computed(() => {
    const t = this.typeName();
    const p = this.providerName();
    if (t && p && p !== 'Any Available') return `${t} with ${p}`;
    if (t) return t;
    if (this.practiceName()) return `Appointment at ${this.practiceName()}`;
    return 'Appointment';
  });

  /** Plain-text description for the calendar event body. */
  eventDescription = computed(() => {
    const lines: string[] = [];
    if (this.typeName())     lines.push(this.typeName());
    if (this.providerName() && this.providerName() !== 'Any Available') {
      lines.push(`Provider: ${this.providerName()}`);
    }
    if (this.practiceName()) lines.push(`Practice: ${this.practiceName()}`);
    return lines.join('\n');
  });

  /**
   * Google Calendar pre-filled "create event" URL. Opens in a new tab so the
   * user lands on Google's confirmation screen and can save with one click.
   */
  googleCalUrl = computed(() => {
    const start = this.startTime();
    const end   = this.endTime() || addMinutesIso(start, 30);
    if (!start) return '';
    const params = new URLSearchParams({
      action:  'TEMPLATE',
      text:    this.eventTitle(),
      dates:   `${toGCalDate(start)}/${toGCalDate(end)}`,
      details: this.eventDescription(),
      location: this.practiceName() || ''
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  });

  /**
   * Build an .ics file in the browser and trigger a download. Works for
   * Apple Calendar, Outlook desktop, Outlook on the web (via import), Fantastical,
   * and basically anything that speaks RFC 5545.
   */
  downloadIcs() {
    const start = this.startTime();
    const end   = this.endTime() || addMinutesIso(start, 30);
    if (!start) return;

    const uid = `proschedule-${this.apptId()}@pryschedule.com`;
    // RFC 5545 requires CRLF line endings and DTSTAMP must be UTC.
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ProSchedule//Booking//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(this.eventTitle())}`,
      `DESCRIPTION:${escapeIcsText(this.eventDescription())}`,
      `LOCATION:${escapeIcsText(this.practiceName())}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'appointment.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  ngOnInit() {
    this.slug = this.route.snapshot.paramMap.get('slug')!;
    const q = this.route.snapshot.queryParams;
    this.apptId.set(Number(q['apptId']));
    this.token.set(q['token']);
    this.startTime.set(q['start']);
    this.endTime.set(q['end'] ?? '');
    this.needsIntake.set(q['needsIntake'] === 'true');
    this.apptTypeId.set(Number(q['apptTypeId']));
    this.typeName.set(q['typeName'] ?? '');
    this.practiceName.set(q['practiceName'] ?? '');
    this.providerName.set(q['providerName'] ?? '');
    this.wasRescheduled.set(q['rescheduled'] === 'true');

    // Detect iframe context. Cross-origin access to window.top throws, which
    // is itself a strong signal that we're framed.
    try { this.inWidget.set(window.self !== window.top); }
    catch { this.inWidget.set(true); }
  }
}

// ---- helpers ----------------------------------------------------------

/** ISO 8601 → YYYYMMDDTHHMMSSZ for Google Calendar's `dates=` param. */
function toGCalDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** ISO 8601 → YYYYMMDDTHHMMSSZ for an .ics DTSTART/DTEND/DTSTAMP value (UTC). */
function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * RFC 5545 text escaping: backslashes, semicolons, commas, and newlines all
 * need to be escaped inside text values, otherwise calendar apps misparse the
 * line and silently drop the field.
 */
function escapeIcsText(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Fallback when no end time was passed — assume 30 minutes. */
function addMinutesIso(iso: string, mins: number): string {
  if (!iso) return iso;
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}
