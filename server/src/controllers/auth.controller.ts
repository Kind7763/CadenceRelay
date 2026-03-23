import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      'SELECT id, username, password_hash FROM admin_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid credentials', 401);
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid credentials', 401);
    }

    const payload = { userId: user.id, username: user.username };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiry,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiry,
    });

    res.json({
      accessToken,
      refreshToken,
      user: { userId: user.id, username: user.username },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as { userId: string; username: string };

    const result = await pool.query('SELECT id FROM admin_users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      throw new AppError('User not found', 401);
    }

    const accessToken = jwt.sign(
      { userId: decoded.userId, username: decoded.username },
      config.jwt.secret,
      { expiresIn: config.jwt.accessExpiry }
    );

    res.json({ accessToken });
  } catch (err) {
    if (err instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid refresh token', 401));
    } else {
      next(err);
    }
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json({ user: req.user });
}
