/// <reference types="vite/client" />

interface Window {
  /** Magic-link token moved out of the URL by public/login-fragment.js; consumed once by takeLoginToken. */
  __vilaLoginToken?: string;
}
