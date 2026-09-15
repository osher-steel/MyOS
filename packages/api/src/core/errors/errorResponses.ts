import type { Response } from "express";
import { AppError } from "./errors.js";

function buildAppErrorBody(error: AppError) {
  const body: Record<string, unknown> = {
    error: error.message,
    code: error.code,
  };

  if (error.details !== undefined) {
    body.details = error.details;
  }

  return body;
}

export function sendErrorResponse(res: Response, error: AppError) {
  return res.status(error.status).json(buildAppErrorBody(error));
}

export function logErrorResponse(
  res: Response,
  status: number,
  body: Record<string, unknown>,
  message: string,
  error: unknown
) {
  console.error(message, error);
  return res.status(status).json(body);
}

export function processError(
  res: Response,
  error: unknown,
  fallbackMessage: string
) {
  if (error instanceof AppError) {
    return logErrorResponse(
      res,
      error.status,
      buildAppErrorBody(error),
      fallbackMessage,
      error
    );
  }

  return logErrorResponse(
    res,
    500,
    { error: fallbackMessage, code: "internal_error" },
    fallbackMessage,
    error
  );
}
