import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TokenModule } from './modules/token/token.module';
import { QueryModule } from './modules/query/query.module';
import { RechargeModule } from './modules/recharge/recharge.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminUserModule } from './modules/admin-user/admin-user.module';
import { AuditModule } from './modules/audit/audit.module';
import { RiskControlModule } from './modules/risk-control/risk-control.module';
import { AdminSessionGuard } from './common/auth/admin-session.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { ExternalIntegrationModule } from './modules/external-integration/external-integration.module';
import { CaptchaController } from './routes/captcha';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TokenModule,
    QueryModule,
    RechargeModule,
    DashboardModule,
    AdminUserModule,
    AuditModule,
    RiskControlModule,
    ExternalIntegrationModule,
  ],
  controllers: [AppController, CaptchaController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AdminSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
