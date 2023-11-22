import type * as express from 'express';
import { AccountsJsError, type AccountsServer } from '@accounts/server';
import { type AccountsPassword, SendVerificationEmailErrors } from '@accounts/password';
import { sendError } from '../../utils/send-error';
import { body } from 'express-validator';
import { matchOrThrow } from '../../utils/matchOrTrow';

export const verifyEmail = (accountsServer: AccountsServer) => [
  body('token').isString().notEmpty(),
  async (req: express.Request, res: express.Response) => {
    try {
      const { token } = matchOrThrow<{ token: string }>(req);
      const accountsPassword = accountsServer.getServices().password as AccountsPassword;
      await accountsPassword.verifyEmail(token);
      res.json(null);
    } catch (err) {
      sendError(res, err);
    }
  },
];

export const sendVerificationEmail = (accountsServer: AccountsServer) => [
  body('email').isEmail(),
  async (req: express.Request, res: express.Response) => {
    try {
      const { email } = matchOrThrow<{ email: string }>(req);
      const accountsPassword = accountsServer.getServices().password as AccountsPassword;
      try {
        await accountsPassword.sendVerificationEmail(email);
      } catch (error) {
        // If ambiguousErrorMessages is true,
        // to prevent user enumeration we fail silently in case there is no user attached to this email
        if (
          accountsServer.options.ambiguousErrorMessages &&
          error instanceof AccountsJsError &&
          error.code === SendVerificationEmailErrors.UserNotFound
        ) {
          return res.json(null);
        }
        throw error;
      }
      res.json(null);
    } catch (err) {
      sendError(res, err);
    }
  },
];
