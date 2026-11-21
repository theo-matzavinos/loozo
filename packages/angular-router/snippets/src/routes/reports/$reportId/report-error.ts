import { Component, computed, input } from "@angular/core";

// Shown in place of the report page when its constructor throws.
@Component({
  template: `<p role="alert">Couldn't show this report: {{ message() }}</p>`,
})
export class ReportError {
  // Angular sets it to the thrown value.
  readonly error = input<unknown>();
  readonly message = computed(() => {
    const error = this.error();

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  });
}
