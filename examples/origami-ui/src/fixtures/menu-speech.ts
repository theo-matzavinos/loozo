import { Component, DOCUMENT, afterNextRender, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  OrigamiAlertDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogTitle,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiMenu,
  OrigamiMenuCheckboxItem,
  OrigamiMenuContent,
  OrigamiMenuGroup,
  OrigamiMenuGroupLabel,
  OrigamiMenuItem,
  OrigamiMenuLink,
  OrigamiMenuRadioGroup,
  OrigamiMenuRadioItem,
  OrigamiMenuSeparator,
  OrigamiMenuSub,
  OrigamiMenuSubTrigger,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

// The Screen reader workflow's speech-only Menu page (menu.spec.ts): nothing on it is live, so a
// reader's capture holds only what focus and the menus' own changes caused. Actions has a group
// with a disabled item, a link, a submenu and Delete…, which opens an AlertDialog; View has
// checkbox items and a radio group.
//
// The page also logs what reached it, with the page's clock, into `window.menuSpeechEvents`, never
// the DOM: pointer moves over and out of elements, focus, keys and the menus' popover toggles, so a
// run can tell whether a reader moved the real mouse pointer onto an item.

/** One logged event: `target` is the nearest test ID. */
export interface MenuSpeechEvent {
  type: string;
  target: string | null;
  at: number;
  x?: number;
  y?: number;
  key?: string;
  state?: string;
}

declare global {
  interface Window {
    menuSpeechEvents?: MenuSpeechEvent[];
  }
}

const logged = [
  "pointerover",
  "pointerout",
  "pointermove",
  "focusin",
  "keydown",
  "keyup",
  "toggle",
];

function log(document: Document): void {
  const events: MenuSpeechEvent[] = [];
  const window = document.defaultView;

  if (window === null) {
    return;
  }

  window.menuSpeechEvents = events;

  for (const type of logged) {
    // Capturing, so toggle, which doesn't bubble, is seen too.
    document.addEventListener(
      type,
      (event) => {
        let target: string | null = null;

        if (event.target instanceof Element) {
          target = event.target.closest("[data-testid]")?.getAttribute("data-testid") ?? null;
        }

        const entry: MenuSpeechEvent = { type, target, at: Math.round(event.timeStamp) };
        const last = events.at(-1);

        if (event instanceof PointerEvent) {
          // Consecutive moves over one element are one entry, with the latest position.
          if (type === "pointermove" && last?.type === type && last.target === target) {
            last.x = event.clientX;
            last.y = event.clientY;
            return;
          }

          entry.x = event.clientX;
          entry.y = event.clientY;
        } else if (event instanceof KeyboardEvent) {
          entry.key = event.key;
        } else if (event instanceof ToggleEvent) {
          entry.state = event.newState;
        }

        events.push(entry);
      },
      { capture: true },
    );
  }
}

@Component({
  selector: "acceptance-menu-speech-fixture",
  imports: [
    RouterLink,
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuLink,
    OrigamiMenuGroup,
    OrigamiMenuGroupLabel,
    OrigamiMenuSeparator,
    OrigamiMenuSub,
    OrigamiMenuSubTrigger,
    OrigamiMenuCheckboxItem,
    OrigamiMenuRadioGroup,
    OrigamiMenuRadioItem,
    OrigamiAlertDialog,
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
      <h2>File</h2>
      <div ogMenu>
        <button ogMenuTrigger data-testid="actions-trigger">Actions</button>
        <div ogMenuContent class="menu" data-testid="actions-menu">
          <div ogMenuGroup>
            <span ogMenuGroupLabel>Edit</span>
            <button ogMenuItem data-testid="rename">Rename</button>
            <button ogMenuItem data-testid="duplicate">Duplicate</button>
            <button ogMenuItem disabled data-testid="archive">Archive</button>
          </div>
          <div ogMenuSeparator></div>
          <a ogMenuLink [routerLink]="[]" [queryParams]="{ details: 1 }" data-testid="details"
            >Open details</a
          >
          <div ogMenuSub>
            <button ogMenuSubTrigger data-testid="move">Move to</button>
            <div ogMenuContent class="menu" data-testid="move-menu">
              <button ogMenuItem data-testid="inbox">Inbox</button>
              <button ogMenuItem data-testid="later">Later</button>
              <button ogMenuItem data-testid="done">Done</button>
            </div>
          </div>
          <div ogMenuSeparator></div>
          <button ogMenuItem data-testid="delete" (select)="deleteOpen.set(true)">Delete…</button>
        </div>
      </div>
      <div ogAlertDialog [(open)]="deleteOpen" [dismissible]="true">
        <dialog ogDialogContent data-testid="delete-dialog">
          <h2 ogDialogTitle>Delete file?</h2>
          <button ogDialogClose autofocus data-testid="delete-cancel">Cancel</button>
          <button type="button" data-testid="delete-confirm" (click)="deleteOpen.set(false)">
            Delete
          </button>
        </dialog>
      </div>
    </section>

    <section>
      <h2>Table</h2>
      <div ogMenu>
        <button ogMenuTrigger data-testid="view-trigger">View</button>
        <div ogMenuContent class="menu" data-testid="view-menu">
          <div ogMenuGroup>
            <span ogMenuGroupLabel>Columns</span>
            <button
              ogMenuCheckboxItem
              #owner="ogMenuCheckboxItem"
              label="Owner"
              [(checked)]="showOwner"
              data-testid="owner"
            >
              <span aria-hidden="true" class="indicator">{{
                owner.state.checked() ? "✓" : ""
              }}</span>
              Owner
            </button>
            <button
              ogMenuCheckboxItem
              #due="ogMenuCheckboxItem"
              label="Due date"
              [(checked)]="showDue"
              data-testid="due"
            >
              <span aria-hidden="true" class="indicator">{{ due.state.checked() ? "✓" : "" }}</span>
              Due date
            </button>
          </div>
          <div ogMenuSeparator></div>
          <div ogMenuRadioGroup [(value)]="density">
            <span ogMenuGroupLabel>Density</span>
            <button ogMenuRadioItem value="compact" data-testid="compact">Compact</button>
            <button ogMenuRadioItem value="comfortable" data-testid="comfortable">
              Comfortable
            </button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    .menu {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      min-inline-size: 160px;
    }

    .menu:popover-open {
      display: flex;
      flex-direction: column;
    }

    .menu [role^="menuitem"]:focus {
      background: #444466;
      outline: none;
    }

    .menu [role^="menuitem"][data-disabled] {
      opacity: 0.5;
    }

    .menu [role="separator"] {
      border-block-start: 1px solid #555555;
      margin-block: 4px;
    }

    .indicator {
      display: inline-block;
      inline-size: 1em;
    }

    dialog {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }

    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }
  `,
})
export class MenuSpeechFixture {
  readonly attached = signal(false);
  readonly deleteOpen = signal(false);
  readonly showOwner = signal(true);
  readonly showDue = signal(false);
  readonly density = signal<string | null>("comfortable");

  constructor() {
    const document = inject(DOCUMENT);

    afterNextRender(() => log(document));
  }
}
