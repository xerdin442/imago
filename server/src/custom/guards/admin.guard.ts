import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DbService } from '@src/db/db.service';
import { Request } from 'express';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>() as Record<
      string,
      any
    >;

    const email = (request.query.email as string) || 'email';
    const admin = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (!admin || admin.id !== 1) {
      throw new UnauthorizedException(
        'Only the Super Admin is authorized to perform this operation',
      );
    }

    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>() as Record<
      string,
      any
    >;

    const email = (request.query.admin as string) || 'email';
    const admin = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (!admin) {
      throw new UnauthorizedException(
        'Only an Admin can perform this operation',
      );
    }

    return true;
  }
}
