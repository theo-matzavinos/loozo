import { Component } from "@angular/core";
import { injectRoute } from "./route.generated";

@Component({
  selector: "launch-todo",
  template: `
    @let todo = route.data().todo;
    <h1 id="todo-title">{{ todo.title }}</h1>
    <p id="todo-state">
      @if (todo.completed) {
        Completed
      } @else {
        Open
      }
    </p>
  `,
})
export default class Todo {
  readonly route = injectRoute();
}
