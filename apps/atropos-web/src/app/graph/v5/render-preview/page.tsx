import { notFound } from "next/navigation";
import { assertPublicId } from "../../../../lib/publication";
import { v5ShellReader } from "../../../../lib/v5-shell-reader";
import { RenderPreview } from "../../../../components/v5-render-preview";
import demo from "../../../../lib/v5-render-demo.json";

export const dynamic = "force-dynamic";

export default async function RenderPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ world?: string; demo?: string }>;
}) {
  const { world, demo: demoMode } = await searchParams;
  if (demoMode === "1")
    return (
      <RenderPreview
        demo
        worldId={demo.manifest.worldId}
        revision={demo.manifest.revision}
        timeSystemId={demo.manifest.timeSystemId}
        collections={[
          { id: "019f3b00-0000-7000-8000-000000000a02", title: "조선사" },
          { id: "019f3b00-0000-7000-8000-000000000a03", title: "일본사" }
        ]}
      />
    );
  const worldId = world ?? process.env.ATROPOS_CUTOVER_WORLD_ID;
  if (!worldId) notFound();
  try {
    assertPublicId(worldId);
    const shell = await v5ShellReader(worldId);
    const [systems, catalog] = await Promise.all([
      shell.reader.timeSystems(0),
      shell.reader.collections(0)
    ]);
    const timeSystemId = systems.time_systems[0]?.id;
    if (!timeSystemId) notFound();
    return (
      <RenderPreview
        worldId={worldId}
        revision={shell.pointer.served_revision}
        timeSystemId={timeSystemId}
        collections={catalog.collections.map((item) => ({
          id: item.id,
          title: item.title
        }))}
      />
    );
  } catch {
    notFound();
  }
}
