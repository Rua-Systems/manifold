import { DOCUMENT, Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
	DEFAULT_LANGUAGE,
	STORAGE_KEYS,
	SUPPORTED_LANGUAGES,
} from '../../core/constants/app-constants';
import { Language } from '../../core/types/language-types';

@Injectable({ providedIn: 'root' })
export class LanguageService {
	private document = inject(DOCUMENT);
	private translate = inject(TranslateService);
	private languageSubject = new BehaviorSubject<Language>(DEFAULT_LANGUAGE);

	readonly language$: Observable<Language> = this.languageSubject.asObservable();

	get current(): Language {
		return this.languageSubject.value;
	}

	init(): void {
		this.apply(this.resolveInitialLanguage());
	}

	use(language: Language): void {
		this.apply(language);
		this.persist(language);
	}

	private apply(language: Language): void {
		this.translate.use(language);
		this.document.documentElement.lang = language;
		this.languageSubject.next(language);
	}

	private resolveInitialLanguage(): Language {
		const stored = this.readStored();
		if (stored !== null) {
			return stored;
		}

		const browserLanguage = this.document.defaultView?.navigator.language.slice(0, 2);
		if (browserLanguage !== undefined && this.isSupported(browserLanguage)) {
			return browserLanguage;
		}
		return DEFAULT_LANGUAGE;
	}

	private readStored(): Language | null {
		try {
			const value = this.document.defaultView?.localStorage.getItem(STORAGE_KEYS.language);
			if (value !== null && value !== undefined && this.isSupported(value)) {
				return value;
			}
			return null;
		} catch {
			return null;
		}
	}

	private persist(language: Language): void {
		try {
			this.document.defaultView?.localStorage.setItem(STORAGE_KEYS.language, language);
		} catch {
			console.warn('Language preference could not be persisted.');
		}
	}

	private isSupported(value: string): value is Language {
		return SUPPORTED_LANGUAGES.some((language) => language === value);
	}
}
