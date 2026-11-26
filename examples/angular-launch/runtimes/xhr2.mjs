// Angular's server platform imports `xhr2` only for HttpClient's XHR backend; this app uses the
// fetch backend, Angular's default since 22. Wrangler can't bundle an import it can't resolve.
export default undefined;
