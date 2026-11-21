import { Component, Service, inject } from "@angular/core";
import {
  OrigamiToast,
  OrigamiToastClose,
  OrigamiToastRegion,
  OrigamiToaster,
} from "@loozo/origami-ui/toast";

@Service()
export class BenchToasts extends OrigamiToaster<{ title: string }> {}

@Component({
  selector: "bench-root, bench-toast",
  imports: [OrigamiToastRegion, OrigamiToast, OrigamiToastClose],
  template: `
    <button type="button" (click)="toasts.add({ title: 'Invoice saved' })">Save</button>
    <section [ogToastRegion]="toasts" #region="ogToastRegion" aria-label="Notifications">
      <ol>
        @for (toast of region.state.toasts(); track toast.id) {
          <li [ogToast]="toast">
            <p>{{ toast.data.title }}</p>
            <button ogToastClose aria-label="Close">×</button>
          </li>
        }
      </ol>
    </section>
  `,
})
export class Workload {
  protected readonly toasts = inject(BenchToasts);
}
