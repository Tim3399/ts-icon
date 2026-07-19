import type { RequestUser } from './request-user';

// Augments Express's Request type so `req.user` (attached by JwtAuthGuard on
// a successful verification) is typed everywhere without a cast.
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export {};
