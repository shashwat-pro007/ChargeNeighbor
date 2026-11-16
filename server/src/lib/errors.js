/**
 * One error type for everything the API knowingly rejects, so the frontend
 * always receives the same shape:
 *   { error: { code, message, details? } }
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (message, details) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this action.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = 'That item could not be found.') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message, details) =>
  new AppError(409, 'CONFLICT', message, details);

export const unprocessable = (message, details) =>
  new AppError(422, 'VALIDATION_FAILED', message, details);

export const tooManyRequests = (message) => new AppError(429, 'RATE_LIMITED', message);

export const serverError = (message = 'Something went wrong on our side.') =>
  new AppError(500, 'INTERNAL_ERROR', message);
