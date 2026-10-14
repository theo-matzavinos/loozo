import {
  Component,
  ElementRef,
  ViewContainerRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from "@angular/core";
import type { ComponentRef } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverOptions,
  OrigamiPopoverState,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";

/** A concrete dynamically owned consumer allows real synchronous component destruction/replacement. */
@Component({
  selector: "acceptance-managed-popover",
  hostDirectives: [OrigamiPopover],
  providers: [OrigamiPopoverOptions.provideExisting(() => ManagedPopover)],
  imports: [OrigamiPopoverTrigger, OrigamiPopoverAnchor, OrigamiPopoverContent],
  host: { "[attr.data-managed-owner]": "label()" },
  template: `
    <button
      ogPopoverTrigger
      ogPopoverAnchor
      [id]="label() + '-trigger'"
      [attr.data-testid]="label() + '-managed-trigger'"
    >
      {{ label() }} trigger
    </button>
    <section
      ogPopoverContent
      #content="ogPopoverContent"
      [id]="label() + '-content'"
      class="surface"
      [attr.data-testid]="label() + '-managed-content'"
      (beforetoggle)="nativeEvent($event)"
      [attr.data-retained]="content.state.open()"
    >
      @if (content.state.open()) {
        <input
          autofocus
          [attr.data-testid]="label() + '-managed-focus'"
          aria-label="Managed autofocus"
          (focus)="callback('focus', this)"
        />
        <button type="button" (click)="open.set(false)">Close managed owner</button>
      }
    </section>
    <output [attr.data-testid]="label() + '-managed-intent'">{{ state.open() }}</output>
  `,
  styles: `
    :host {
      display: block;
      color-scheme: dark;
      margin: 8px;
    }
    .surface {
      width: 180px;
      height: 100px;
      background: #222;
      color: #eee;
    }
  `,
})
export class ManagedPopover implements OrigamiPopoverOptions {
  readonly label = input("first");
  readonly disabled = signal(false);
  readonly dismissible = signal(true);
  readonly state = inject(OrigamiPopoverState);
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  callback: (event: string, owner: ManagedPopover) => void = () => {};
  readonly open = linkedSignal(() => false, {
    set: (value, rawSet) => {
      rawSet(value);

      if (!value) {
        this.callback("desired-close", this);
      }
    },
  });

  nativeEvent(event: Event): void {
    if (!(event instanceof ToggleEvent)) {
      throw new Error("Expected native beforetoggle");
    }

    this.callback(`beforetoggle-${event.newState}`, this);
  }
}

@Component({
  selector: "acceptance-lifecycle-cases",
  template: `
    <h2>Synchronous real owner lifetime variants</h2>
    <label
      >Listener action
      <select data-testid="lifetime-action" (change)="choose($event)">
        <option value="none">None</option>
        <option value="destroy-focus">Destroy owner in autofocus</option>
        <option value="replace-focus">Replace owner in autofocus</option>
        <option value="destroy-beforetoggle-open">Destroy owner during opening</option>
        <option value="replace-beforetoggle-close">Replace owner during native hiding</option>
        <option value="destroy-dismiss">Destroy owner in dismissal setter</option>
        <option value="replace-dismiss">Replace owner in dismissal setter</option>
        <option value="reopen-dismiss">Reopen in actual dismissal setter</option>
        <option value="move-focus-close">Move focus in actual close setter</option>
        <option value="replace-peer-dismiss">
          Replace another branch during the same acquired pointer
        </option>
      </select></label
    >
    <button type="button" data-testid="lifetime-mount" (click)="mountOwners()">
      Mount independent owners
    </button>
    <button type="button" data-testid="lifetime-open-first" (click)="openFirst()">
      Open first from Options
    </button>
    <button type="button" data-testid="lifetime-open-second" (click)="openSecond()">
      Open second from Options
    </button>
    <button type="button" data-testid="lifetime-close-first" (click)="closeFirst()">
      Close first from Options
    </button>
    <button type="button" data-testid="lifetime-outside">Outside focus and pointer target</button>
    <ng-template #owners />
    <output data-testid="lifetime-events">{{ events().join("|") }}</output>
    <output data-testid="lifetime-closed-actor">{{ closedActor() }}</output>
    <output data-testid="lifetime-callback-state">{{ callbackState() }}</output>
  `,
})
export class LifecycleCases {
  readonly owners = viewChild.required("owners", { read: ViewContainerRef });
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly action = signal("none");
  readonly events = signal<readonly string[]>([]);
  readonly closedActor = signal("");
  readonly callbackState = signal("");
  first?: ComponentRef<ManagedPopover>;
  second?: ComponentRef<ManagedPopover>;

  choose(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected lifetime-action select");
    }

    this.action.set(event.target.value);
  }

  mountOwners(): void {
    this.owners().clear();
    this.first = this.create("first");
    this.second = this.create("second");
  }

  create(label: string): ComponentRef<ManagedPopover> {
    const reference = this.owners().createComponent(ManagedPopover);

    reference.setInput("label", label);
    reference.instance.callback = (event, owner) => this.observe(event, owner);

    return reference;
  }

  openFirst(): void {
    this.first?.instance.open.set(true);
  }
  openSecond(): void {
    this.second?.instance.open.set(true);
  }
  closeFirst(): void {
    this.first?.instance.open.set(false);
  }

  observe(event: string, owner: ManagedPopover): void {
    const label = owner.label();

    this.events.update((events) => [...events, `${label}:${event}:${owner.state.open()}`]);

    const action = this.action();
    const matching =
      (event === "focus" && (action === "destroy-focus" || action === "replace-focus")) ||
      (event === "beforetoggle-open" && action === "destroy-beforetoggle-open") ||
      (event === "beforetoggle-closed" && action === "replace-beforetoggle-close") ||
      (event === "desired-close" &&
        [
          "destroy-dismiss",
          "replace-dismiss",
          "reopen-dismiss",
          "move-focus-close",
          "replace-peer-dismiss",
        ].includes(action));

    if (!matching) {
      return;
    }

    this.action.set("none");
    this.closedActor.set(label);

    if (action === "reopen-dismiss") {
      owner.open.set(true);
      this.callbackState.set(String(owner.state.open()));

      return;
    }

    if (action === "move-focus-close") {
      const outside = this.element.querySelector('[data-testid="lifetime-outside"]');

      if (!(outside instanceof HTMLElement)) {
        throw new Error("Missing outside focus target");
      }

      outside.focus();

      return;
    }

    let target = this.first;

    if (label === "second") {
      target = this.second;
    }

    let replacementLabel = label;

    if (action === "replace-peer-dismiss") {
      replacementLabel = "second";
      target = this.second;

      if (label === "second") {
        replacementLabel = "first";
        target = this.first;
      }
    }

    if (!target) {
      throw new Error("Missing managed owner");
    }

    target.destroy();

    if (action.startsWith("replace")) {
      const replacement = this.create(replacementLabel);

      if (replacementLabel === "first") {
        this.first = replacement;
      } else {
        this.second = replacement;
      }

      replacement.instance.open.set(true);
    }
  }
}
