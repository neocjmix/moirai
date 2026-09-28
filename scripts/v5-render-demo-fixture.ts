/** Synthetic visual fixture compiled offline into v5-render-demo.json. */
import type { CanonicalState } from "@moirai/contracts/v5";
import { compileV5RenderPublication } from "@moirai/graph-presentation/server";
import type { V5WorldLayout } from "@moirai/graph-presentation/server";

const worldId = "019f3b00-0000-7000-8000-000000000a01";
const timeSystemId = "019f3b00-0000-7000-8000-000000000a21";
const one = "019f3b00-0000-7000-8000-000000000a02";
const two = "019f3b00-0000-7000-8000-000000000a03";
const outer = "019f3b00-0000-7000-8000-000000000a11";
const a = "019f3b00-0000-7000-8000-000000000a12";
const b = "019f3b00-0000-7000-8000-000000000a14";
const c = "019f3b00-0000-7000-8000-000000000a15";
const d = "019f3b00-0000-7000-8000-000000000a16";
const relation = (
  id: string,
  type: string,
  source: string,
  target: string
) => ({
  id,
  type,
  source_ref: { kind: "event", event_id: source },
  target_ref: { kind: "event", event_id: target }
});
const state = {
  world: { id: worldId },
  events: [
    { id: outer, title: "합성 영역" },
    { id: a, title: "출발" },
    { id: b, title: "변화" },
    { id: c, title: "확장" },
    { id: d, title: "연결" }
  ],
  eventCollectionMemberships: [
    { event_id: outer, collection_id: one },
    { event_id: a, collection_id: one },
    { event_id: b, collection_id: one },
    { event_id: b, collection_id: two },
    { event_id: c, collection_id: two },
    { event_id: d, collection_id: two }
  ],
  relations: [
    relation("contains-a", "contains", outer, a),
    relation("contains-b", "contains", outer, b),
    relation("contains-c", "contains", outer, c),
    relation("causes-ad", "causes", a, d)
  ]
} as unknown as CanonicalState;
const layout = {
  world_id: worldId,
  revision: 31,
  time_system_id: timeSystemId,
  shapes: [
    {
      event_id: outer,
      kind: "region",
      bounds: { minX: -90, maxX: 80, minY: -65, maxY: 85 }
    },
    { event_id: a, kind: "point", position: { x: -80, y: -45 } },
    { event_id: b, kind: "point", position: { x: 45, y: -30 } },
    { event_id: c, kind: "point", position: { x: -25, y: 75 } },
    { event_id: d, kind: "point", position: { x: 90, y: 50 } }
  ]
} as unknown as V5WorldLayout;

export function buildV5RenderDemo() {
  const publication = compileV5RenderPublication(state, layout);
  const { documents, geometryDocuments, ...manifest } = publication;
  const assets = Object.fromEntries(
    [...documents, ...geometryDocuments].map(({ key, body }) => {
      const ref = [...publication.tiles, ...publication.geometry].find(
        (item) => item.key === key
      );
      if (!ref) throw Error("render_demo_reference_missing");
      return [key, { sha256: ref.sha256, body: JSON.parse(body) as unknown }];
    })
  );
  return { manifest, assets };
}
