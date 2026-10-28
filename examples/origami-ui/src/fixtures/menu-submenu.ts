import {
  Component,
  DOCUMENT,
  ViewEncapsulation,
  afterNextRender,
  inject,
  model,
  signal,
  viewChild,
} from "@angular/core";
import type { WritableSignal } from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogContent,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiMenu,
  OrigamiMenuCheckboxItem,
  OrigamiMenuContent,
  OrigamiMenuItem,
  OrigamiMenuSub,
  OrigamiMenuSubTrigger,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

// Menu cases MN33–MN43 and MN46–MN51: submenus. Edit has two submenus, Move to with a nested More,
// and Share with a checkbox item, and a disabled one; Format reads right to left; Tools is in a
// Dialog; Files has a submenu placed below its sub-trigger and one that arrives open; Panels has
// two submenus whose effects run in the reverse of their document order; Mail has a submenu in an
// open shadow root inside its Content and a sibling submenu outside it.
// Controls the tests use as script actions are buttons.

function increment(value: number): number {
  return value + 1;
}

/** MN50, MN51: a submenu and a spacer below its sub-trigger in an open shadow root inside Content. */
@Component({
  selector: "acceptance-menu-submenu-shadow",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [OrigamiMenuContent, OrigamiMenuItem, OrigamiMenuSub, OrigamiMenuSubTrigger],
  template: `
    <div ogMenuSub [(open)]="open">
      <button ogMenuSubTrigger data-testid="mail-send">Send to</button>
      <div ogMenuContent data-testid="send-content" class="menu">
        <button ogMenuItem data-testid="send-phone">Phone</button>
      </div>
    </div>
    <div data-testid="send-spacer" class="spacer"></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
    }
    .menu {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      min-inline-size: 120px;
    }
    .menu:popover-open {
      display: flex;
      flex-direction: column;
    }
    [role="menuitem"] {
      inline-size: 100%;
      text-align: start;
      padding-block: 4px;
    }
    [role="menuitem"]:focus {
      background: #444466;
      outline: none;
    }
    .spacer {
      block-size: 24px;
    }
  `,
})
export class MenuSubmenuShadow {
  readonly open = model(false);
}

