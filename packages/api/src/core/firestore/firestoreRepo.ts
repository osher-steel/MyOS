import { db, FieldPath } from "../../config/firebase.js";
import { ArrayContainsFilter, BooleanFilter, DateFilter, NumberFilter, StringFilter } from "../../validators/common.js";
import { ServiceConflictError, ServiceNotFoundError} from "../errors/errors.js";
import { convertTimestampsToDates } from "./firestoreData.js";
import { rethrowMissingFirestoreIndex } from "./firestoreIndexRequests.js";
import { applyBooleanEqQuery, applyCursor, applyNumericalQuery, BaseListQuery, BuiltQuery, executePaginatedQuery, FilterValue, hasRange, OrderByField, PaginatedResult, QueryFilterField } from "./firestoreQuery.js";
import { stripUndefinedDeep } from "./firestoreSanitize.js";

export type FirestoreRepoTypes = {
  entity: { id: string };
  record: object;
  query: BaseListQuery;
  patch: object;
};

export type FirestoreRepoTypeSet<
  TEntity extends { id: string },
  TRecord extends object,
  TQuery extends BaseListQuery,
  TPatch extends object,
> = {
  entity: TEntity;
  record: TRecord;
  query: TQuery;
  patch: TPatch;
};

export class FirestoreRepo<T extends FirestoreRepoTypes>{
  protected readonly collection: FirebaseFirestore.CollectionReference;
  protected readonly entityName: string;
  protected readonly queryFilterFields: QueryFilterField<T["query"]>[];

  constructor(
    collectionName: string,
    queryFilterFields: QueryFilterField<T["query"]>[],
  ) {
    this.collection = db.collection(collectionName);
    this.entityName = collectionName;
    this.queryFilterFields = queryFilterFields;
  }

  protected toEntity(
    doc: FirebaseFirestore.DocumentSnapshot | FirebaseFirestore.QueryDocumentSnapshot
  ): T["entity"] {
    return {
      ...(convertTimestampsToDates(doc.data()) as T["record"]),
      id: doc.id,
    } as T["entity"];
  }

  protected notFoundError(message = `${this.entityName} not found`) {
    return new ServiceNotFoundError(message);
  }

  protected conflictError(message = `${this.entityName} already exists`) {
    return new ServiceConflictError(message);
  }

  protected rethrowRepoError(
    error: unknown,
    options: { notFound?: string; conflict?: string }
  ): never {
    const errorCode = (error as { code?: number | string } | null)?.code;

    if (options.notFound && (errorCode === 5 || errorCode === "not-found")) {
      throw this.notFoundError(options.notFound);
    }

    if (options.conflict && (errorCode === 6 || errorCode === "already-exists")) {
      throw this.conflictError(options.conflict);
    }

    throw error;
  }

  protected applyConfiguredFilters(
    query: FirebaseFirestore.Query,
    requestQuery: T["query"]
  ): { query: FirebaseFirestore.Query; rangeOrderField?: OrderByField; rangeOrderFieldKey?: string } {
    let rangeOrderField: OrderByField | undefined;
    let rangeOrderFieldKey: string | undefined;

    for (const config of this.queryFilterFields) {
      const rawValue = requestQuery[config.key] as FilterValue | undefined;
      if (!rawValue) continue;

      const field = config.field ?? config.key;
      const firestoreField = config.useDocumentId ? FieldPath.documentId() : field;
      const rangeFieldKey = config.useDocumentId ? "__name__" : field;

      if (config.type === "number" || config.type === "date") {
        const rangeValue = rawValue as NumberFilter | DateFilter;
        if (hasRange(rangeValue)) {
          if (!rangeOrderFieldKey) {
            rangeOrderField = firestoreField;
            rangeOrderFieldKey = rangeFieldKey;
          }
        }
      }

      switch (config.type) {
        case "stringFilter": {
          const stringFilter = rawValue as StringFilter;
          if (stringFilter.eq !== undefined) query = query.where(firestoreField, "==", stringFilter.eq);
          if ("neq" in stringFilter && stringFilter.neq !== undefined) query = query.where(firestoreField, "!=", stringFilter.neq);
          if ("prefix" in stringFilter && stringFilter.prefix !== undefined) {
            if (!rangeOrderFieldKey) {
              rangeOrderField = firestoreField;
              rangeOrderFieldKey = rangeFieldKey;
            }
            query = query.where(firestoreField, ">=", stringFilter.prefix);
            query = query.where(firestoreField, "<=", `${stringFilter.prefix}\uf8ff`);
          }
          if ("in" in stringFilter && stringFilter.in !== undefined) query = query.where(firestoreField, "in", stringFilter.in);
          break;
        }
        case "arrayContains": {
          const arrayContainsFilter = rawValue as ArrayContainsFilter;
          query = query.where(firestoreField, "array-contains", arrayContainsFilter.arrayContains);
          break;
        }
        case "boolean":
          query = applyBooleanEqQuery(query, rawValue as BooleanFilter, field);
          break;
        case "number":
        case "date":
          query = applyNumericalQuery(query, rawValue as NumberFilter | DateFilter, field);
          break;
      }
    }

    return { query, rangeOrderField, rangeOrderFieldKey };
  }

