import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-practice-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './practice-settings.component.html',
  styleUrl: './practice-settings.component.scss'
})
export class PracticeSettingsComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  // Practice fields
  name = ''; phone = ''; address = ''; timeZone = 'America/New_York'; cancellationWindowHours = 24;
  savingPractice = signal(false); practiceSaved = signal(false);

  // Notification fields
  emailEnabled = true; fromEmail = ''; fromName = '';
  reminder1Hours = 48; reminder2Hours = 24; smsEnabled = false;
  savingNotif = signal(false); notifSaved = signal(false);

  copied = signal(false);

  bookingLink() {
    return `${window.location.origin}/book/${this.auth.currentUser()?.practiceName?.toLowerCase().replace(/\s+/g, '-') ?? ''}`;
  }

  copyLink() {
    navigator.clipboard.writeText(this.bookingLink());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  savePractice() {
    this.savingPractice.set(true);
    this.api.updatePracticeSettings({
      name: this.name, phone: this.phone, address: this.address,
      timeZone: this.timeZone, cancellationWindowHours: this.cancellationWindowHours
    }).subscribe({
      next: () => { this.savingPractice.set(false); this.practiceSaved.set(true); setTimeout(() => this.practiceSaved.set(false), 3000); },
      error: () => this.savingPractice.set(false)
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
      this.name = s.name; this.phone = s.phone ?? ''; this.address = s.address ?? '';
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
