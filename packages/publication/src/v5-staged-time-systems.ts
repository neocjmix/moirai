/** One bounded World Time System catalog page for the v5 explorer. */
import { readV5StagedDocument } from "./v5-staging.js";

export async function readV5StagedTimeSystemCatalog(
  rootBody: string,
  worldId: string,
  revision: number,
  page: number,
  get: (key: string) => Promise<string | null>
): Promise<{
  readonly world_id: string;
  readonly revision: number;
  readonly time_system_count: number;
  readonly time_systems: readonly {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
  }[];
  readonly next_page: number | null;
}> {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    completeness: string;
  };
  if (
    root.world_id !== worldId ||
    root.revision !== revision ||
    ![
      "content-and-temporal-detail-only",
      "content-temporal-and-spatial-staged",
      "complete"
    ].includes(root.completeness) ||
    !Number.isSafeInteger(page) ||
    page < 0
  )
    throw Error("v5_time_catalog_root_invalid");
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/content/`;
  const summary = await readV5StagedDocument(
    rootBody,
    `${prefix}world.json`,
    get
  );
  if (summary === null) throw Error("v5_time_catalog_missing");
  const world = JSON.parse(summary) as {
    world_id: string;
    revision: number;
    time_system_count: number;
    time_system_page_count: number;
  };
  if (
    world.world_id !== worldId ||
    world.revision !== revision ||
    !Number.isSafeInteger(world.time_system_count) ||
    world.time_system_count < 0 ||
    world.time_system_page_count !== Math.ceil(world.time_system_count / 128) ||
    (page >= world.time_system_page_count &&
      !(page === 0 && world.time_system_count === 0))
  )
    throw Error("v5_time_catalog_invalid");
  if (world.time_system_count === 0)
    return {
      world_id: worldId,
      revision,
      time_system_count: 0,
      time_systems: [],
      next_page: null
    };
  const body = await readV5StagedDocument(
    rootBody,
    `${prefix}time-systems/pages/${page}.json`,
    get
  );
  if (body === null) throw Error("v5_time_catalog_missing");
  const catalog = JSON.parse(body) as {
    world_id: string;
    revision: number;
    page: number;
    time_systems: { id: string; slug: string; title: string }[];
  };
  if (
    catalog.world_id !== worldId ||
    catalog.revision !== revision ||
    catalog.page !== page ||
    !Array.isArray(catalog.time_systems) ||
    catalog.time_systems.length < 1 ||
    catalog.time_systems.length > 128 ||
    catalog.time_systems.some(
      (item, index) =>
        !item ||
        typeof item.id !== "string" ||
        typeof item.slug !== "string" ||
        typeof item.title !== "string" ||
        (index > 0 && catalog.time_systems[index - 1]!.id >= item.id)
    )
  )
    throw Error("v5_time_catalog_invalid");
  return {
    world_id: worldId,
    revision,
    time_system_count: world.time_system_count,
    time_systems: catalog.time_systems,
    next_page: page + 1 < world.time_system_page_count ? page + 1 : null
  };
}
