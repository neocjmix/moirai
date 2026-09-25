import V5GraphPage from "../../../components/v5-graph-page";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  return V5GraphPage({ searchParams });
}
