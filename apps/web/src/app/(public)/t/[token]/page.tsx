import TokenClientPage from "../token-client-page";

export default async function TokenByPathPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolved = await params;
  return <TokenClientPage initialToken={resolved.token ?? ""} />;
}
