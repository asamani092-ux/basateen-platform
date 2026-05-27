export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

export type HealthResponse = {
  ok: boolean;
  service?: string;
  environment?: string;
  db?: {
    ok: boolean;
    users_count: number;
    seeded: boolean;
    hint?: string;
  };
};
