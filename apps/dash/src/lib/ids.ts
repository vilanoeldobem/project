/** Ids the API issues (applications, NGOs, accounts, files) are lowercase UUIDs. Pure. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True only for a well-formed id: checked before a value from the address bar reaches a request path. */
export const isId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
