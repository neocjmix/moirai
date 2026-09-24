import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { V5Explorer } from "./v5-explorer";

describe("v5 explorer initial navigation model", () => {
  it("starts from paged Collections and a World Time System, not a Canon-owned Event list", () => {
    const body = renderToStaticMarkup(
      <V5Explorer
        worldId="01995c2a-7b00-7000-8000-000000000001"
        revision={31}
        worldTitle="실제 세계사"
        initialCollections={[
          {
            id: "01995c2a-7b00-7000-8000-000000000002",
            slug: "joseon",
            title: "조선사",
            member_count: 12,
            member_page_count: 1
          }
        ]}
        nextCollectionPage={null}
        initialTimeSystems={[
          {
            id: "01995c2a-7b00-7000-8000-000000000003",
            slug: "gregorian",
            title: "Gregorian"
          }
        ]}
        nextTimeSystemPage={null}
        initialSpatial={{
          shape_count: 100,
          unplaced_count: 2,
          bounds: { minX: 0, maxX: 100, minY: 0, maxY: 50 }
        }}
      />
    );
    expect(body).toContain("실제 세계사");
    expect(body).toContain("배치 100 · 미배치 2");
    expect(body).toContain("컬렉션은 사건의 소유자가 아니라 탐색을 위한 선택");
    expect(body).toContain("World의 contains 관계에서 파생");
    expect(body).toContain("조선사");
    expect(body).not.toContain("Canon");
  });
});
