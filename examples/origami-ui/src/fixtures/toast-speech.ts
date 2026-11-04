import { Component, Service, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import {
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiToast,
  OrigamiToastClose,
  OrigamiToastRegion,
  OrigamiToaster,
} from "@loozo/origami-ui/toast";

// The Screen reader workflow's speech-only page (toast-speech.spec.ts): nothing on it is live but
// the toast region and the native control's region, so a reader's capture holds only what they
// and focus changes caused. The query picks the markup a scenario isolates:
//   list=ol|ol-none|ul   the toast list: numbered, numbered with `list-style: none`, or bulleted
//   close=label|text     the Close button: aria-label="Close" with a visible ×, or visually hidden
//                        "Close" text with an aria-hidden ×
//   release=task|frame   when the native control writes "Saved": in Save's task, or one frame later

/** The page's toast data: `key` names its test ID. */
export interface SpeechToast {
  key: string;
  title: string;
}

@Service()
export class SpeechToasts extends OrigamiToaster<SpeechToast> {}

const lists = ["ol", "ol-none", "ul"] as const;
const closes = ["label", "text"] as const;
const releases = ["task", "frame"] as const;

/** The query parameter `name`, one of `allowed`; the first when absent. */
function pick<T extends string>(route: ActivatedRoute, name: string, allowed: readonly T[]): T {
  const value = route.snapshot.queryParamMap.get(name);

  if (value === null) {
    return allowed[0];
  }

  for (const option of allowed) {
    if (option === value) {
      return option;
    }
  }

  throw new Error(`Unknown ${name}=${value}; expected one of ${allowed.join(", ")}`);
}

@Component({
  selector: "acceptance-toast-speech-fixture",
  imports: [
    OrigamiToastRegion,
    OrigamiToast,
    OrigamiToastClose,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogClose,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach the page
    </button>
    <span data-testid="fixture-attached">{{ attached() }}</span>

    <section>
      <h2>Todos</h2>
      <button type="button" data-testid="create-todo" (click)="createTodo()">Create todo</button>
    </section>

    <section>
      <h2>Editor</h2>
      <div ogDialog [(open)]="editorOpen">
        <button ogDialogTrigger data-testid="editor-trigger">Editor</button>
        <dialog ogDialogContent data-testid="editor-content">
          <h2 ogDialogTitle>Editor</h2>
          <button type="button" data-testid="editor-copy" (click)="copyLink()">Copy link</button>
          <button ogDialogClose data-testid="editor-close">Close</button>
        </dialog>
      </div>
    </section>

    <!-- The control: a native modal dialog and a plain live region, no Origami. -->
    <section>
      <h2>Native</h2>
      <button type="button" data-testid="native-open" (click)="native.showModal()">
        Native editor
      </button>
      <dialog #native data-testid="native-content">
        <h2>Native editor</h2>
        <button type="button" data-testid="native-save" (click)="save(native, status)">Save</button>
      </dialog>
      <div #status aria-live="polite" data-testid="native-status"></div>
    </section>

    <section
      [ogToastRegion]="toasts"
      #region="ogToastRegion"
      [duration]="duration"
      [limit]="3"
      aria-label="Notifications"
      data-testid="region"
    >
      @if (list === "ul") {
        <ul>
          @for (toast of region.state.toasts(); track toast.id) {
            <li [ogToast]="toast" [attr.data-testid]="'toast-' + toast.data.key">
              {{ toast.data.title }}
              @if (close === "label") {
                <button ogToastClose aria-label="Close">×</button>
              } @else {
                <button ogToastClose>
                  <span class="visually-hidden">Close</span><span aria-hidden="true">×</span>
                </button>
              }
            </li>
          }
        </ul>
      } @else {
        <ol [class.unmarked]="list === 'ol-none'">
          @for (toast of region.state.toasts(); track toast.id) {
            <li [ogToast]="toast" [attr.data-testid]="'toast-' + toast.data.key">
              {{ toast.data.title }}
              @if (close === "label") {
                <button ogToastClose aria-label="Close">×</button>
              } @else {
                <button ogToastClose>
                  <span class="visually-hidden">Close</span><span aria-hidden="true">×</span>
                </button>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: `
    dialog {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }

    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }

    .unmarked {
      list-style: none;
    }

    /* Clipped, not display: none, so it stays in the accessibility tree. */
    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class ToastSpeechFixture {
  readonly toasts = inject(SpeechToasts);
  readonly #route = inject(ActivatedRoute);
  readonly list = pick(this.#route, "list", lists);
  readonly close = pick(this.#route, "close", closes);
  readonly release = pick(this.#route, "release", releases);
  /** Nothing expires while a reader's capture runs. */
  readonly duration = Infinity;
  readonly attached = signal(false);
  readonly editorOpen = signal(false);
  #todos = 0;
  #links = 0;

  createTodo(): void {
    this.#todos += 1;
    this.toasts.add({ key: `todo-${this.#todos}`, title: `Todo ${this.#todos} created` });
  }

  /** Held while the Editor is modal, shown once it closes. */
  copyLink(): void {
    this.#links += 1;
    this.toasts.add({ key: `link-${this.#links}`, title: "Link copied" });
  }

  /** Closes the native dialog, which returns focus, then writes into the already-mounted region. */
  save(dialog: HTMLDialogElement, status: HTMLElement): void {
    dialog.close();

    if (this.release === "task") {
      status.textContent = "Saved";
      return;
    }

    requestAnimationFrame(() => {
      status.textContent = "Saved";
    });
  }
}
