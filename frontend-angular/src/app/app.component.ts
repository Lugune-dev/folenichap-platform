import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaBarComponent } from './shared/pwa-bar.component';
import { RouteProgressComponent } from './shared/route-progress.component';
import { ToastHostComponent } from './shared/toast-host.component';

@Component({
    selector: 'fc-root',
    imports: [RouterOutlet, ToastHostComponent, PwaBarComponent, RouteProgressComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<fc-route-progress /><fc-toast-host /><router-outlet /><fc-pwa-bar />`
})
export class AppComponent {}
