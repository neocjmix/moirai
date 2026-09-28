import { notFound } from "next/navigation";
import { assertPublicId } from "../../../../lib/publication";
import { v5ShellReader } from "../../../../lib/v5-shell-reader";
import { RenderPreview } from "../../../../components/v5-render-preview";

export const dynamic = "force-dynamic";

export default async function RenderPreviewPage({
  searchParams
}: {
  searchParams: Promise<{ world?: string }>;
}) {
  const { world } = await searchParams;
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
