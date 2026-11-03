import { Component, Service, inject } from "@angular/core";
import { OrigamiButton } from "@loozo/origami-ui/button";
import {
  OrigamiToast,
  OrigamiToastClose,
  OrigamiToastRegion,
  OrigamiToaster,
} from "@loozo/origami-ui/toast";

/** What the application's toasts show; Origami never reads it. */
export interface AppToast {
  title: string;
  description?: string;
  kind: "success" | "info" | "warning" | "error";
}

/** The application's toaster, declared once; inject it anywhere to add a toast. */
@Service()
export class AppToasts extends OrigamiToaster<AppToast> {}

// The region is authored once, usually in the root component, so it's in the server's HTML
// before any toast. The buttons stand in for code anywhere in the application.
@Component({
  selector: "app-notifications",
  imports: [OrigamiButton, OrigamiToastRegion, OrigamiToast, OrigamiToastClose],
  template: `
    <button ogButton (click)="saved()">Save</button>
    <button ogButton (click)="failed()">Fail</button>

    <section
      [ogToastRegion]="toasts"
      #region="ogToastRegion"
      aria-label="Notifications"
      class="toaster"
    >
      <ol>
        @for (toast of region.state.toasts(); track toast.id) {
          <li [ogToast]="toast" [attr.data-kind]="toast.data.kind" class="toast">
            <p class="title">{{ toast.data.title }}</p>
            @if (toast.data.description) {
              <p>{{ toast.data.description }}</p>
            }
            <button ogToastClose aria-label="Close">×</button>
          </li>
        }
      </ol>
    </section>
  `,
  styles: `
    .toaster {
      position: fixed;
      inset-block-end: 1rem;
      inset-inline-end: 1rem;
      inline-size: min(20rem, calc(100vw - 2rem));
    }

    .toaster ol {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .toast {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: start;
      padding: 0.75rem;
      border: 1px solid currentColor;
      border-radius: 0.5rem;
      background: var(--surface, Canvas);
    }

    .toast[data-kind="error"] {
      border-color: #f87171;
    }

    .toast > p {
      grid-column: 1;
      margin: 0;
    }

    .toast > button {
      grid-column: 2;
      grid-row: 1;
    }

    .toast[data-entering] {
      animation: fade 150ms ease-out;
    }

    .toast[data-leaving] {
      animation: fade 150ms ease-in reverse forwards;
    }

    @keyframes fade {
      from {
        opacity: 0;
        translate: 0 0.5rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast[data-entering],
      .toast[data-leaving] {
        animation: none;
      }
    }
  `,
})
export class Notifications {
  protected readonly toasts = inject(AppToasts);

  saved(): void {
    this.toasts.add({ title: "Invoice saved", kind: "success" });
  }

  failed(): void {
    this.toasts.add(
      { title: "Couldn't save the invoice", description: "Try again.", kind: "error" },
      { duration: 8000 },
    );
  }
}
