import { EnvVerify } from "@/components/EnvLoader";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EnvVerify id={id} />;
}
