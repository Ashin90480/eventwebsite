import { ZodError } from 'zod';
import { AppError } from '../utils/helpers.js';

export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    return res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'Invalid input',
        details,
      },
    });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That record already exists.' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request is too large.' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body.' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side.' } });
}
