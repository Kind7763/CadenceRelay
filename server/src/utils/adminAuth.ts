import bcrypt from 'bcryptjs';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';

/**
 * Verify the admin password against the hashed password stored in admin_users table.
 * Returns true if any admin user matches, throws AppError if invalid.
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password || typeof password !== 'string') {
    throw new AppError('Admin password is required', 400);
  }

  const result = await pool.query('SELECT password_hash FROM admin_users LIMIT 1');
  if (result.rows.length === 0) {
    throw new AppError('No admin user configured', 500);
  }

  const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
  if (!isValid) {
    throw new AppError('Invalid admin password', 403);
  }

  return true;
}
