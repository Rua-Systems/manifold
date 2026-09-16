import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
	selector: 'app-home',
	standalone: true,
	imports: [TranslatePipe],
	templateUrl: './home.component.html',
	styleUrl: './home.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {}
