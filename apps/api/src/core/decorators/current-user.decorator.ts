import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserData {
  userId: number;
  username: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const req = ctx.switchToHttp().getRequest();
    return { userId: req.session.userId, username: req.session.username };
  },
);
