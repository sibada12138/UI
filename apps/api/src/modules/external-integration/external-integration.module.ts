import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExternalIntegrationController } from './external-integration.controller';
import { ExternalIntegrationService } from './external-integration.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExternalIntegrationController],
  providers: [ExternalIntegrationService],
})
export class ExternalIntegrationModule {}
