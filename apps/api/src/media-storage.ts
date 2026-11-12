import { HttpError } from "./http";

/** Erasure deletes the reservation, so a late conditional put cannot recreate personal bytes. */
export async function putReserved(bucket: R2Bucket, key: string, bytes: Uint8Array, contentType: string,
  stillActive: () => Promise<boolean>): Promise<void> {
  const reservation = await bucket.put(key, new Uint8Array());
  const options = { httpMetadata: { contentType }, onlyIf: { etagMatches: reservation.etag } };
  if (!await stillActive()) {
    await bucket.delete(key).catch(() => {}); // Only the empty reservation exists at this point.
    throw new HttpError(409, "upload_cancelled");
  }
  let object: R2Object | null;
  try { object = await bucket.put(key, bytes, options); }
  catch (error) {
    // R2 permits one write per key/second; retry throttling once, preserving the erasure precondition.
    if (!(error instanceof Error) || !/\b429\b|too many requests/i.test(error.message)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    if (!await stillActive()) throw new HttpError(409, "upload_cancelled");
    object = await bucket.put(key, bytes, options);
  }
  if (!object) throw new HttpError(409, "upload_cancelled");
}
