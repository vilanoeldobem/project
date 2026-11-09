/** Temporary name placeholder (final logo not approved — DEC-024, route A3 under test). */
export function Wordmark({ large }: { large?: boolean }) {
  return (
    <h1 className={`wordmark${large ? " wordmark--large" : ""}`} aria-label="Vila Noel do Bem">
      <span>VILA NOEL</span>
      <span>DO BEM</span>
    </h1>
  );
}
