import type { ErrorResponse } from "@myos/shared";

export class ProxyClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly formErrors: string[] = [],
  ) {
    super(message);
    this.name = "ProxyClientError";
  }
}

export async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { data?: T } & Partial<ErrorResponse>;
  if (!res.ok) {
    const details = body.details as { formErrors?: string[] } | undefined;
    throw new ProxyClientError(
      body.error ?? `Request failed (${res.status})`,
      res.status,
      body.code ?? "internal_error",
      details?.formErrors ?? [],
    );
  }
  return body.data as T;
}
