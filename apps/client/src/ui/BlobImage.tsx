import { useEffect, useState } from "react";

/**
 * An image the game fetches before showing it (IMPL-0017): the CSP lets `<img>` load only from the game itself,
 * `data:` and `blob:` (the API is in `connect-src`), and the applicant's own files need the session cookie.
 * The bytes become an object URL, revoked when the image changes or leaves the screen. Nothing is drawn while it
 * loads, nor when it cannot be read or decoded: never a broken image.
 *
 * `load` must keep its identity between renders and resolve to null on failure.
 */
export function BlobImage({ source, load, alt, className }: { source: string; load: (source: string) => Promise<Blob | null>; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let gone = false;
    void load(source).then((blob) => {
      if (gone || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      gone = true;
      setUrl(null);
      if (made) URL.revokeObjectURL(made);
    };
  }, [source, load]);
  return url ? <img className={className} src={url} alt={alt} onError={() => setUrl(null)} /> : null;
}
