/**
 * Temporary name placeholder (final logo not approved — DEC-024, route A3 under test). Shown while the village
 * loads; it is not on the gameplay screen (IMPL-0022). An image for assistive technology: the page heading is
 * the `<h1>` of `App`.
 */
export function Wordmark({ large }: { large?: boolean }) {
  return (
    <p className={`wordmark${large ? " wordmark--large" : ""}`} role="img" aria-label="Vila Noel do Bem">
      <span aria-hidden="true">VILA NOEL</span>
      <span aria-hidden="true">DO BEM</span>
    </p>
  );
}
