import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../../../core/services/admin-api.service';
import { AdminUser } from '../../../core/models/admin-models';

/**
 * SuperAdmin user-management screen. Lists current SuperAdmins and lets
 * you add new ones (via inline form) or revoke existing ones (with the
 * server-side guards: can't revoke yourself or the last SuperAdmin).
 */
@Component({
  selector: 'app-admin-users-list',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './admin-users-list.component.html',
  styleUrls: ['./admin-users-list.component.scss']
})
export class AdminUsersListComponent implements OnInit {
  private api = inject(AdminApiService);

  rows = signal<AdminUser[]>([]);
  loading = signal(false);
  error = signal('');

  // Inline add-form state
  formOpen = signal(false);
  saving = signal(false);
  formError = signal('');
  newEmail = '';
  newFirstName = '';
  newLastName = '';
  newPassword = '';

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.listAdminUsers().subscribe({
      next: rows => { this.rows.set(rows); this.loading.set(false); },
      error: err => {
        this.error.set(typeof err.error === 'string' ? err.error : 'Failed to load admin users.');
        this.loading.set(false);
      }
    });
  }

  openForm() {
    this.formOpen.set(true);
    this.formError.set('');
    this.newEmail = '';
    this.newFirstName = '';
    this.newLastName = '';
    this.newPassword = '';
  }

  closeForm() {
    this.formOpen.set(false);
  }

  submitNew() {
    this.formError.set('');
    if (!this.newEmail.trim()) { this.formError.set('Email is required.'); return; }
    if (!this.newFirstName.trim()) { this.formError.set('First name is required.'); return; }
    if (!this.newLastName.trim()) { this.formError.set('Last name is required.'); return; }
    if (this.newPassword.length < 8) {
      this.formError.set('Password must be at least 8 characters.');
      return;
    }

    this.saving.set(true);
    this.api.createAdminUser({
      email: this.newEmail.trim(),
      firstName: this.newFirstName.trim(),
      lastName: this.newLastName.trim(),
      password: this.newPassword
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.load();
      },
      error: err => {
        this.formError.set(typeof err.error === 'string' ? err.error : 'Could not create SuperAdmin.');
        this.saving.set(false);
      }
    });
  }

  revoke(u: AdminUser) {
    if (u.isSelf) return;
    if (!confirm(`Revoke SuperAdmin access for ${u.email}? This deletes the account.`)) return;
    this.api.revokeAdminUser(u.id).subscribe({
      next: () => this.load(),
      error: err => this.error.set(typeof err.error === 'string' ? err.error : 'Could not revoke.')
    });
  }

  formatDate(s: string): string {
    return new Date(s).toLocaleString();
  }
}
