import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-practice-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <h1>Practice Settings</h1>

      <div class="sections">
        <!-- Practice Info -->
        <div class="card">
          <h2>Practice Information</h2>
          <div class="form-row">
            <div class="form-group">
              <label>Practice Name *</label>
              <input [(ngModel)]="name" />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input [(ngModel)]="phone" />
            </div>
          </div>
          <div class="form-group">
            <label>Address</label>
            <input [(ngModel)]="address" placeholder="123 Main St, City, State" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Time Zone</label>
              <select [(ngModel)]="timeZone">
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
                <option value="America/Anchorage">Alaska</option>
                <option value="Pacific/Honolulu">Hawaii</option>
              </select>
            </div>
            <div class="form-group">
              <label>Cancellation Window (hours)</label>
              <input type="number" [(ngModel)]="cancellationWindowHours" min="0" max="168" />
              <small>Clients must cancel at least this many hours before their appointment.</small>
            </div>
          </div>
          @if (practiceSaved()) { <div class="alert-success">Settings saved!</div> }
          <div class="form-actions">
            <button class="btn btn-primary" [disabled]="savingPractice()" (click)="savePractice()">
              {{ savingPractice() ? 'Saving...' : 'Save Practice Settings' }}
            </button>
          </div>
        </div>

        <!-- Notification Settings -->
        <div class="card">
          <h2>Notifications & Reminders</h2>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="emailEnabled" /> Enable email notifications
            </label>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>From Email</label>
              <input type="email" [(ngModel)]="fromEmail" placeholder="noreply@yourpractice.com" [disabled]="!emailEnabled" />
            </div>
            <div class="form-group">
              <label>From Name</label>
              <input [(ngModel)]="fromName" placeholder="My Practice" [disabled]="!emailEnabled" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>First Reminder (hours before)</label>
              <input type="number" [(ngModel)]="reminder1Hours" min="1" max="168" [disabled]="!emailEnabled" />
            </div>
            <div class="form-group">
              <label>Second Reminder (hours before)</label>
              <input type="number" [(ngModel)]="reminder2Hours" min="1" max="168" [disabled]="!emailEnabled" />
            </div>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" [(ngModel)]="smsEnabled" /> Enable SMS notifications (requires Twilio)
            </label>
          </div>
          @if (notifSaved()) { <div class="alert-success">Notification settings saved!</div> }
          <div class="form-actions">
            <button class="btn btn-primary" [disabled]="savingNotif()" (click)="saveNotifications()">
              {{ savingNotif() ? 'Saving...' : 'Save Notification Settings' }}
            </button>
          </div>
        </div>

        <!-- Booking Link -->
        <div class="card">
          <h2>Your Booking Link</h2>
          <p class="booking-link-desc">Share this link with clients to let them book online:</p>
          <div class="booking-link-box">
            <span class="link-text">{{ bookingLink() }}</span>
            <button class="btn btn-copy" (click)="copyLink()">{{ copied() ? 'Copied!' : 'Copy' }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 2rem; max-width: 800px; }
    h1 { margin: 0 0 1.5rem; font-size: 1.6rem; color: #1a1f36; }
    .sections { display: flex; flex-direction: column; gap: 1.5rem; }
    .card { background: #fff; border-radius: 10px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
    h2 { margin: 0 0 1.25rem; font-size: 1.05rem; color: #1a1f36; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: .85rem; font-weight: 500; color: #4a5568; margin-bottom: 4px; }
    input, select { width: 100%; padding: .6rem .75rem; border: 1.5px solid #e2e8f0; border-radius: 6px; font-size: .9rem; box-sizing: border-box; }
    input:disabled { background: #f7f8fc; color: #a0aec0; }
    small { font-size: .75rem; color: #a0aec0; }
    .checkbox-label { display: flex; align-items: center; gap: .4rem; cursor: pointer; }
    .checkbox-label input { width: auto; }
    .form-actions { display: flex; justify-content: flex-end; margin-top: .5rem; }
    .btn { padding: .6rem 1.25rem; border-radius: 6px; font-size: .9rem; cursor: pointer; border: none; }
    .btn-primary { background: #667eea; color: #fff; }
    .btn-primary:disabled { opacity: .6; }
    .alert-success { background: #f0fff4; color: #276749; padding: .5rem .75rem; border-radius: 6px; font-size: .85rem; margin-bottom: .75rem; }
    .booking-link-desc { font-size: .85rem; color: #718096; margin: 0 0 .75rem; }
    .booking-link-box { display: flex; align-items: center; background: #f7f8fc; border-radius: 8px; padding: .75rem 1rem; gap: 1rem; }
    .link-text { flex: 1; font-size: .85rem; color: #4a5568; word-break: break-all; }
    .btn-copy { padding: .4rem .85rem; background: #667eea; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: .82rem; flex-shrink: 0; }
  `]
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