@Component({
  selector: "acceptance-menu-submenu",
  imports: [
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuCheckboxItem,
    OrigamiMenuSub,
    OrigamiMenuSubTrigger,
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    MenuSubmenuShadow,
  ],
  template: `
    <section>
      <h2>Edit</h2>
      <button type="button" data-testid="edit-before">Before edit</button>
      <div ogMenu #edit="ogMenu" [(open)]="editOpen" (openChange)="changed('edit', $event)">
        <button ogMenuTrigger data-testid="edit-trigger">Edit</button>
        <div ogMenuContent data-testid="edit-content" class="menu">
          <button ogMenuItem data-testid="edit-undo" (select)="record('undo')">Undo</button>
          <div
            ogMenuSub
            #move="ogMenuSub"
            data-testid="move-sub"
            [(open)]="moveOpen"
            (openChange)="changed('move', $event); keep($event, move)"
          >
            <button ogMenuSubTrigger #moveTrigger="ogMenuSubTrigger" data-testid="edit-move">
              Move to
            </button>
            <div ogMenuContent data-testid="move-content" class="menu">
              <button ogMenuItem data-testid="move-inbox" (select)="record('inbox')">Inbox</button>
              <button ogMenuItem data-testid="move-archive" (select)="record('archive')">
                Archive
              </button>
              <button ogMenuItem data-testid="move-drafts" (select)="record('drafts')">
                Drafts
              </button>
              <button ogMenuItem data-testid="move-sent" (select)="record('sent')">Sent</button>
              <div
                ogMenuSub
                #more="ogMenuSub"
                [(open)]="moreOpen"
                (openChange)="changed('more', $event)"
              >
                <button ogMenuSubTrigger data-testid="move-more">More</button>
                <div ogMenuContent data-testid="more-content" class="menu">
                  <button ogMenuItem data-testid="more-trash" (select)="record('trash')">
                    Trash
                  </button>
                  <button ogMenuItem data-testid="more-spam" (select)="record('spam')">Spam</button>
                </div>
              </div>
            </div>
          </div>
          <button ogMenuItem data-testid="edit-rename" (select)="record('rename')">Rename</button>
          <button ogMenuItem data-testid="edit-delete" (select)="record('delete')">Delete</button>
          <div ogMenuSub [(open)]="shareOpen" (openChange)="changed('share', $event)">
            <button ogMenuSubTrigger data-testid="edit-share">Share</button>
            <div ogMenuContent data-testid="share-content" class="menu">
              <button ogMenuItem data-testid="share-email" (select)="record('email')">Email</button>
              <button
                ogMenuCheckboxItem
                data-testid="share-notify"
                [(checked)]="notify"
                (select)="record('notify')"
              >
                Notify
              </button>
            </div>
          </div>
          <div ogMenuSub [(open)]="exportOpen">
            <button
              ogMenuSubTrigger
              disabled
              data-testid="edit-export"
              (click)="exportClicks.update(increment)"
            >
              Export
            </button>
            <div ogMenuContent data-testid="export-content" class="menu">
              <button ogMenuItem data-testid="export-pdf">PDF</button>
            </div>
          </div>
        </div>
      </div>
      <button type="button" data-testid="edit-after">After edit</button>
      <output data-testid="edit-state"
        >{{ editOpen() }} {{ moveOpen() }} {{ moreOpen() }} {{ shareOpen() }}
        {{ exportOpen() }}</output
      >
      <output data-testid="move-state"
        >{{ move.state.open() }} {{ moveTrigger.state.open() }}</output
      >
      <output data-testid="edit-selected">{{ selections().join(",") }}</output>
      <output data-testid="edit-changes">{{ changes().join(",") }}</output>
      <output data-testid="edit-notify">{{ notify() }}</output>
      <output data-testid="export-clicks">{{ exportClicks() }}</output>
      <output data-testid="move-opened-at">{{ moveOpenedAt() }}</output>
      <output data-testid="move-closed-at">{{ moveClosedAt() }}</output>
      <button type="button" data-testid="edit-close" (click)="editOpen.set(false)">
        Close Edit
      </button>
      <button type="button" data-testid="edit-reopen" (click)="reopen(edit.open)">
        Close and reopen Edit
      </button>
      <button type="button" data-testid="move-reopen" (click)="reopen(move.open)">
        Close and reopen Move to
      </button>
      <button
        type="button"
        data-testid="move-open-edit-reopen"
        (click)="openThenReopen(move.open, edit.open)"
      >
        Open Move to, close and reopen Edit
      </button>
      <button
        type="button"
        data-testid="more-open-move-reopen"
        (click)="openThenReopen(more.open, move.open)"
      >
        Open More, close and reopen Move to
      </button>
      <button type="button" data-testid="share-open" (click)="shareOpen.set(true)">
        Open Share
      </button>
      <button type="button" data-testid="arm-keep-move" (click)="keepMove = true">
        Reopen Move to when it next closes
      </button>
    </section>

    <section dir="rtl">
      <h2>Format</h2>
      <div ogMenu [(open)]="formatOpen">
        <button ogMenuTrigger data-testid="format-trigger">Format</button>
        <div ogMenuContent data-testid="format-content" class="menu">
          <button ogMenuItem data-testid="format-bold">Bold</button>
          <div ogMenuSub [(open)]="alignOpen">
            <button ogMenuSubTrigger data-testid="format-align">Align</button>
            <div ogMenuContent data-testid="align-content" class="menu">
              <button ogMenuItem data-testid="align-right">Right</button>
              <button ogMenuItem data-testid="align-center">Center</button>
            </div>
          </div>
          <button ogMenuItem data-testid="format-italic">Italic</button>
        </div>
      </div>
      <output data-testid="format-state">{{ formatOpen() }} {{ alignOpen() }}</output>
    </section>

    <section>
      <h2>Files</h2>
      <div ogMenu [(open)]="filesOpen">
        <button ogMenuTrigger data-testid="files-trigger">Files</button>
        <div ogMenuContent data-testid="files-content" class="menu">
          <button ogMenuItem data-testid="files-copy">Copy</button>
          <div ogMenuSub [(open)]="openWithOpen">
            <button ogMenuSubTrigger data-testid="files-open-with">Open with</button>
            <div
              ogMenuContent
              side="block-end"
              [gap]="60"
              data-testid="open-with-content"
              class="menu"
            >
              <button ogMenuItem data-testid="open-with-editor">Editor</button>
              <button ogMenuItem data-testid="open-with-viewer">Viewer</button>
            </div>
          </div>
          <button ogMenuItem data-testid="files-alpha">Alpha</button>
          <button ogMenuItem data-testid="files-beta">Beta</button>
          @if (lateMounted()) {
            <div ogMenuSub [(open)]="lateOpen">
              <button ogMenuSubTrigger data-testid="files-late">Late</button>
              <div ogMenuContent data-testid="files-late-content" class="menu">
                <button ogMenuItem data-testid="files-late-one">One</button>
              </div>
            </div>
          }
        </div>
      </div>
      <output data-testid="files-state"
        >{{ filesOpen() }} {{ openWithOpen() }} {{ lateOpen() }}</output
      >
      <button type="button" data-testid="files-mount-late" (click)="mountLate()">
        Mount Late, open
      </button>
    </section>

    <section>
      <h2>Panels</h2>
      <div ogMenu [(open)]="panelsOpen">
        <button ogMenuTrigger data-testid="panels-trigger">Panels</button>
        <div ogMenuContent data-testid="panels-content" class="menu">
          <!-- An embedded view: its effects run after the menu's own, so Left's after Right's. -->
          @if (true) {
            <div ogMenuSub #left="ogMenuSub" [(open)]="leftOpen">
              <button ogMenuSubTrigger data-testid="panels-left">Left</button>
              <div ogMenuContent data-testid="left-content" class="menu">
                <button ogMenuItem>Narrow</button>
              </div>
            </div>
          }
          <div ogMenuSub #right="ogMenuSub" [(open)]="rightOpen">
            <button ogMenuSubTrigger data-testid="panels-right">Right</button>
            <div ogMenuContent data-testid="right-content" class="menu">
              <button ogMenuItem>Wide</button>
            </div>
          </div>
        </div>
      </div>
      <output data-testid="panels-state"
        >{{ panelsOpen() }} {{ leftOpen() }} {{ rightOpen() }}</output
      >
      <button type="button" data-testid="panels-left-right" (click)="openPanels(true)">
        Open Left, then Right
      </button>
      <button type="button" data-testid="panels-right-left" (click)="openPanels(false)">
        Open Right, then Left
      </button>
    </section>

    <section>
      <h2>Mail</h2>
      <!-- Client-only: the shadow root isn't server-rendered. -->
      @if (shadowMounted()) {
        <div ogMenu [(open)]="mailOpen">
          <button ogMenuTrigger data-testid="mail-trigger">Mail</button>
          <div ogMenuContent data-testid="mail-content" class="menu">
            <button ogMenuItem data-testid="mail-reply">Reply</button>
            <acceptance-menu-submenu-shadow
              [(open)]="sendOpen"
              (openChange)="sendChanged($event)"
            />
            <div ogMenuSub [(open)]="forwardOpen">
              <button ogMenuSubTrigger data-testid="mail-forward">Forward</button>
              <div ogMenuContent data-testid="forward-content" class="menu">
                <button ogMenuItem data-testid="forward-team">Team</button>
              </div>
            </div>
          </div>
        </div>
      }
      <output data-testid="send-opened-at">{{ sendOpenedAt() }}</output>
      <output data-testid="mail-state"
        >{{ mailOpen() }} {{ sendOpen() }} {{ forwardOpen() }}</output
      >
      <button type="button" data-testid="forward-open" (click)="forwardOpen.set(true)">
        Open Forward
      </button>
    </section>

    <section>
      <h2>Tools in a dialog</h2>
      <div ogDialog [(open)]="toolsDialogOpen">
        <button ogDialogTrigger data-testid="tools-dialog-trigger">Open tools</button>
        <dialog ogDialogContent data-testid="tools-dialog">
          <div ogMenu [(open)]="toolsOpen">
            <button ogMenuTrigger data-testid="tools-trigger">Tools</button>
            <div ogMenuContent data-testid="tools-content" class="menu">
              <div ogMenuSub [(open)]="insertOpen">
                <button ogMenuSubTrigger data-testid="tools-insert">Insert</button>
                <div ogMenuContent data-testid="insert-content" class="menu">
                  <button ogMenuItem data-testid="insert-table" (select)="record('table')">
                    Table
                  </button>
                  <button ogMenuItem data-testid="insert-image">Image</button>
                </div>
              </div>
              <button ogMenuItem data-testid="tools-spell">Spelling</button>
            </div>
          </div>
        </dialog>
      </div>
      <output data-testid="tools-state"
        >{{ toolsDialogOpen() }} {{ toolsOpen() }} {{ insertOpen() }}</output
      >
    </section>
  `,
  styles: `
    .menu {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
      min-inline-size: 120px;
    }
    .menu:popover-open {
      display: flex;
      flex-direction: column;
    }
    .menu [role^="menuitem"] {
      text-align: start;
      padding-block: 4px;
    }
    .menu [role^="menuitem"]:focus {
      background: #444466;
      outline: none;
    }
    .menu [role^="menuitem"][data-disabled] {
      opacity: 0.5;
    }
    dialog {
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      inline-size: 360px;
    }
  `,
})
export class MenuSubmenu {
  protected readonly increment = increment;

