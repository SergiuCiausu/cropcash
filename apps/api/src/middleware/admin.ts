import type { NextFunction, Request, Response } from 'express';

/** Admins are listed by sign-in email (ADMIN_EMAILS, else DEMO_EMAIL), lower case. */
export const isAdmin = (admins: readonly string[], email: string | undefined) => !!email && admins.includes(email.toLowerCase());

/** After requireAuth: lets an admin through, answers 403 to everyone else. */
export function requireAdmin(admins: readonly string[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!isAdmin(admins, res.locals.auth?.email)) {
      res.status(403).json({ error: 'not_an_admin' });
      return;
    }
    next();
  };
}
