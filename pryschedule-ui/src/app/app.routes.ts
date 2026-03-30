import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },

  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent)
  },

  // Admin / Staff shell
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
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/settings/practice-settings.component').then(m => m.PracticeSettingsComponent)
      }
    ]
  },

  // Public client booking portal
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

  { path: '**', redirectTo: '/dashboard' }
];
