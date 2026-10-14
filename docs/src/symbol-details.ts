import { Component, computed, input } from "@angular/core";
import { ContentHtml } from "./content-html.js";
import type {
  ApiSignature,
  ApiSymbol,
  ApiSymbolKind,
} from "../generated/content/model.generated.js";

export const kindLabels: Record<ApiSymbolKind, string> = {
  function: "Function",
  constant: "Constant",
  interface: "Interface",
  "type-alias": "Type alias",
  class: "Class",
  enum: "Enum",
  directive: "Directive",
  component: "Component",
  pipe: "Pipe",
};

/**
 * A symbol's or member's signatures with their parameters, returns and throws. Overloads each get
 * a heading at `headingLevel` and their details one level below it; a single signature puts its
 * details at `headingLevel` directly.
 */
@Component({
  selector: "docs-signatures",
  imports: [ContentHtml],
  template: `
    @for (signature of signatures(); track $index) {
      @if (overloaded()) {
        <h2 class="overload-heading" [attr.aria-level]="headingLevel()">
          Overload {{ $index + 1 }} of {{ signatures().length }}
        </h2>
      }

      <div class="signature" [docsContentHtml]="signature.html"></div>

      @if (signature.descriptionHtml !== "") {
        <div [docsContentHtml]="signature.descriptionHtml"></div>
      }

      @if (signature.params.length > 0) {
        <h2 class="detail-heading" [attr.aria-level]="detailsLevel()">Parameters</h2>
        <dl class="params">
          @for (param of signature.params; track param.name) {
            <dt>
              <code>{{ param.name }}</code>
              @if (param.optional) {
                <span class="badge">optional</span>
              }
              <code class="type">{{ param.type }}</code>
            </dt>
            <dd [docsContentHtml]="param.descriptionHtml"></dd>
          }
        </dl>
      }

      @if (signature.returnsHtml !== "") {
        <h2 class="detail-heading" [attr.aria-level]="detailsLevel()">Returns</h2>
        <div [docsContentHtml]="signature.returnsHtml"></div>
      }

      @if (signature.throwsHtml.length > 0) {
        <h2 class="detail-heading" [attr.aria-level]="detailsLevel()">Throws</h2>
        <ul>
          @for (text of signature.throwsHtml; track $index) {
            <li [docsContentHtml]="text"></li>
          }
        </ul>
      }
    }
  `,
})
export class Signatures {
  readonly signatures = input.required<readonly ApiSignature[]>();
  readonly headingLevel = input.required<number>();

  readonly overloaded = computed(() => this.signatures().length > 1);

  readonly detailsLevel = computed(() => {
    if (this.overloaded()) {
      return this.headingLevel() + 1;
    }

    return this.headingLevel();
  });
}

/**
 * Everything documented about one symbol below its name. `headingLevel` places the section
 * headings under the page's own heading for the symbol.
 */
@Component({
  selector: "docs-symbol-details",
  imports: [ContentHtml, Signatures],
  template: `
    @let item = symbol();

    <p class="meta">
      <span class="kind">{{ kindLabels[item.kind] }}</span>
      <a [href]="item.sourceUrl">Source</a>
    </p>

    @if (item.deprecatedHtml !== null) {
      <div class="callout deprecated" role="note">
        <strong>Deprecated.</strong>
        <div [docsContentHtml]="item.deprecatedHtml"></div>
      </div>
    }

    @if (importable()) {
      <pre
        class="import-line"
      ><code>import {{ "{" }} {{ item.name }} {{ "}" }} from "{{ item.importPath }}";</code></pre>
    }

    @if (item.angular; as angular) {
      <dl class="angular-metadata">
        <dt>Selector</dt>
        <dd>
          <code>{{ angular.selector }}</code>
        </dd>
        @if (angular.exportAs.length > 0) {
          <dt>Exported as</dt>
          <dd>
            @for (name of angular.exportAs; track name) {
              <code>{{ name }}</code>
            }
          </dd>
        }
      </dl>
    }

    @if (item.descriptionHtml !== "") {
      <div [docsContentHtml]="item.descriptionHtml"></div>
    }

    @if (item.typeParams.length > 0) {
      <h2 [attr.aria-level]="headingLevel()">Type parameters</h2>
      <dl class="params">
        @for (typeParam of item.typeParams; track typeParam.name) {
          <dt>
            <code>{{ typeParam.name }}</code>
          </dt>
          <dd [docsContentHtml]="typeParam.descriptionHtml"></dd>
        }
      </dl>
    }

    <docs-signatures [signatures]="item.signatures" [headingLevel]="headingLevel()" />

    @if (item.members.length > 0) {
      <h2 [attr.aria-level]="headingLevel()">Members</h2>
      @for (member of item.members; track member.name) {
        <section class="member">
          <h3 [attr.aria-level]="headingLevel() + 1">
            <code>{{ member.name }}</code>
            @if (member.input !== null) {
              <span class="badge input"
                >input <code>{{ member.input }}</code></span
              >
            }
            @if (member.output !== null) {
              <span class="badge output"
                >output <code>{{ member.output }}</code></span
              >
            }
            @if (member.readonly) {
              <span class="badge">readonly</span>
            }
            @if (member.optional) {
              <span class="badge">optional</span>
            }
          </h3>
          <div [docsContentHtml]="member.descriptionHtml"></div>
          <docs-signatures [signatures]="member.signatures" [headingLevel]="headingLevel() + 2" />
        </section>
      }
    }

    @if (item.examplesHtml.length > 0) {
      <h2 [attr.aria-level]="headingLevel()">Examples</h2>
      @for (example of item.examplesHtml; track $index) {
        <div [docsContentHtml]="example"></div>
      }
    }
  `,
})
export class SymbolDetails {
  readonly symbol = input.required<ApiSymbol>();
  /** Generated-API symbols are not importable entry points, so they get no import line. */
  readonly importable = input.required<boolean>();
  readonly headingLevel = input<2 | 3>(2);

  readonly kindLabels = kindLabels;
}
