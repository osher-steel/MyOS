/**
 * Lifecycle of a composite index the API discovered it was missing.
 * A list query that Firestore rejects for a missing index is recorded under
 * `firestoreIndexRequests` and answered with `500 missing_index`; the console
 * URL in the record is what you click to create it.
 */
export enum FirestoreIndexRequestStatus {
  PENDING = "pending",
  BUILDING = "building",
  ENABLED = "enabled",
  IGNORED = "ignored",
}

export type FirestoreIndexRequest = {
  id: string;
  url: string;
  createdAt: Date;
  status: FirestoreIndexRequestStatus;
  numOccurences: number;
};
