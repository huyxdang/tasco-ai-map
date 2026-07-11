import { describe, expect, it } from "vitest";

import { buildRoutes } from "../src/lib/routing";

describe("route fallback", () => {
  const locations = [
    { lat: 10.7734, lon: 106.7041 },
    { lat: 10.7721, lon: 106.6983 },
  ];

  it("builds stable WGS84 GeoJSON with explainable summary", () => {
    const first = buildRoutes({ locations, mode: "walking" });
    const second = buildRoutes({ locations, mode: "walking" });
    const route = first.routes[0];

    expect(route.routeId).toBe(second.routes[0].routeId);
    expect(route.geometry.type).toBe("LineString");
    expect(route.geometry.coordinates[0]).toEqual([106.7041, 10.7734]);
    expect(route.geometry.coordinates.at(-1)).toEqual([106.6983, 10.7721]);
    expect(route.summary.distanceMeters).toBeGreaterThan(0);
    expect(route.summary.durationSeconds).toBeGreaterThan(0);
    expect(route.maneuvers[0].instruction).toContain("mô phỏng");
  });

  it("returns deterministic alternates when requested", () => {
    const response = buildRoutes({ locations, alternates: true });
    expect(response.routes).toHaveLength(2);
    expect(response.meta).toEqual({ mode: "driving", alternates: 1 });
    expect(response.routes[1].sourceIndex).toBe(1);
  });
});
