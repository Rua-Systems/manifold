import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { Theme } from '../../../core/types/theme-types';
import { ThemeService } from '../../../services/state/theme.service';

@Component({
	selector: 'app-theme-toggle',
	standalone: true,
	imports: [AsyncPipe, TranslatePipe],
	templateUrl: './theme-toggle.component.html',
	styleUrl: './theme-toggle.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggleComponent {
	private themeService = inject(ThemeService);

	protected readonly theme$: Observable<Theme> = this.themeService.theme$;

	protected toggle(): void {
		this.themeService.toggle();
	}
}
