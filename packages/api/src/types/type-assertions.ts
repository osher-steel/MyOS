export type Equal<A, B> =
  [A] extends [B]
    ? [B] extends [A]
      ? true
      : false
    : false;

export type Expect<T extends true> = T;

// Distributes over unions so a discriminated union `T` (e.g. the guest/auth/pos
// booking variants) keeps its members instead of collapsing to common fields.
export type Override<T, TOverrides> = T extends unknown
  ? Omit<T, keyof TOverrides> & TOverrides
  : never;

export type RecordOf<TEntity extends { id: string }> = Omit<TEntity, "id">;