  readonly editOpen = signal(false);
  readonly moveOpen = signal(false);
  readonly moreOpen = signal(false);
  readonly shareOpen = signal(false);
  readonly exportOpen = signal(false);
  readonly notify = signal(false);
  readonly exportClicks = signal(0);
  /** `performance.now()` when Move to's submenu last opened and closed, -1 before. */
  readonly moveOpenedAt = signal(-1);
  readonly moveClosedAt = signal(-1);
  /** `name@testid@open`: each `(select)`, what was focused and every `open` while it ran. */
  readonly selections = signal<readonly string[]>([]);
  /** `name:open` for each `openChange` of Edit and its submenus, in the order they ran. */
  readonly changes = signal<readonly string[]>([]);

  /** Whether Move to's next close is undone by its `openChange` listener. */
  protected keepMove = false;

  readonly formatOpen = signal(false);

  readonly filesOpen = signal(false);
  readonly openWithOpen = signal(false);
  readonly lateMounted = signal(false);
  readonly lateOpen = signal(false);
  readonly alignOpen = signal(false);

  readonly panelsOpen = signal(false);
  readonly leftOpen = signal(false);
  readonly rightOpen = signal(false);
  readonly left = viewChild.required<OrigamiMenuSub>("left");
  readonly right = viewChild.required<OrigamiMenuSub>("right");

