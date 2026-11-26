/**
 * Google tag isolation for the local browser checks (OQ-13). The tag is not under test here: its collection hosts are
 * outside the game's CSP, so on a machine with network every hit is a CSP console error that has nothing to do
 * with the game, and waiting for the tag can hold up the page's "load" event. The deterministic local checks answer
 * those hosts with an empty 204 and skip their console noise; every other console error still fails a run.
 * `verify-live.mjs` does not use this: against production, analytics errors are a real failure (audit 7.2).
 */
const HOSTS = /googletagmanager|google-analytics|analytics\.google|doubleclick|google\.com\/g\/collect|google\.com\.br\/ads/;

/** True for a console message caused by the Google tag. */
export const analyticsNoise = (text) => HOSTS.test(text);

/**
 * React 19 logs this when a Drei `Html` label root unmounts during a render. The labels mount and unmount as the
 * camera moves and the checks teleport; the page still completes the flow (reproduced on a clean page). Known
 * framework noise, not a page error.
 */
const REACT_UNMOUNT = /Attempted to synchronously unmount a root while React was already rendering/;

/** True for the React 19 / Drei unmount warning. */
export const frameworkNoise = (text) => REACT_UNMOUNT.test(text);

/** Answers every Google tag request of `page` with an empty 204, so nothing leaves the machine. */
export const isolateAnalytics = (page) => page.route(HOSTS, (route) => route.fulfill({ status: 204, body: "" }));
