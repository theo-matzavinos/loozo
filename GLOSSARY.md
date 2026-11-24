# loozo packages

Terms for the router's typed routes and the packages built on them, and for Origami's query field.

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

**Query**:
The full text of a query field or SearchBar, such as `report status:submitted by:@me`. The consumer parses it; Origami and fold never do.
_Avoid_: search, search string (a search key is a router URL concept)

**Query token**:
A range of the query the consumer reports back after parsing, with an optional qualifier and value, valid or invalid, and a message when invalid.
_Avoid_: chip, tag, term

**Qualifier**:
The key part of a query token before its separator, such as `status` in `status:submitted`. An unknown qualifier is an invalid query token.

**Suggestion**:
A consumer-supplied completion for the query token at the caret: a label to show and the text it inserts over a range of the query.
_Avoid_: option (a Combobox or Select option commits a value; a suggestion edits text)

**Query analysis**:
The consumer's analysis of one query at one caret: its query tokens and the suggestions for the token at the caret, stamped with the query and caret it applies to.
_Avoid_: parse result
