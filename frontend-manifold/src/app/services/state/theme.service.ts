import { DOCUMENT, Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { STORAGE_KEYS } from '../../core/constants/app-constants';
import { Theme } from '../../core/types/theme-types';

@Injectable({ providedIn: 'root' })
export class ThemeService {
	private document = inject(DOCUMENT);
	private themeSubject = new BehaviorSubject<Theme>('light');

	readonly theme$: Observable<Theme> = this.themeSubject.asObservable();

	get current(): Theme {
		return this.themeSubject.value;
	}

	init(): void {
		this.apply(this.resolveInitialTheme());
	}

	setTheme(theme: Theme): void {
		this.apply(theme);
		this.persist(theme);
	}

	toggle(): void {
		if (this.current === 'light') {
			this.setTheme('dark');
		} else {
			this.setTheme('light');
		}
	}

	private apply(theme: Theme): void {
		this.document.documentElement.dataset['theme'] = theme;
		this.themeSubject.next(theme);
	}

	private resolveInitialTheme(): Theme {
		const stored = this.readStored();
		if (stored !== null) {
			return stored;
		}

		const view = this.document.defaultView;
		if (view !== null && view.matchMedia('(prefers-color-scheme: dark)').matches) {
			return 'dark';
		}
		return 'light';
	}

	private readStored(): Theme | null {
		try {
			const value = this.document.defaultView?.localStorage.getItem(STORAGE_KEYS.theme);
			if (value === 'light' || value === 'dark') {
				return value;
			}
			return null;
		} catch {
			return null;
		}
	}

	private persist(theme: Theme): void {
		try {
			this.document.defaultView?.localStorage.setItem(STORAGE_KEYS.theme, theme);
		} catch {
			console.warn('Theme preference could not be persisted.');
		}
	}
}
