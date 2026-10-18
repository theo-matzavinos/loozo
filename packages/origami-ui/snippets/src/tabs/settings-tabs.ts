import {
  Directive,
  Service,
  booleanAttribute,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import {
  OrigamiTabs,
  OrigamiTabsOptions,
  OrigamiTabsTrigger,
  OrigamiTabsTriggerOptions,
  type OrigamiTabsOrientation,
  type OrigamiTabsActivation,
} from "@loozo/origami-ui/tabs";

@Service()
export class SettingsNavigation {
  readonly section = signal<string | null>("profile");
  readonly saving = signal(false);
}

// Vertical, manually activated Tabs driven by an application service instead of the
// directive's own `value` model.
@Directive({
  selector: "[appSettingsTabs]",
  hostDirectives: [OrigamiTabs],
  providers: [
    OrigamiTabsOptions.provideFactory(() => {
      const navigation = inject(SettingsNavigation);

      return {
        value: navigation.section,
        disabled: navigation.saving,
        orientation: signal<OrigamiTabsOrientation>("vertical"),
        activation: signal<OrigamiTabsActivation>("manual"),
      };
    }),
  ],
})
export class SettingsTabs {}

// A Trigger whose ID is derived from its value, so links and tests can target it.
@Directive({
  selector: "button[appSettingsTab]",
  hostDirectives: [OrigamiTabsTrigger],
  providers: [OrigamiTabsTriggerOptions.provideExisting(() => SettingsTab)],
})
export class SettingsTab implements OrigamiTabsTriggerOptions {
  readonly value = input.required<string>({ alias: "appSettingsTab" });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly focusableWhenDisabled = signal(false);
  readonly id = computed(() => `settings-tab-${this.value()}`);
}
