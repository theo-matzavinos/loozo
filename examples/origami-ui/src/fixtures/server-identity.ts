import {
  Component,
  DestroyRef,
  EnvironmentInjector,
  Service,
  createEnvironmentInjector,
  inject,
} from "@angular/core";
import { injectUniqueId } from "@loozo/origami-ui/utils";

// SSR-only identity consumers rendered by tests/acceptance/ssr-checks.mjs; never routed.

/** Per-render evidence written by ordinary constructors; no change detection is requested. */
@Service({ autoProvided: false })
export class ServerIdentityEvidence {
  readonly hosted: string[] = [];
  readonly unhosted: string[] = [];
}

/** Root-provided service: its allocation has no element host. */
@Service()
export class ServerApplicationIdentity {
  readonly identity = injectUniqueId("server-without-element");
}

/** Created inside router-style child EnvironmentInjectors, also without an element host. */
@Service({ autoProvided: false })
export class ServerEnvironmentIdentity {
  readonly identity = injectUniqueId("server-environment-repeated");
  readonly second = injectUniqueId("server-environment-repeated");
}

@Component({
  selector: "server-hosted-identity",
  host: {
    "[attr.data-hosted-identity]": "first",
    "[attr.data-hosted-repeat]": "second",
  },
  template: "",
})
export class ServerHostedIdentity {
  readonly first = injectUniqueId("server-repeated");
  readonly second = injectUniqueId("server-repeated");
  readonly other = injectUniqueId("server-other");

  constructor() {
    inject(ServerIdentityEvidence).hosted.push(this.first, this.second, this.other);
  }
}

@Component({
  selector: "server-identity-app",
  imports: [ServerHostedIdentity],
  template: `<server-hosted-identity /><server-hosted-identity />`,
})
export class ServerIdentityConsumer {
  constructor() {
    const evidence = inject(ServerIdentityEvidence);
    const parent = inject(EnvironmentInjector);
    const left = createEnvironmentInjector([ServerEnvironmentIdentity], parent, "left");
    const right = createEnvironmentInjector([ServerEnvironmentIdentity], parent, "right");
    const leftIdentity = left.get(ServerEnvironmentIdentity);
    const rightIdentity = right.get(ServerEnvironmentIdentity);

    inject(DestroyRef).onDestroy(() => {
      left.destroy();
      right.destroy();
    });
    evidence.unhosted.push(
      inject(ServerApplicationIdentity).identity,
      leftIdentity.identity,
      leftIdentity.second,
      rightIdentity.identity,
      rightIdentity.second,
    );
  }
}