  /**
   * Resolves a sortField *key* to the document path it actually lives at.
   *
   * Query keys are flat and external-friendly ("eventStart") while the value
   * may be nested ("eventInfo.eventStart"). Filters already map through
   * `config.field`; ordering must too, or Firestore orders by a top-level
   * field the documents don't have — and silently drops every document
   * missing it, returning an empty list with no error.
   *
   * Falls back to the raw key when there is no matching filter definition:
   * `sortableFields` overrides may name a field that isn't a filter.
   */
  protected resolveSortField(sortField: string): OrderByField {
    const config = this.queryFilterFields.find((candidate) => candidate.key === sortField);
    if (config?.useDocumentId || sortField === "id") return FieldPath.documentId();
    return config?.field ?? sortField;
  }

  protected async buildQuery(requestQuery: T["query"]): Promise<BuiltQuery> {
    let query: FirebaseFirestore.Query = this.collection;

    const configured = this.applyConfiguredFilters(query, requestQuery);
    query = configured.query;

    const countQuery = requestQuery.includeTotal ? query : undefined;

    if (configured.rangeOrderField) {
      query = query.orderBy(configured.rangeOrderField, requestQuery.sortDir);
    } else {
      query = query.orderBy(this.resolveSortField(requestQuery.sortField), requestQuery.sortDir);
    }

    query = await applyCursor(this.collection, query, requestQuery.cursor);

    return { query, countQuery };
  }

  async get(id: string)
  : Promise<T["entity"]> {
    const doc = await this.collection.doc(id).get();

    if(!doc.exists) throw this.notFoundError();

    return this.toEntity(doc);
  }

  async list(requestQuery: T["query"]): Promise<PaginatedResult<T["entity"]>>{
    try {
      const { query: firestoreQuery, countQuery } = await this.buildQuery(requestQuery);

      return await executePaginatedQuery(
        firestoreQuery,
        requestQuery.limit,
        (doc) => this.toEntity(doc),
        countQuery
      );
    } catch (error) {
      return await rethrowMissingFirestoreIndex(error);
    }
  }

  /**
   * Mints a fresh Firestore document id without writing anything.
   * Useful when the id must be known before the record exists (e.g. to
   * embed it in a Stripe PaymentIntent's metadata before persisting).
   */
  newId(): string {
    return this.collection.doc().id;
  }

  async create(payload:T["record"], id?: string)
  : Promise<T["entity"]> {
    let docRef;
    const sanitizedPayload = stripUndefinedDeep(payload);

    if(id)docRef = this.collection.doc(id);
    else docRef = this.collection.doc();

    try {
      await docRef.create(sanitizedPayload);
    } catch (error) {
      this.rethrowRepoError(error, {
        conflict: `${this.entityName} already exists`,
      });
    }

    return this.get(docRef.id);
  };

  async patch(id: string, payload: object)
  : Promise<T["entity"]> {
    const docRef = this.collection.doc(id);
    const sanitizedPayload = stripUndefinedDeep(payload);
    try {
      await docRef.update(sanitizedPayload);
    } catch (error) {
      this.rethrowRepoError(error, {
        notFound: `${this.entityName} not found`,
      });
    }


    return this.get(id);
  }

  async delete(id: string): Promise<void>{
    const docRef = this.collection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) throw this.notFoundError();

    await docRef.delete();
  }
}
