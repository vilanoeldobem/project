/**
 * Brand mark (IMPL-0029): the in-test logo of the Vila as an image with its name for assistive technology.
 * Shown while the village loads and in the top bar of the HUD; never during play (IMPL-0022). Final approval
 * of the logo is still pending (DEC-024, PEN-016).
 */
export function BrandMark({ large }: { large?: boolean }) {
  return (
    <img
      className={large ? "brandmark brandmark--large" : "brandmark"}
      src="/logo-vilanoeldobem.png"
      width={380}
      height={360}
      alt="Vila Noel do Bem"
    />
  );
}
