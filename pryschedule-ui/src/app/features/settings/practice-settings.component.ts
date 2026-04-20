import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-practice-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './practice-settings.component.html',
  styleUrls: ['./practice-settings.component.scss']
})
export class PracticeSettingsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  // Practice fields
  name = ''; phone = ''; address = ''; timeZone = 'America/New_York'; cancellationWindowHours = 24;
  slug = signal('');   // signal so the booking link updates reactively when it changes
  savingPractice = signal(false); practiceSaved = signal(false); slugError = signal('');

  // Notification fields
  emailEnabled = true; fromEmail = ''; fromName = '';
  reminder1Hours = 48; reminder2Hours = 24; smsEnabled = false;
  savingNotif = signal(false); notifSaved = signal(false);

  copied = signal(false);

  // computed() so the template re-renders reactively whenever the slug signal changes.
  bookingLink = computed(() => `${window.location.origin}/book/${this.slug() || ''}`);

  copyLink() {
    navigator.clipboard.writeText(this.bookingLink());   // reads the computed signal
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  savePractice() {
    this.savingPractice.set(true);
    this.slugError.set('');
    this.api.updatePracticeSettings({
      name: this.name, phone: this.phone, address: this.address,
      timeZone: this.timeZone, cancellationWindowHours: this.cancellationWindowHours,
      slug: this.slug()
    }).subscribe({
      next: (res: any) => {
        // Server returns the normalized slug; keep UI in sync.
        if (res?.slug) this.slug.set(res.slug);
        this.savingPractice.set(false);
        this.practiceSaved.set(true);
        setTimeout(() => this.practiceSaved.set(false), 3000);
      },
      error: err => {
        this.slugError.set(typeof err.error === 'string' ? err.error : 'Save failed.');
        this.savingPractice.set(false);
      }
    });
  }

  saveNotifications() {
    this.savingNotif.set(true);
    this.api.updateNotificationSettings({
      reminder1Hours: this.reminder1Hours, reminder2Hours: this.reminder2Hours,
      emailEnabled: this.emailEnabled, smsEnabled: this.smsEnabled,
      fromEmail: this.fromEmail, fromName: this.fromName
    }).subscribe({
      next: () => { this.savingNotif.set(false); this.notifSaved.set(true); setTimeout(() => this.notifSaved.set(false), 3000); },
      error: () => this.savingNotif.set(false)
    });
  }

  ngOnInit() {
    this.api.getPracticeSettings().subscribe(s => {
      this.name = s.name; this.slug.set(s.slug ?? ''); this.phone = s.phone ?? ''; this.address = s.address ?? '';
      this.timeZone = s.timeZone ?? 'America/New_York';
      this.cancellationWindowHours = s.cancellationWindowHours;
      if (s.notificationSettings) {
        this.emailEnabled = s.notificationSettings.emailEnabled;
        this.smsEnabled = s.notificationSettings.smsEnabled;
        this.fromEmail = s.notificationSettings.fromEmail;
        this.fromName = s.notificationSettings.fromName;
        this.reminder1Hours = s.notificationSettings.reminder1Hours;
        this.reminder2Hours = s.notificationSettings.reminder2Hours;
      }
    });
  }
}
