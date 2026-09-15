// Debugging aids are on when the URL has a `?debug` query string. Routes live
// in the fragment, so it survives navigation: `/?debug#/article/123`.
export const DEBUG = new URLSearchParams(window.location.search).has("debug");
