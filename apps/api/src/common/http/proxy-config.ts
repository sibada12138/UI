export type OutboundProxyConfig = {
  enabled: boolean;
  proxyUrl?: string;
};

export function getOutboundProxyConfig(): OutboundProxyConfig {
  const proxyUrl = process.env.OUTBOUND_PROXY_URL?.trim();
  if (!proxyUrl) {
    return { enabled: false };
  }
  return { enabled: true, proxyUrl };
}