  readonly shadowMounted = signal(false);
  readonly mailOpen = signal(false);
  readonly sendOpen = signal(false);
  readonly forwardOpen = signal(false);
  /** `performance.now()` when Send to's submenu last opened, -1 before. */
  readonly sendOpenedAt = signal(-1);

  readonly toolsDialogOpen = signal(false);
  readonly toolsOpen = signal(false);
  readonly insertOpen = signal(false);

  readonly #document = inject(DOCUMENT);

  constructor() {
    afterNextRender(() => this.shadowMounted.set(true));
  }

  protected record(name: string): void {
    const focused = this.#document.activeElement?.getAttribute("data-testid") ?? "none";
    const open = [
      this.editOpen(),
      this.moveOpen(),
      this.moreOpen(),
      this.shareOpen(),
      this.toolsOpen(),
      this.insertOpen(),
    ].join("/");

    this.selections.update((entries) => [...entries, `${name}@${focused}@${open}`]);
  }

  /** Writes `open` false and then true, before effects run. */
  protected reopen(open: WritableSignal<boolean>): void {
    open.set(false);
    open.set(true);
  }

  /** Writes `sub` true, then `open` false and true, before effects run. */
  protected openThenReopen(sub: WritableSignal<boolean>, open: WritableSignal<boolean>): void {
    sub.set(true);
    this.reopen(open);
  }

  /** Writes Left's and Right's models true, Left's first or last, before effects run. */
  protected openPanels(leftFirst: boolean): void {
    const subs = [this.left(), this.right()];

    if (!leftFirst) {
      subs.reverse();
    }

    for (const sub of subs) {
      sub.open.set(true);
    }
  }

  /** Move to's `openChange`: once armed, a close reopens it through its model, inside the write. */
  protected keep(open: boolean, move: OrigamiMenuSub): void {
    if (open || !this.keepMove) {
      return;
    }

    this.keepMove = false;
    move.open.set(true);
  }

  /** Mounts Late with its `open` already true. */
  protected mountLate(): void {
    this.lateOpen.set(true);
    this.lateMounted.set(true);
  }

  protected sendChanged(open: boolean): void {
    if (open) {
      this.sendOpenedAt.set(performance.now());
    }
  }

  protected changed(name: string, open: boolean): void {
    this.changes.update((entries) => [...entries, `${name}:${open}`]);

    if (name !== "move") {
      return;
    }

    if (open) {
      this.moveOpenedAt.set(performance.now());
    } else {
      this.moveClosedAt.set(performance.now());
    }
  }
}
