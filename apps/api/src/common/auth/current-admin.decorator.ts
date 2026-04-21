import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

export type CurrentAdminUser = {
  id: string;
  username: string;
  role: AdminRole;
  sessionId?: string;
};

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentAdminUser | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.admin as CurrentAdminUser | undefined;
  },
);
