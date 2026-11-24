import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Coordinator, Event } from '../models/index.js';
import { AppError } from '../utils/helpers.js';

export async function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'UNAUTHORIZED', 'Sign in required');
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Session expired. Please sign in again.');
  }
  const user = await Coordinator.findById(payload.sub);
  if (!user || !user.active) throw new AppError(401, 'UNAUTHORIZED', 'Account not available');
  req.user = user;
  next();
}

/** Loads req.event. Events you don't own look exactly like missing events. */
export async function loadEvent(req, _res, next) {
  const { eventId } = req.params;
  const notFound = new AppError(404, 'NOT_FOUND', 'Event not found');
  if (!mongoose.isValidObjectId(eventId)) throw notFound;
  const ev = await Event.findById(eventId);
  if (!ev) throw notFound;
  if (req.user.role !== 'admin' && !ev.coordinatorId.equals(req.user._id)) throw notFound;
  req.event = ev;
  next();
}

export const signToken = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, { expiresIn: '12h' });
