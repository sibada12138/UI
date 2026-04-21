-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssueToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "issueTokenId" TEXT NOT NULL,
    "phoneHash" TEXT NOT NULL,
    "phoneEnc" TEXT NOT NULL,
    "smsCodeEnc" TEXT NOT NULL,
    "submitIp" TEXT,
    "userAgent" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserSubmission_issueTokenId_fkey" FOREIGN KEY ("issueTokenId") REFERENCES "IssueToken" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RechargeTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userSubmissionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rechargeLink" TEXT,
    "qrPayload" TEXT,
    "operatorId" TEXT,
    "remark" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RechargeTask_userSubmissionId_fkey" FOREIGN KEY ("userSubmissionId") REFERENCES "UserSubmission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RechargeTask_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queryType" TEXT NOT NULL,
    "queryKeyHash" TEXT NOT NULL,
    "issueTokenId" TEXT,
    "ip" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "failReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueryLog_issueTokenId_fkey" FOREIGN KEY ("issueTokenId") REFERENCES "IssueToken" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadataJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE INDEX "Admin_role_status_idx" ON "Admin"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminId_idx" ON "AdminSession"("adminId");

-- CreateIndex
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IssueToken_token_key" ON "IssueToken"("token");

-- CreateIndex
CREATE INDEX "IssueToken_status_idx" ON "IssueToken"("status");

-- CreateIndex
CREATE INDEX "IssueToken_expiresAt_idx" ON "IssueToken"("expiresAt");

-- CreateIndex
CREATE INDEX "IssueToken_createdAt_idx" ON "IssueToken"("createdAt");

-- CreateIndex
CREATE INDEX "UserSubmission_issueTokenId_idx" ON "UserSubmission"("issueTokenId");

-- CreateIndex
CREATE INDEX "UserSubmission_phoneHash_idx" ON "UserSubmission"("phoneHash");

-- CreateIndex
CREATE INDEX "UserSubmission_submittedAt_idx" ON "UserSubmission"("submittedAt");

-- CreateIndex
CREATE INDEX "RechargeTask_userSubmissionId_idx" ON "RechargeTask"("userSubmissionId");

-- CreateIndex
CREATE INDEX "RechargeTask_status_idx" ON "RechargeTask"("status");

-- CreateIndex
CREATE INDEX "RechargeTask_operatorId_idx" ON "RechargeTask"("operatorId");

-- CreateIndex
CREATE INDEX "QueryLog_ip_createdAt_idx" ON "QueryLog"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "QueryLog_result_createdAt_idx" ON "QueryLog"("result", "createdAt");

-- CreateIndex
CREATE INDEX "QueryLog_queryType_createdAt_idx" ON "QueryLog"("queryType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
