/** Localize continuity proxies to exact Composite IDs and source-time windows. */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
const directory = process.argv[2];
if (!directory)
  throw Error("usage: separation-continuity.mjs preview-directory");
const artifact = JSON.parse(
  readFileSync(`${directory}/comparison.json`, "utf8")
);
const events = new Map(artifact.events.map((event) => [event.id, event]));
const owners = artifact.projection.compositeIds.map((owner) => {
  const bins = new Map();
  for (const id of artifact.projection.leafMembers[owner]) {
    const bin = Math.floor(events.get(id).y / 100);
    if (!bins.has(bin)) bins.set(bin, []);
    bins.get(bin).push(id);
  }
  const modes = Object.fromEntries(
    ["B0", "A", "Lanes-wide", "Lanes", "Aligned"].map((mode) => {
      const positions = artifact.modes[mode].xByEventId;
      const centers = [...bins]
        .sort(([a], [b]) => a - b)
        .map(([bin, ids]) => ({
          bin,
          x: ids.reduce((sum, id) => sum + positions[id], 0) / ids.length,
          ids
        }));
      const transitions = centers.slice(1).flatMap((point, i) =>
        point.bin - centers[i].bin <= 3
          ? [
              {
                fromBin: centers[i].bin,
                toBin: point.bin,
                delta: point.x - centers[i].x
              }
            ]
          : []
      );
      const reversals = transitions
        .slice(1)
        .filter(
          (edge, i) =>
            transitions[i].toBin === edge.fromBin &&
            edge.delta * transitions[i].delta < 0
        ).length;
      return [
        mode,
        {
          travel: transitions.reduce(
            (sum, edge) => sum + Math.abs(edge.delta),
            0
          ),
          reversals,
          transitions,
          centers
        }
      ];
    })
  );
  return { id: owner, title: events.get(owner).title, modes };
});
writeFileSync(
  `${directory}/continuity.json`,
  JSON.stringify(
    {
      binSize: 100,
      definition:
        "All Composite leaf-window centers; no historical significance weighting. Reversals are sign changes across consecutive measured transitions. Bin bounds are source scalars, not Gregorian dates.",
      owners
    },
    null,
    2
  )
);
