import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";
import { TodoItem } from "./todo-item.js";

@Component({
  imports: [TodoItem],
  template: `
    <h1>Todos</h1>
    <ul>
      @for (todo of route.data().todos; track todo.id) {
        <li><app-todo-item [todo]="todo" /></li>
      }
    </ul>
  `,
})
export default class TodosPage {
  readonly route = injectRoute();
}
