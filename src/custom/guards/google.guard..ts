import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Secrets } from '@src/common/secrets';
import { Request, Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly GOOGLE_REDIRECT_COOKIE_KEY: string =
    'google_auth_redirect_url';

  constructor() {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Store client redirect URL before Google invokes the callback
    const redirectUrl = req.query.redirectUrl as string;
    res.cookie(this.GOOGLE_REDIRECT_COOKIE_KEY, redirectUrl, {
      httpOnly: true,
      secure: Secrets.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 20 * 60 * 1000,
    });

    // Trigger the Google strategy and populate the req.user object if validation is successful
    const activate = await super.canActivate(context);

    return activate as boolean;
  }
}
