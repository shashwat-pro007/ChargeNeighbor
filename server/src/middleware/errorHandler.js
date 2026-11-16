import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

/** 404 for unmatched API routes, so the SPA fallback never swallows them. */
export function apiNotFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `No API route matches ${req.method} ${req.originalUrl}.`));
}

function normalise(error) {
  if (error instanceof AppError) return error;

  // SQLite constraint violations we can explain to a human.
  const message = String(error?.message ?? '');
  if (message.includes('UNIQUE constraint failed')) {
    if (message.includes('users.phone')) {
      return new AppError(409, 'CONFLICT', 'An account with this phone number already exists.');
    }
    if (message.includes('bookings.ref')) {
      return new AppError(409, 'CONFLICT', 'That booking reference is taken. Please retry.');
    }
    return new AppError(409, 'CONFLICT', 'That record already exists.');
  }

  if (error?.code === 'LIMIT_FILE_SIZE') {
    return new AppError(
      413,
      'FILE_TOO_LARGE',
      `Each photo must be smaller than ${Math.round(config.maxUploadBytes / (1024 * 1024))} MB.`,
    );
  }

  if (error?.type === 'entity.parse.failed') {
    return new AppError(400, 'BAD_JSON', 'The request body was not valid JSON.');
  }

  return error;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
  const err = normalise(error);
  const status = err.status ?? 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    error: {
      code: err.code ?? 'INTERNAL_ERROR',
      message:
        status >= 500
          ? 'Something went wrong on our side. Please try again in a moment.'
          : err.message,
    },
  };

  if (err.details) body.error.details = err.details;
  if (status >= 500 && !config.isProduction && err.stack) {
    body.error.debug = err.stack.split('\n').slice(0, 4).join('\n');
  }

  res.status(status).json(body);
}
