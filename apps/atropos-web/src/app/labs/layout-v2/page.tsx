import { redirect } from "next/navigation";
/** The experiment is observed in the actual GraphShell, never a second viewer. */
export default async function LayoutLabV2Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (typeof value === "string") query.set(key, value);
  if (!query.has("world"))
    query.set("world", "01a107fb-4018-7fcb-8390-836a40fa91cc");
  query.set("layoutLab", "force-v2");
  redirect(`/graph/v5?${query}`);
}
