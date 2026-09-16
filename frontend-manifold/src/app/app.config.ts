import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
	ApplicationConfig,
	inject,
	provideAppInitializer,
	provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { DEFAULT_LANGUAGE } from './core/constants/app-constants';
import { apiInterceptor } from './core/interceptors/api.interceptor';
import { LanguageService } from './services/state/language.service';
import { ThemeService } from './services/state/theme.service';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideRouter(routes),
		provideHttpClient(withInterceptors([apiInterceptor])),
		provideTranslateService({
			loader: provideTranslateHttpLoader({ prefix: './i18n/', suffix: '.json' }),
			fallbackLang: DEFAULT_LANGUAGE,
		}),
		provideAppInitializer(() => {
			inject(ThemeService).init();
			inject(LanguageService).init();
		}),
	],
};
