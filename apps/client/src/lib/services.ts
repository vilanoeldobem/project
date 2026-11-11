import { endpoints } from "./endpoints";

/** Endpoints of the running build (see endpoints.ts). */
export const SERVICES = endpoints(import.meta.env.MODE);
