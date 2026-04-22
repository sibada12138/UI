import { Module } from '@nestjs/common';
import { TokenService } from './token.service';
import { AdminTokenController } from './admin-token.controller';
import { PublicTokenController } from './token.controller';
import { ExternalIntegrationModule } from '../external-integration/external-integration.module';

@Module({
  imports: [ExternalIntegrationModule],
  providers: [TokenService],
  controllers: [AdminTokenController, PublicTokenController],
  exports: [TokenService],
})
export class TokenModule {}
