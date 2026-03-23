import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// PostgreSQL error codes we can handle gracefully instead of returning 500
interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.message}`, { statusCode: err.statusCode });
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  // Handle PostgreSQL-specific errors to avoid generic 500s
  const pgErr = err as PgError;
  if (pgErr.code) {
    switch (pgErr.code) {
      case '22P02': // invalid_text_representation (e.g. invalid UUID)
        logger.warn('Invalid input format', { error: err.message });
        res.status(400).json({
          status: 'error',
          message: 'Invalid input format',
        });
        return;
      case '23503': // foreign_key_violation
        logger.warn('Foreign key constraint violation', { error: err.message, constraint: pgErr.constraint, table: pgErr.table });
        res.status(409).json({
          status: 'error',
          message: 'Cannot complete operation: this record is referenced by other data',
        });
        return;
      case '23505': // unique_violation
        logger.warn('Unique constraint violation', { error: err.message, constraint: pgErr.constraint });
        res.status(409).json({
          status: 'error',
          message: 'A record with this value already exists',
        });
        return;
      case '23514': // check_violation
        logger.warn('Check constraint violation', { error: err.message, constraint: pgErr.constraint });
        res.status(400).json({
          status: 'error',
          message: 'Invalid value for field',
        });
        return;
    }
  }

  // Handle multer errors
  if (err.message && err.message.startsWith('File type')) {
    res.status(400).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  });
}
