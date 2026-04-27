import { Routes } from '@angular/router';
import { authGuard, adminGuard, superAdminGuard, clientGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },

  // --- Auth ---
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'my/register',
    loadComponent: () => import('./features/auth/client-register.component').then(m => m.ClientRegisterComponent)
  },
  {
    path: 'my/create-practice',
    canActivate: [clientGuard],
    loadComponent: () => import('./features/auth/create-practice.component').then(m => m.CreatePracticeComponent)
  },

  // --- Unified landing (any signed-in user) ---
  {
    path: 'home',
    canActivate: [clientGuard],
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
  },

  // --- Client portal ("My Appointments") ---
  {
    path: 'my/appointments',
    canActivate: [clientGuard],
    loadComponent: () => import('./features/client/my-appointments.component').then(m => m.MyAppointmentsComponent)
  },

  // --- SuperAdmin Console (platform-level operator only) ---
  // Server-side authz on the actual API endpoints uses the "ManageGlobals"
  // / "SuperAdmin" policies; this guard is just a UX filter so practice
  // admins don't get empty 403 pages.
  {
    path: 'admin',
    canActivate: [superAdminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/admin/admin-home.component').then(m => m.AdminHomeComponent)
      },
      {
        path: 'field-groups',
        loadComponent: () => import('./features/admin/field-groups/field-groups-list.component').then(m => m.FieldGroupsListComponent)
      },
      {
        path: 'field-groups/new',
        loadComponent: () => import('./features/admin/field-groups/field-group-edit.component').then(m => m.FieldGroupEditComponent)
      },
      {
        path: 'field-groups/:id/edit',
        loadComponent: () => import('./features/admin/field-groups/field-group-edit.component').then(m => m.FieldGroupEditComponent)
      },
      {
        path: 'audit',
        loadComponent: () => import('./features/admin/audit-log/audit-log.component').then(m => m.AuditLogComponent)
      },
      // Form templates — list + create + edit. Same versioning model as
      // field groups: editing creates a new version row, older versions stay.
      {
        path: 'form-templates',
        loadComponent: () => import('./features/admin/form-templates/form-templates-list.component').then(m => m.FormTemplatesListComponent)
      },
      {
        path: 'form-templates/new',
        loadComponent: () => import('./features/admin/form-templates/form-template-edit.component').then(m => m.FormTemplateEditComponent)
      },
      {
        path: 'form-templates/:id/edit',
        loadComponent: () => import('./features/admin/form-templates/form-template-edit.component').then(m => m.FormTemplateEditComponent)
      },
      // Cross-tenant practices browser (read-only).
      {
        path: 'practices',
        loadComponent: () => import('./features/admin/practices/practices-list.component').then(m => m.PracticesListComponent)
      },
      // SuperAdmin user management.
      {
        path: 'users',
        loadComponent: () => import('./features/admin/admin-users/admin-users-list.component').then(m => m.AdminUsersListComponent)
      }
    ]
  },

  // --- Admin / Staff shell ---
  {
    path: '',
    loadComponent: () => import('./shared/components/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'appointments',
        loadComponent: () => import('./features/appointments/appointments-list.component').then(m => m.AppointmentsListComponent)
      },
      {
        path: 'appointments/:id',
        loadComponent: () => import('./features/appointments/appointment-detail.component').then(m => m.AppointmentDetailComponent)
      },
      {
        path: 'providers',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/providers/providers-list.component').then(m => m.ProvidersListComponent)
      },
      {
        path: 'providers/new',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/providers/provider-form.component').then(m => m.ProviderFormComponent)
      },
      {
        path: 'providers/:id/edit',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/providers/provider-form.component').then(m => m.ProviderFormComponent)
      },
      {
        path: 'appointment-types',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/appointment-types/appointment-types-list.component').then(m => m.AppointmentTypesListComponent)
      },
      {
        path: 'forms',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/forms/forms-list.component').then(m => m.FormsListComponent)
      },
      {
        path: 'clients',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/clients/clients-list.component').then(m => m.ClientsListComponent)
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/settings/practice-settings.component').then(m => m.PracticeSettingsComponent)
      }
    ]
  },

  // --- Embeddable widgets (no header/footer, no guards). Safe to iframe
  //     from a third-party site. CORS + frame-ancestors must be configured
  //     to allow the embedder's origin. ---
  {
    path: 'widget/book/:slug',
    loadComponent: () => import('./widgets/booking-widget/booking-widget.component').then(m => m.BookingWidgetComponent)
  },
  {
    path: 'widget/my/appointments',
    loadComponent: () => import('./widgets/my-appointments-widget/my-appointments-widget.component').then(m => m.MyAppointmentsWidgetComponent)
  },

  // --- Public client booking portal ---
  {
    path: 'book/:slug',
    loadComponent: () => import('./features/booking/booking.component').then(m => m.BookingComponent)
  },
  {
    path: 'book/:slug/intake',
    loadComponent: () => import('./features/booking/intake-form.component').then(m => m.IntakeFormComponent)
  },
  {
    path: 'book/:slug/confirm',
    loadComponent: () => import('./features/booking/booking-confirm.component').then(m => m.BookingConfirmComponent)
  },

  { path: '**', redirectTo: '/home' }
];
