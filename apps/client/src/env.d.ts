/// <reference types="vite/client" />
declare const __VILA_VERSION__: string;

interface Window {
  /** Magic-link token moved out of the URL by public/login-fragment.js; consumed once by initAccount. */
  __vilaLoginToken?: string;
}
