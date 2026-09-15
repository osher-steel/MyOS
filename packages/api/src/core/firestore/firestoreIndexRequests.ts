import { FIRESTORE_INDEX_REQUESTS_COLLECTION, FirestoreIndexRequestStatus } from "@myos/shared";
import { db } from "../../config/firebase.js";
import { ServiceMissingIndexError } from "../errors/errors.js";



export type FirestoreIndexRequestRecord = {
  url: string;
  createdAt: Date;
  status: FirestoreIndexRequestStatus;
  numOccurences: number;
};

type FirestoreErrorLike = {
  code?: number | string;
  message?: string;
};

function extractUrlCandidate(errorMessage: string): string | undefined {
  const matchedUrl = errorMessage.match(/https:\/\/console\.firebase\.google\.com\/\S+/)?.[0];

  if (!matchedUrl) {
    return undefined;
  }

  return matchedUrl.replace(/[)\].,;!?]+$/, "");
}

export function isMissingFirestoreIndexError(error: unknown): boolean {
  const errorCode = (error as FirestoreErrorLike | null)?.code;
  const errorMessage = (error as FirestoreErrorLike | null)?.message ?? "";

  if (
    errorCode !== 9 &&
    errorCode !== "9" &&
    errorCode !== "failed-precondition" &&
    errorCode !== "FAILED_PRECONDITION"
  ) {
    return false;
  }

  return (
    errorMessage.includes("https://console.firebase.google.com") &&
    errorMessage.toLowerCase().includes("index")
  );
}

export function extractFirestoreIndexUrl(error: unknown): string | undefined {
  const errorMessage = (error as FirestoreErrorLike | null)?.message;

  if (!errorMessage || !isMissingFirestoreIndexError(error)) {
    return undefined;
  }

  return extractUrlCandidate(errorMessage);
}

export function extractFirestoreIndexDefinition(url: string): string {
  const parsedUrl = new URL(url);
  const compositeDefinition = parsedUrl.searchParams.get("create_composite");

  if (compositeDefinition) {
    return compositeDefinition.trim();
  }

  const fieldDefinition = parsedUrl.searchParams.get("create_field");

  if (fieldDefinition) {
    return fieldDefinition.trim();
  }

  const normalizedParams = [...parsedUrl.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }

      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${key}=${value}`);

  return normalizedParams.join("&");
}

export function extractFirestoreIndexDocumentId(url: string): string {
  const parsedUrl = new URL(url);
  const compositeDefinition = parsedUrl.searchParams.get("create_composite");

  if (compositeDefinition) {
    return compositeDefinition.trim();
  }

  return extractFirestoreIndexDefinition(url);
}

export async function persistMissingFirestoreIndex(error: unknown): Promise<void> {
  const url = extractFirestoreIndexUrl(error);

  if (!url) {
    throw error;
  }

  const docId = extractFirestoreIndexDocumentId(url);
  const docRef = db.collection(FIRESTORE_INDEX_REQUESTS_COLLECTION).doc(docId);
  const existingDoc = await docRef.get();

  if (!existingDoc.exists) {
    const record: FirestoreIndexRequestRecord = {
      url,
      createdAt: new Date(),
      status: FirestoreIndexRequestStatus.PENDING,
      numOccurences: 1,
    };

    await docRef.set(record);
    return;
  }

  const currentRecord = existingDoc.data() as Partial<FirestoreIndexRequestRecord> | undefined;

  if (currentRecord?.status === FirestoreIndexRequestStatus.ENABLED) {
    const record: FirestoreIndexRequestRecord = {
      url,
      createdAt: new Date(),
      status: FirestoreIndexRequestStatus.PENDING,
      numOccurences: 1,
    };

    await docRef.delete();
    await docRef.set(record);
    return;
  }

  const currentOccurrences = typeof currentRecord?.numOccurences === "number"
    ? currentRecord.numOccurences
    : 0;

  await docRef.update({
    numOccurences: currentOccurrences + 1,
  });
}

export async function rethrowMissingFirestoreIndex(error: unknown): Promise<never> {
  if (!isMissingFirestoreIndexError(error)) {
    throw error;
  }

  try {
    await persistMissingFirestoreIndex(error);
  } catch (persistenceError) {
    if (!isMissingFirestoreIndexError(error)) {
      throw persistenceError;
    }

    console.error("Failed to persist missing Firestore index request", persistenceError);
  }

  throw new ServiceMissingIndexError();
}
