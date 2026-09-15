import { z } from "zod";
import { arrayContainsFilter, booleanEqFilter, booleanFromString, dateFilter, numFilter, stringFilter } from "../../validators/common.js";
import type { ArrayContainsFilter, StringFilter } from "../../validators/common.js";
import { ServiceValidationError } from "../errors/errors.js";

type BooleanEqQuery = z.infer<typeof booleanEqFilter>;
type DateQuery = z.infer<typeof dateFilter>;
type NumQuery = z.infer<typeof numFilter>;

export type PaginatedResult<T> = {
  data: T[];
  cursor: string | undefined;
  total?: number;
};

export function hasRange(filter?: DateQuery | NumQuery) {
  if (!filter) {
    return false;
  }

  return (
    ("gt" in filter && filter.gt !== undefined) ||
    ("gte" in filter && filter.gte !== undefined) ||
    ("lt" in filter && filter.lt !== undefined) ||
    ("lte" in filter && filter.lte !== undefined)
  );
}

export function applyBooleanEqQuery(
  query: FirebaseFirestore.Query,
  booleanQuery: BooleanEqQuery,
  field: string
) {
  if (booleanQuery.eq !== undefined) query = query.where(field, "==", booleanQuery.eq);
  if ("neq" in booleanQuery && booleanQuery.neq !== undefined) query = query.where(field, "!=", booleanQuery.neq);

  return query;
}

export function applyNumericalQuery(
  query: FirebaseFirestore.Query,
  numericalQuery: DateQuery | NumQuery,
  field: string
) {
  if (numericalQuery.eq !== undefined) query = query.where(field, "==", numericalQuery.eq);
  if ("neq" in numericalQuery && numericalQuery.neq !== undefined) query = query.where(field, "!=", numericalQuery.neq);
  if ("gt" in numericalQuery && numericalQuery.gt !== undefined) query = query.where(field, ">", numericalQuery.gt);
  if ("gte" in numericalQuery && numericalQuery.gte !== undefined) query = query.where(field, ">=", numericalQuery.gte);
  if ("lt" in numericalQuery && numericalQuery.lt !== undefined) query = query.where(field, "<", numericalQuery.lt);
  if ("lte" in numericalQuery && numericalQuery.lte !== undefined) query = query.where(field, "<=", numericalQuery.lte);

  return query;
}

export async function applyCursor(
  collection: FirebaseFirestore.CollectionReference,
  query: FirebaseFirestore.Query,
  cursor: string | undefined
): Promise<FirebaseFirestore.Query> {
  if (!cursor) {
    return query;
  }

  const cursorDoc = await collection.doc(cursor).get();

  if (!cursorDoc.exists) {
    throw new ServiceValidationError("Invalid query params.", {
      cursor: ["Invalid cursor."],
    });
  }

  return query.startAt(cursorDoc);
}

export async function executePaginatedQuery<T>(
  query: FirebaseFirestore.Query,
  limit: number,
  mapDoc: (doc: FirebaseFirestore.QueryDocumentSnapshot) => T,
  countQuery?: FirebaseFirestore.Query
): Promise<PaginatedResult<T>> {
  const [snap, total] = await Promise.all([
    query.limit(limit + 1).get(),
    countQuery ? countQuery.count().get().then((result) => result.data().count) : Promise.resolve(undefined),
  ]);
  const hasNext = snap.docs.length > limit;

  const itemDocs = hasNext ? snap.docs.slice(0, limit) : snap.docs;
  const nextDoc = hasNext ? snap.docs[limit] : undefined;

  return {
    data: itemDocs.map(mapDoc),
    cursor: nextDoc?.id,
    total,
  };
}

export type BuiltQuery = {
  query: FirebaseFirestore.Query;
  countQuery?: FirebaseFirestore.Query;
};

export type OrderByField = string | FirebaseFirestore.FieldPath;

export type QueryFilterField<TQuery> = {
  key: keyof TQuery & string;
  // Firestore supports dot notation for nested object fields.
  field?: string;
  type: "stringFilter" | "arrayContains" | "number" | "date" | "boolean";
  useDocumentId?: boolean;
};

