import { unprocessable } from './errors.js';

/**
 * Validates `data` against a zod schema and throws a 422 with field level
 * details on failure. Returns the parsed (and coerced) value on success.
 */
export function parse(schema, data, message = 'Please check the highlighted fields.') {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '_',
      message: issue.message,
    }));
    throw unprocessable(message, details);
  }
  return result.data;
}

/** Express-friendly async wrapper so rejected promises reach the error handler. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
