export type ISODateString = string;

/** `YYYY-MM` — the grain every monthly record is stamped at. */
export type MonthYear = string;

export type FireTimestampLike =
  | Date
  | string
  | number
  | { _seconds: number; _nanoseconds: number }
  | { seconds: number; nanoseconds: number };

/** Every list endpoint answers with this envelope. */
export type ListResponse<T> = {
  data: T[];
  cursor?: string;
  total?: number;
};

/** Every get / create / patch / action endpoint answers with this envelope. */
export type ItemResponse<T> = {
  data: T;
};

/** Every failure answers with this body; `code` is stable, `error` is for humans. */
export type ErrorResponse = {
  error: string;
  code: string;
  details?: unknown;
};
