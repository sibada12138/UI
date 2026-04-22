-- AlterTable
ALTER TABLE "UserSubmission" ADD COLUMN "accessTokenEnc" TEXT;
ALTER TABLE "UserSubmission" ADD COLUMN "refreshTokenEnc" TEXT;
ALTER TABLE "UserSubmission" ADD COLUMN "externalUid" TEXT;
ALTER TABLE "UserSubmission" ADD COLUMN "userVipJson" JSONB;
ALTER TABLE "UserSubmission" ADD COLUMN "winkVipJson" JSONB;
ALTER TABLE "UserSubmission" ADD COLUMN "vipFetchedAt" DATETIME;

-- AlterTable
ALTER TABLE "RechargeTask" ADD COLUMN "apiStatus" TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE "RechargeTask" ADD COLUMN "apiMessage" TEXT;
ALTER TABLE "RechargeTask" ADD COLUMN "availableChannelsJson" JSONB;
ALTER TABLE "RechargeTask" ADD COLUMN "selectedChannel" TEXT;
ALTER TABLE "RechargeTask" ADD COLUMN "lastApiAt" DATETIME;
ALTER TABLE "RechargeTask" ADD COLUMN "lastPriceValue" REAL;

-- CreateIndex
CREATE INDEX "RechargeTask_apiStatus_idx" ON "RechargeTask"("apiStatus");
