import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageSwitcherComponent } from './shared/components/language-switcher/language-switcher.component';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle.component';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [
		RouterOutlet,
		RouterLink,
		TranslatePipe,
		LanguageSwitcherComponent,
		ThemeToggleComponent,
	],
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
