# loozo packages

Terms for the router's typed routes and the packages built on them.

## Language

**Owner**:
The declaration that declares a search key. Its descendants inherit the key and can't redeclare it.
_Avoid_: scope, parent route

**Retained search key**:
A search key its owner marks so that `link` and `navigate` keep its current value when the caller leaves it out.
_Avoid_: sticky param, persistent param
