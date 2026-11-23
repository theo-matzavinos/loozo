# loozo packages

Terms for the router's typed routes and the packages built on them.

## Language

**Owner**:
The declaration that declares a search key. Its descendants inherit the key and can't redeclare it.
_Avoid_: scope, parent route

**Retained search key**:
A search key its owner marks so that `link` and `navigate` keep its current value when the caller leaves it out.
_Avoid_: sticky param, persistent param

**Remembered search key**:
A search key its owner marks with a storage id, so that its last committed value is stored and written back into the URL when a navigation enters the owner without it.
_Avoid_: persisted param, hydrated param, saved search

**Search storage adapter**:
The `SearchStorage` the router reads and writes remembered values through. Browser storage is built in; a cookie adapter makes the server's first render use the values.
_Avoid_: persistence backend, store
