import type { Principal } from "@myos/shared";

declare global {
  namespace Express {
    interface Request {
      /** Firebase uid, set once a bearer token verifies. */
      uid?: string;
      /** Resolved caller, set by resolvePermission / requireOwner. */
      client?: Principal;
    }
  }
}

export {};
