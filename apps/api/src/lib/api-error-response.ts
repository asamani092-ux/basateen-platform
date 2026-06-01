import { ZodError } from "zod";

export function errorPayload(
  error: unknown,
  fallback = "Failed",
): {
  error: string;
  message: string;
  details?: unknown;
  issues?: unknown;
} {
  if (error instanceof ZodError) {
    return {
      error: "validation_failed",
      message: error.message,
      details: error.flatten(),
      issues: error.issues,
    };
  }

  if (error instanceof Error) {
    const withIssues = error as Error & {
      issues?: unknown;
      errors?: unknown;
    };
    return {
      error: error.message || fallback,
      message: error.message || fallback,
      details: withIssues.errors ?? withIssues.issues ?? undefined,
    };
  }

  if (typeof error === "object" && error != null) {
    const o = error as Record<string, unknown>;
    const msg =
      typeof o.message === "string"
        ? o.message
        : typeof o.error === "string"
          ? o.error
          : fallback;
    return {
      error: msg,
      message: msg,
      details: o.details ?? o.errors ?? o.issues ?? error,
    };
  }

  return {
    error: String(error),
    message: String(error),
    details: error,
  };
}

export function errorJson(
  error: unknown,
  status = 400,
  fallback = "Failed",
): Response {
  const payload = errorPayload(error, fallback);
  return Response.json(payload, { status });
}
