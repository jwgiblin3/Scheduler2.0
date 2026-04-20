import { ApplicationConfig, provideBrowserGlobalErrorListeners, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { IntlModule } from '@progress/kendo-angular-intl';
import { MessageService } from '@progress/kendo-angular-l10n';
import { routes } from './app.routes';
import { authInterceptor } from './core/services/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),                  // required by Kendo components
    importProvidersFrom(IntlModule),      // required by kendo-angular-scheduler
    MessageService,                       // l10n dependency used internally by Scheduler
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
