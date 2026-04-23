import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      success: true,
      service: 'api',
      build: process.env.APP_BUILD_STAMP ?? 'api-dev-build',
      time: new Date().toISOString(),
    };
  }
}
