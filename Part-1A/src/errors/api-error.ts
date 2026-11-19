export interface ApiErrorDetail {
  field: string;
  issue: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiErrorDetail[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toResponseBody(): {
    error: {
      code: string;
      message: string;
      details?: ApiErrorDetail[];
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const apiErrors = {
  invalidJson: () =>
    new ApiError(400, "INVALID_JSON", "Request body must be valid JSON."),
  validation: () =>
    new ApiError(400, "VALIDATION_ERROR", "Request validation failed."),
  invalidTaskId: () =>
    new ApiError(400, "INVALID_TASK_ID", "Task ID must be a UUID."),
  taskNotFound: () => new ApiError(404, "TASK_NOT_FOUND", "Task not found."),
  routeNotFound: () => new ApiError(404, "ROUTE_NOT_FOUND", "Route not found."),
  methodNotAllowed: () =>
    new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed."),
  payloadTooLarge: () =>
    new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body exceeds 65536 bytes."),
  unsupportedMediaType: () =>
    new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json.",
    ),
  storageError: () =>
    new ApiError(500, "STORAGE_ERROR", "Task storage operation failed."),
  internalError: () =>
    new ApiError(500, "INTERNAL_ERROR", "Internal server error."),
};