export type QueryFilterFieldType = QueryFilterField<BaseListQuery>["type"];

export type ListQueryFieldDefinition<
  TKey extends string = string,
  TType extends QueryFilterFieldType = QueryFilterFieldType,
> = {
  key: TKey;
  field?: string;
  type: TType;
  useDocumentId?: boolean;
  sortable?: boolean;
};

export type FilterValue =
  | StringFilter
  | ArrayContainsFilter
  | BooleanEqQuery
  | NumQuery
  | DateQuery;

export type BaseListQuery = {
  limit: number;
  cursor?: string;
  includeTotal?: boolean;
  sortField: string;
  sortDir: "asc" | "desc";
};

type SortDir = BaseListQuery["sortDir"];
type SchemaForFieldType<TType extends QueryFilterFieldType> =
  TType extends "stringFilter" ? typeof stringFilter :
  TType extends "arrayContains" ? typeof arrayContainsFilter :
  TType extends "number" ? typeof numFilter :
  TType extends "date" ? typeof dateFilter :
  typeof booleanEqFilter;

type QueryShapeFromDefinitions<TDefs extends readonly ListQueryFieldDefinition[]> = {
  [TKey in TDefs[number]["key"]]: z.ZodOptional<
    SchemaForFieldType<Extract<TDefs[number], { key: TKey }>["type"]>
  >;
};

type SortFieldFromDefinitions<TDefs extends readonly ListQueryFieldDefinition[]> =
  Extract<TDefs[number], { sortable: true }>["key"] & string;

type SortFieldFromOverrides<
  TSortFields extends readonly [string, ...string[]] | undefined,
> = TSortFields extends readonly [infer TFirst extends string, ...infer TRest extends string[]]
  ? TFirst | TRest[number]
  : never;

function schemaForFieldType(type: QueryFilterFieldType) {
  switch (type) {
    case "stringFilter":
      return stringFilter;
    case "arrayContains":
      return arrayContainsFilter;
    case "number":
      return numFilter;
    case "date":
      return dateFilter;
    case "boolean":
      return booleanEqFilter;
  }
}

export function createListQuerySchema<
  TSortField extends string,
  TShape extends z.ZodRawShape,
>(
  sortableFields: readonly [TSortField, ...TSortField[]],
  shape: TShape
) {
  return z.object({
    limit: z.coerce.number().int().min(1).max(10000).default(1000),
    cursor: z.string().optional(),
    includeTotal: booleanFromString.optional(),
    sortField: z.enum(sortableFields).default(sortableFields[0]),
    sortDir: z.enum(["asc", "desc"] satisfies SortDir[]).default("asc"),
    ...shape,
  }).strict();
}

export function defineListQuery<
  const TDefs extends readonly ListQueryFieldDefinition[],
  const TSortFields extends readonly [string, ...string[]] | undefined = undefined,
>(
  definitions: TDefs,
  options?: {
    sortableFields?: TSortFields;
  }
) {
  const shape = Object.fromEntries(
    definitions.map((definition) => [
      definition.key,
      schemaForFieldType(definition.type).optional(),
    ])
  ) as QueryShapeFromDefinitions<TDefs>;

  const derivedSortableFields = definitions
    .filter((definition) => definition.sortable)
    .map((definition) => definition.key);

  const sortableFields = (options?.sortableFields ?? derivedSortableFields) as readonly [
    SortFieldFromOverrides<TSortFields> | SortFieldFromDefinitions<TDefs>,
    ...(SortFieldFromOverrides<TSortFields> | SortFieldFromDefinitions<TDefs>)[],
  ];

  if (sortableFields.length === 0) {
    throw new Error("List query requires at least one sortable field.");
  }

  const schema = createListQuerySchema(sortableFields, shape);
  const filterFields = definitions.map(({ sortable: _sortable, ...field }) => field) as
    QueryFilterField<z.infer<typeof schema>>[];

  return {
    schema,
    filterFields,
  };
}
