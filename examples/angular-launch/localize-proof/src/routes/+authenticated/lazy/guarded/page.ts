import { Component } from "@angular/core";

@Component({ template: `<h1 id="page" data-id="+authenticated/lazy/guarded">Guarded</h1>` })
export default class Guarded {}
