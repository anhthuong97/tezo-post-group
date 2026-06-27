import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { BrowserService } from '../infrastructure/browser.service';

@Injectable()
export class SessionFileRepository {
  constructor(private readonly browser: BrowserService) {}

  exists(userId: number): boolean {
    return this.browser.hasSavedSession(userId);
  }

  delete(userId: number): void {
    const f = this.browser.getFbAuthFile(userId);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}
