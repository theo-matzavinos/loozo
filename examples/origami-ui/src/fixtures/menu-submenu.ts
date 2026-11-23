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
// open shadow root inside its Content and a sibling submenu outside it. MN54–MN57: the Narrow
// Menus, mounted on demand with fixed positions, are sized like fold's, so a submenu covers the
// rows it overlaps: Narrow (left to right), Narrow RTL, Narrow root inline, Narrow vertical
// (vertical-rl, right to left) and Narrow short.
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

    <!-- MN53: a fixed Menu near the block end whose submenu is taller than the viewport. -->
    <section>
      <h2>Long submenu</h2>
      <button type="button" data-testid="long-mount" (click)="longMounted.set(!longMounted())">
        Mount the long-submenu Menu
      </button>
      <button type="button" data-testid="long-near-inline-end" (click)="longNearInlineEnd()">
        Move it near the inline end
      </button>
      @if (longMounted()) {
        <div ogMenu [(open)]="longOpen">
          <button
            ogMenuTrigger
            class="long-trigger"
            data-testid="long-trigger"
            [style.left.px]="longLeft()"
            [style.top.px]="longTop()"
          >
            Long
          </button>
          <div ogMenuContent data-testid="long-content" class="menu">
            <button ogMenuItem data-testid="long-first">First</button>
            <div ogMenuSub [(open)]="longSubOpen">
              <button ogMenuSubTrigger data-testid="long-sub-trigger">Many</button>
              <div ogMenuContent data-testid="long-sub-content" class="menu long-sub">
                @for (item of longItems; track item) {
                  <button ogMenuItem [attr.data-testid]="'long-item-' + item">
                    Item {{ item }}
                  </button>
                }
              </div>
            </div>
          </div>
        </div>
      }
      <output data-testid="long-state">{{ longOpen() }} {{ longSubOpen() }}</output>
    </section>

    <!-- MN54–MN57: fixed Menus for phone-width viewports. -->
    <section>
      <h2>Narrow</h2>
      <button
        type="button"
        data-testid="narrow-mount"
        (click)="narrowMounted.set(!narrowMounted())"
      >
        Mount the narrow Menus
      </button>
      <button
        #nearBottom
        type="button"
        data-testid="narrow-near-bottom"
        (click)="narrowNearBottom(nearBottom.dataset['top'])"
      >
        Move Narrow's Trigger to its data-top
      </button>
      @if (narrowMounted()) {
        <div ogMenu [(open)]="narrowOpen">
          <button
            ogMenuTrigger
            class="narrow-trigger"
            data-testid="narrow-trigger"
            style="left: 130px"
            [style.top.px]="narrowTop()"
          >
            Narrow
          </button>
          <div ogMenuContent data-testid="narrow-content" class="narrow narrow-root">
            <button ogMenuItem data-testid="narrow-undo" (select)="narrowRecord('undo')">
              Undo
            </button>
            <div ogMenuSub [(open)]="narrowMoveOpen">
              <button ogMenuSubTrigger data-testid="narrow-move">Move to</button>
              <div
                ogMenuContent
                [gap]="4"
                data-testid="narrow-move-content"
                class="narrow narrow-sub"
              >
                <button ogMenuItem data-testid="narrow-inbox" (select)="narrowRecord('inbox')">
                  Inbox
                </button>
                <button ogMenuItem data-testid="narrow-archive" (select)="narrowRecord('archive')">
                  Archive
                </button>
                <button ogMenuItem data-testid="narrow-drafts" (select)="narrowRecord('drafts')">
                  Drafts
                </button>
                <button ogMenuItem data-testid="narrow-sent" (select)="narrowRecord('sent')">
                  Sent
                </button>
                <div ogMenuSub [(open)]="narrowMoreOpen">
                  <button ogMenuSubTrigger data-testid="narrow-more">More</button>
                  <div
                    ogMenuContent
                    [gap]="4"
                    data-testid="narrow-more-content"
                    class="narrow narrow-sub"
                  >
                    <button ogMenuItem data-testid="narrow-trash" (select)="narrowRecord('trash')">
                      Trash
                    </button>
                    <button ogMenuItem data-testid="narrow-spam" (select)="narrowRecord('spam')">
                      Spam
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button ogMenuItem data-testid="narrow-rename" (select)="narrowRecord('rename')">
              Rename
            </button>
            <button ogMenuItem data-testid="narrow-delete" (select)="narrowRecord('delete')">
              Delete
            </button>
            <div ogMenuSub [(open)]="narrowCopyOpen">
              <button ogMenuSubTrigger data-testid="narrow-copy">Copy to</button>
              <div
                ogMenuContent
                side="inline-start"
                [gap]="16"
                data-testid="narrow-copy-content"
                class="narrow narrow-sub"
              >
                <button ogMenuItem data-testid="narrow-desktop" (select)="narrowRecord('desktop')">
                  Desktop
                </button>
                <button
                  ogMenuItem
                  data-testid="narrow-downloads"
                  (select)="narrowRecord('downloads')"
                >
                  Downloads
                </button>
              </div>
            </div>
            <button ogMenuItem data-testid="narrow-share" (select)="narrowRecord('share')">
              Share
            </button>
            <div ogMenuSub [(open)]="narrowSendOpen">
              <button ogMenuSubTrigger data-testid="narrow-send">Send to</button>
              <div
                ogMenuContent
                [gap]="4"
                data-testid="narrow-send-content"
                class="narrow narrow-sub"
              >
                <button ogMenuItem data-testid="narrow-phone" (select)="narrowRecord('phone')">
                  Phone
                </button>
                <button ogMenuItem data-testid="narrow-laptop" (select)="narrowRecord('laptop')">
                  Laptop
                </button>
                <button ogMenuItem data-testid="narrow-tablet" (select)="narrowRecord('tablet')">
                  Tablet
                </button>
              </div>
            </div>
            <div ogMenuSub [(open)]="narrowOpenWithOpen">
              <button ogMenuSubTrigger data-testid="narrow-open-with">Open with</button>
              <div
                ogMenuContent
                side="block-start"
                data-testid="narrow-open-with-content"
                class="narrow narrow-sub"
              >
                <button ogMenuItem data-testid="narrow-editor" (select)="narrowRecord('editor')">
                  Editor
                </button>
                <button ogMenuItem data-testid="narrow-viewer" (select)="narrowRecord('viewer')">
                  Viewer
                </button>
              </div>
            </div>
          </div>
        </div>

        <div dir="rtl">
          <div ogMenu [(open)]="narrowRtlOpen">
            <button
              ogMenuTrigger
              class="narrow-trigger"
              data-testid="narrow-rtl-trigger"
              style="right: 130px; top: 60px"
            >
              Narrow RTL
            </button>
            <div ogMenuContent data-testid="narrow-rtl-content" class="narrow narrow-root">
              <button ogMenuItem data-testid="narrow-rtl-bold">Bold</button>
              <div ogMenuSub [(open)]="narrowAlignOpen">
                <button ogMenuSubTrigger data-testid="narrow-rtl-align">Align</button>
                <div
                  ogMenuContent
                  [gap]="4"
                  data-testid="narrow-rtl-align-content"
                  class="narrow narrow-sub"
                >
                  <button ogMenuItem data-testid="narrow-rtl-right">Right</button>
                  <button ogMenuItem data-testid="narrow-rtl-center">Center</button>
                </div>
              </div>
              <button ogMenuItem data-testid="narrow-rtl-italic">Italic</button>
            </div>
          </div>
        </div>

        <div ogMenu [(open)]="narrowRootInlineOpen">
          <button
            ogMenuTrigger
            class="narrow-trigger"
            data-testid="narrow-root-inline-trigger"
            style="left: 130px; top: 600px"
          >
            Root inline
          </button>
          <div
            ogMenuContent
            side="inline-end"
            data-testid="narrow-root-inline-content"
            class="narrow narrow-root"
          >
            <button ogMenuItem data-testid="narrow-root-inline-alpha">Alpha</button>
            <button ogMenuItem data-testid="narrow-root-inline-beta">Beta</button>
          </div>
        </div>

        <div class="narrow-vertical">
          <div ogMenu [(open)]="narrowVerticalOpen">
            <button
              ogMenuTrigger
              class="narrow-trigger narrow-vertical-trigger"
              data-testid="narrow-vertical-trigger"
            >
              Vertical
            </button>
            <div
              ogMenuContent
              data-testid="narrow-vertical-content"
              class="narrow narrow-vertical-root"
            >
              <button ogMenuItem data-testid="narrow-vertical-one">One</button>
              <div ogMenuSub [(open)]="narrowNestedOpen">
                <button ogMenuSubTrigger data-testid="narrow-vertical-nested">Nested</button>
                <div
                  ogMenuContent
                  [gap]="4"
                  data-testid="narrow-vertical-nested-content"
                  class="narrow narrow-vertical-sub"
                >
                  <button ogMenuItem data-testid="narrow-vertical-two">Two</button>
                  <button ogMenuItem data-testid="narrow-vertical-three">Three</button>
                  <button ogMenuItem data-testid="narrow-vertical-four">Four</button>
                </div>
              </div>
              <button ogMenuItem data-testid="narrow-vertical-five">Five</button>
            </div>
          </div>
        </div>

        <div ogMenu [(open)]="narrowShortOpen">
          <button
            ogMenuTrigger
            class="narrow-trigger narrow-short-trigger"
            data-testid="narrow-short-trigger"
          >
            Short
          </button>
          <div
            ogMenuContent
            data-testid="narrow-short-content"
            class="narrow-short narrow-short-root"
          >
            <div ogMenuSub [(open)]="narrowFoldersOpen">
              <button
                ogMenuSubTrigger
                class="narrow-short-folders"
                data-testid="narrow-short-folders"
              >
                Folders
              </button>
              <div
                ogMenuContent
                [gap]="4"
                data-testid="narrow-short-folders-content"
                class="narrow-short narrow-short-sub"
              >
                @for (folder of narrowFolders; track folder) {
                  <button ogMenuItem [attr.data-testid]="'narrow-short-folder-' + folder">
                    Folder {{ folder }}
                  </button>
                }
              </div>
            </div>
          </div>
        </div>
      }
      <output data-testid="narrow-state"
        >{{ narrowOpen() }} {{ narrowMoveOpen() }} {{ narrowMoreOpen() }} {{ narrowCopyOpen() }}
        {{ narrowSendOpen() }} {{ narrowOpenWithOpen() }}</output
      >
      <output data-testid="narrow-selected">{{ narrowSelections().join(",") }}</output>
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
    .long-trigger {
      position: fixed;
      margin: 0;
    }
    .long-sub {
      box-sizing: border-box;
      max-height: var(--og-available-height);
      overflow: auto;
    }
    .narrow-trigger {
      position: fixed;
      margin: 0;
    }
    .narrow {
      box-sizing: border-box;
      margin: 0;
      color: inherit;
      background: #222222;
      border: 1px solid #555555;
      padding: 4px;
    }
    .narrow:popover-open {
      display: flex;
      flex-direction: column;
    }
    .narrow [role^="menuitem"] {
      inline-size: 100%;
      text-align: start;
      padding-block: 4px;
    }
    .narrow [role^="menuitem"]:focus,
    .narrow-short [role^="menuitem"]:focus {
      background: #444466;
      outline: none;
    }
    .narrow-root {
      inline-size: 240px;
    }
    /* Fold's sizing: a submenu at least as wide as its sub-trigger. */
    .narrow-sub {
      min-inline-size: var(--og-anchor-width);
    }
    .narrow-vertical {
      writing-mode: vertical-rl;
      direction: rtl;
    }
    .narrow-vertical-trigger {
      left: 700px;
      top: 95px;
      inline-size: 200px;
    }
    .narrow-vertical-root {
      inline-size: 200px;
    }
    /* Longer than Nested along the inline (physical vertical) axis. */
    .narrow-vertical-sub {
      inline-size: 260px;
    }
    /* Exact boxes: no padding or borders, so the submenu measures 140 × 320 before its cap. */
    .narrow-short-trigger {
      left: 130px;
      top: 20px;
      block-size: 30px;
      padding: 0;
      border: 0;
    }
    .narrow-short {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      border: 0;
      color: inherit;
      background: #222222;
    }
    .narrow-short:popover-open {
      display: flex;
      flex-direction: column;
    }
    .narrow-short [role^="menuitem"] {
      flex: none;
      box-sizing: border-box;
      inline-size: 100%;
      block-size: 32px;
      margin: 0;
      padding: 0;
      border: 0;
      text-align: start;
    }
    .narrow-short-root {
      inline-size: 130px;
      padding-block-start: 150px;
    }
    .narrow-short .narrow-short-folders {
      block-size: 30px;
    }
    .narrow-short-sub {
      inline-size: 140px;
      max-height: var(--og-available-height);
      overflow: auto;
    }
  `,
})
export class MenuSubmenu {
  protected readonly increment = increment;

  readonly editOpen = signal(false);
  readonly longItems = Array.from({ length: 60 }, (_, index) => index + 1);
  readonly longMounted = signal(false);
  readonly longOpen = signal(false);
  readonly longSubOpen = signal(false);
  readonly longLeft = signal(100);
  readonly longTop = signal(800);
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

  readonly narrowMounted = signal(false);
  readonly narrowTop = signal(120);
  readonly narrowOpen = signal(false);
  readonly narrowMoveOpen = signal(false);
  readonly narrowMoreOpen = signal(false);
  readonly narrowCopyOpen = signal(false);
  readonly narrowSendOpen = signal(false);
  readonly narrowOpenWithOpen = signal(false);
  readonly narrowRtlOpen = signal(false);
  readonly narrowAlignOpen = signal(false);
  readonly narrowRootInlineOpen = signal(false);
  readonly narrowVerticalOpen = signal(false);
  readonly narrowNestedOpen = signal(false);
  readonly narrowShortOpen = signal(false);
  readonly narrowFoldersOpen = signal(false);
  readonly narrowFolders = Array.from({ length: 10 }, (_, index) => index + 1);
  /** `name@testid`: each Narrow `(select)` and what was focused while it ran. */
  readonly narrowSelections = signal<readonly string[]>([]);

  /** Moves Narrow's Trigger to `top` CSS pixels from the viewport's top. */
  protected narrowNearBottom(top: string | undefined): void {
    this.narrowTop.set(Number(top));
  }

  protected narrowRecord(name: string): void {
    const focused = this.#document.activeElement?.getAttribute("data-testid") ?? "none";

    this.narrowSelections.update((entries) => [...entries, `${name}@${focused}`]);
  }

  longNearInlineEnd(): void {
    this.longLeft.set(document.documentElement.clientWidth - 160);
  }

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
