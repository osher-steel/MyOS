export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ServiceValidationError extends AppError {
  constructor(
    message: string,
    public readonly details: unknown
  ) {
    super(message, 400, "validation_error", details);
    this.name = "ServiceValidationError";
  }
}

export class ServiceConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
    this.name = "ServiceConflictError";
  }
}

export class ServiceNotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "not_found");
    this.name = "ServiceNotFoundError";
  }
}

export class ServiceForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, "forbidden");
    this.name = "ServiceForbiddenError";
  }
}

export class ServiceUnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401, "unauthorized");
    this.name = "ServiceUnauthorizedError";
  }
}

export class ServiceMissingIndexError extends AppError {
  constructor() {
    super("Missing Firestore index.", 500, "missing_index", {
      status: "pending",
    });
    this.name = "ServiceMissingIndexError";
  }
}
