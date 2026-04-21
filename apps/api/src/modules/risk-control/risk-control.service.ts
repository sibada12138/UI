import { Injectable } from '@nestjs/common';

export type RiskScope = 'query' | 'token_submit';

type IpRiskState = {
  failedCount: number;
  bannedUntil?: number;
};

type BanRecord = {
  scope: RiskScope;
  ip: string;
  failedCount: number;
  bannedUntil: string;
  remainingSec: number;
};

const FAILURE_LIMIT = 5;
const BAN_MS = 60 * 60 * 1000;

@Injectable()
export class RiskControlService {
  private readonly stateByScope: Record<RiskScope, Map<string, IpRiskState>> = {
    query: new Map<string, IpRiskState>(),
    token_submit: new Map<string, IpRiskState>(),
  };

  private normalizeIp(ip?: string) {
    const normalized = String(ip ?? '').trim();
    return normalized || '127.0.0.1';
  }

  private getMap(scope: RiskScope) {
    return this.stateByScope[scope];
  }

  private cleanupExpired(scope: RiskScope, ip: string): IpRiskState {
    const map = this.getMap(scope);
    const normalizedIp = this.normalizeIp(ip);
    const state = map.get(normalizedIp) ?? { failedCount: 0 };
    if (state.bannedUntil && state.bannedUntil <= Date.now()) {
      state.bannedUntil = undefined;
      state.failedCount = 0;
    }
    map.set(normalizedIp, state);
    return state;
  }

  getState(scope: RiskScope, ip?: string) {
    const normalizedIp = this.normalizeIp(ip);
    return this.cleanupExpired(scope, normalizedIp);
  }

  isBanned(scope: RiskScope, ip?: string) {
    const state = this.getState(scope, ip);
    return Boolean(state.bannedUntil && state.bannedUntil > Date.now());
  }

  registerFailure(scope: RiskScope, ip?: string) {
    const map = this.getMap(scope);
    const normalizedIp = this.normalizeIp(ip);
    const state = this.cleanupExpired(scope, normalizedIp);
    state.failedCount += 1;
    if (state.failedCount >= FAILURE_LIMIT) {
      state.bannedUntil = Date.now() + BAN_MS;
    }
    map.set(normalizedIp, state);
    return state;
  }

  resetFailure(scope: RiskScope, ip?: string) {
    const map = this.getMap(scope);
    const normalizedIp = this.normalizeIp(ip);
    map.set(normalizedIp, { failedCount: 0 });
  }

  clearBan(scope: RiskScope, ip: string) {
    const map = this.getMap(scope);
    map.set(this.normalizeIp(ip), { failedCount: 0 });
  }

  listActiveBans(scope?: RiskScope): BanRecord[] {
    const scopes: RiskScope[] = scope ? [scope] : ['query', 'token_submit'];
    const now = Date.now();
    const records: BanRecord[] = [];

    for (const currentScope of scopes) {
      const map = this.getMap(currentScope);
      for (const [ip] of map.entries()) {
        const refreshed = this.cleanupExpired(currentScope, ip);
        if (!refreshed.bannedUntil || refreshed.bannedUntil <= now) {
          continue;
        }
        records.push({
          scope: currentScope,
          ip,
          failedCount: refreshed.failedCount,
          bannedUntil: new Date(refreshed.bannedUntil).toISOString(),
          remainingSec: Math.max(
            1,
            Math.ceil((refreshed.bannedUntil - now) / 1000),
          ),
        });
      }
    }

    records.sort(
      (a, b) =>
        new Date(b.bannedUntil).getTime() - new Date(a.bannedUntil).getTime(),
    );
    return records;
  }
}
