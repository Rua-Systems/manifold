import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { SUPPORTED_LANGUAGES } from '../../../core/constants/app-constants';
import { Language } from '../../../core/types/language-types';
import { LanguageService } from '../../../services/state/language.service';

@Component({
	selector: 'app-language-switcher',
	standalone: true,
	imports: [AsyncPipe, TranslatePipe],
	templateUrl: './language-switcher.component.html',
	styleUrl: './language-switcher.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcherComponent {
	private languageService = inject(LanguageService);

	protected readonly languages: readonly Language[] = SUPPORTED_LANGUAGES;
	protected readonly language$: Observable<Language> = this.languageService.language$;

	protected select(language: Language): void {
		this.languageService.use(language);
	}
}
