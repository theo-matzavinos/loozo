import {
  defineRoute,
  enumParam,
  numberParam,
  remembered,
  withFallback,
} from "@loozo/angular-router";

export default defineRoute("inbox", {
  search: {
    pageSize: remembered(withFallback(numberParam, 20), "inbox.pageSize"),
    sort: remembered(enumParam(["newest", "oldest"]), "inbox.sort"),
  },
});
