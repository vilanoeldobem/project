/**
 * Temporary name placeholder (final logo not approved — DEC-024, route A3 under test). Shown while the village
 * loads, in the top bar of the game (the boards P01–P15 place it there) and on the public site. An image for
 * assistive technology: the page heading is the `<h1>` of `App`.
 */
export function Wordmark({ large, compact }: { large?: boolean; compact?: boolean }) {
  return (
    <p className={`wordmark${large ? " wordmark--large" : ""}${compact ? " wordmark--compact" : ""}`} role="img" aria-label="Vila Noel do Bem">
      <span aria-hidden="true">VILA NOEL</span>
      <span aria-hidden="true">DO BEM</span>
    </p>
  );
}
