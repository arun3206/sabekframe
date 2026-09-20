import { redirect } from "next/navigation";
import { GenerationProgress } from "@/features/portrait-flow/components/generation-progress";

export default async function GeneratingPage({
  searchParams,
}: {
  searchParams: Promise<{ jobToken?: string }>;
}) {
  const { jobToken } = await searchParams;
  if (!jobToken) redirect("/create");
  return <GenerationProgress jobToken={jobToken} />;
}
