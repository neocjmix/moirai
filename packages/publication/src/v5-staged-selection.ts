/** Inactive bounded union of active Collection memberships. A shared World
 * Event is returned once, without copying its owner Narrative or its node. */
import { readV5StagedCollection } from "./v5-staged-collection.js";

interface Position {
  readonly collection_id: string;
  readonly page: number;
  readonly offset: number;
}
export interface V5SelectionCursor {
  readonly world_id: string;
  readonly revision: number;
  readonly positions: readonly (Position | null)[];
}

export async function readV5StagedSelectionPage(
  rootBody: string,
  worldId: string,
  revision: number,
  collectionIds: readonly string[],
  cursor: V5SelectionCursor | null,
  get: (key: string) => Promise<string | null>
): Promise<{
  readonly event_ids: readonly string[];
  readonly next_cursor: V5SelectionCursor | null;
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
      "content-temporal-and-spatial-staged"
    ].includes(root.completeness) ||
    collectionIds.length < 1 ||
    collectionIds.length > 8 ||
    collectionIds.some(
      (id, index) =>
        !/^[a-zA-Z0-9-]+$/.test(id) ||
        (index > 0 && collectionIds[index - 1]! >= id)
    ) ||
    (cursor !== null &&
      (cursor.world_id !== worldId ||
        cursor.revision !== revision ||
        !Array.isArray(cursor.positions) ||
        cursor.positions.length !== collectionIds.length ||
        cursor.positions.every((position) => position === null) ||
        Array.from(cursor.positions).some(
          (position, index) =>
            position === undefined ||
            (position !== null &&
              (position.collection_id !== collectionIds[index] ||
                !Number.isSafeInteger(position.page) ||
                position.page < 0 ||
                !Number.isSafeInteger(position.offset) ||
                position.offset < 0 ||
                position.offset >= 128))
        )))
  )
    throw Error("v5_selection_cursor_invalid");

  const positions: (Position | null)[] = collectionIds.map(
    (collection_id, index) =>
      cursor ? cursor.positions[index]! : { collection_id, page: 0, offset: 0 }
  );
  const pages = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof readV5StagedCollection>>>
  >();
  const peek = async (index: number): Promise<string | null> => {
    let position = positions[index] ?? null;
    while (position !== null) {
      const key = `${position.collection_id}:${position.page}`;
      let page = pages.get(key);
      if (!page) {
        page =
          (await readV5StagedCollection(
            rootBody,
            worldId,
            revision,
            position.collection_id,
            position.page,
            get
          )) ?? undefined;
        if (!page) throw Error("v5_selection_collection_missing");
        pages.set(key, page);
      }
      const id = page.event_ids[position.offset];
      if (id !== undefined) return id;
      position =
        page.next_page === null
          ? null
          : {
              collection_id: position.collection_id,
              page: page.next_page,
              offset: 0
            };
      positions[index] = position;
    }
    return null;
  };
  const eventIds: string[] = [];
  for (let count = 0; count < 128; count++) {
    const heads = await Promise.all(positions.map((_, index) => peek(index)));
    const selected = heads.filter((id): id is string => id !== null).sort()[0];
    if (!selected) break;
    eventIds.push(selected);
    for (let index = 0; index < heads.length; index++) {
      if (heads[index] !== selected) continue;
      const position = positions[index]!;
      positions[index] = { ...position, offset: position.offset + 1 };
    }
  }
  // Normalize every exhausted position before emitting a cursor, including
  // the final item exactly at the end of a 128-member page.
  await Promise.all(positions.map((_, index) => peek(index)));
  return {
    event_ids: eventIds,
    next_cursor: positions.every((position) => position === null)
      ? null
      : { world_id: worldId, revision, positions }
  };
}
