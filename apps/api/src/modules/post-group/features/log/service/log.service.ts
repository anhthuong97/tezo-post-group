import { Injectable } from '@nestjs/common';
import { UserSessionStore } from '../../facebook/infrastructure/user-session.store';

@Injectable()
export class LogService {
  constructor(private readonly store: UserSessionStore) {}

  getLogs(userId: number): string[] {
    return this.store.get(userId).log;
  }

  clearLogs(userId: number): void {
    this.store.get(userId).log = [];
  }
}
