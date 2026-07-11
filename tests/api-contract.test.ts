import { describe, expect, it } from "vitest";

import {
  GET,
  POST,
} from "../src/app/v1/[...path]/route";
import { POST as POST_CHAT } from "../src/app/api/chat/route";

describe("DOCX-compatible REST envelopes", () => {
  it("returns the search query, PlaceResults, and meta", async () => {
    const response = await GET(
      new Request(
        "http://localhost/v1/search?q=cafe%20y%C3%AAn%20t%C4%A9nh&limit=2&lang=vi",
      ),
      { params: Promise.resolve({ path: ["search"] }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.query).toBe("cafe yên tĩnh");
    expect(body.results).toHaveLength(2);
    expect(body.meta).toEqual({ limit: 2, lang: "vi" });
    expect(body.results[0]).toMatchObject({
      type: "poi",
      source: "tasco-dataset",
    });
  });

  it("returns the strict route response contract", async () => {
    const response = await POST(
      new Request("http://localhost/v1/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locations: [
            { lat: 21.0285, lon: 105.8542 },
            { lat: 21.0183, lon: 105.8558 },
          ],
          mode: "walking",
          alternates: false,
        }),
      }),
      { params: Promise.resolve({ path: ["route"] }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meta).toEqual({ mode: "walking", alternates: 0 });
    expect(body.routes[0]).toMatchObject({
      sourceIndex: 0,
      geometry: { type: "LineString" },
    });
    expect(body.routes[0].maneuvers[0]).toEqual(
      expect.objectContaining({
        instruction: expect.any(String),
        streetNames: [],
      }),
    );
  });

  it("supports autocomplete and stable POI lookup", async () => {
    const autocomplete = await GET(
      new Request(
        "http://localhost/v1/autocomplete?q=Galaxy&limit=2&sessionId=s-demo",
      ),
      { params: Promise.resolve({ path: ["autocomplete"] }) },
    );
    const suggestions = await autocomplete.json();
    expect(suggestions.suggestions.map(({ id }: { id: string }) => id)).toEqual([
      "POI008",
      "POI009",
    ]);
    expect(suggestions.meta).toEqual({ limit: 2, sessionId: "s-demo" });

    const lookup = await GET(
      new Request("http://localhost/v1/poi/POI008"),
      { params: Promise.resolve({ path: ["poi", "POI008"] }) },
    );
    expect(await lookup.json()).toMatchObject({
      poi: { id: "POI008", name: "Galaxy Nguyễn Du" },
    });
  });

  it("supports reverse geocoding and canonical nearby radiusMeters", async () => {
    const reverse = await GET(
      new Request(
        "http://localhost/v1/reverse-geocoding?lat=10.7734&lon=106.7041&limit=1",
      ),
      { params: Promise.resolve({ path: ["reverse-geocoding"] }) },
    );
    expect((await reverse.json()).results[0].id).toBe("POI001");

    const nearby = await GET(
      new Request(
        "http://localhost/v1/nearby-search?lat=10.7734&lon=106.7041&radiusMeters=100&limit=5",
      ),
      { params: Promise.resolve({ path: ["nearby-search"] }) },
    );
    const body = await nearby.json();
    expect(body.meta.radiusMeters).toBe(100);
    expect(
      body.results.every(
        ({ distanceMeters }: { distanceMeters: number }) =>
          distanceMeters <= 100,
      ),
    ).toBe(true);
  });

  it("accepts the canonical geocoding address parameter", async () => {
    const response = await GET(
      new Request(
        "http://localhost/v1/geocoding?address=27%20Ng%C3%B4%20%C4%90%E1%BB%A9c%20K%E1%BA%BF&limit=1",
      ),
      { params: Promise.resolve({ path: ["geocoding"] }) },
    );
    const body = await response.json();
    expect(body.query).toBe("27 Ngô Đức Kế");
    expect(body.results[0].id).toBe("POI001");
  });

  it("accepts the frontend chat body and returns updated private context", async () => {
    const response = await POST_CHAT(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "browser-session",
          message: "Tìm cafe yên tĩnh để làm việc.",
          profileId: "U001",
          history: [{ role: "user", content: "Tôi ở Quận 1." }],
          sessionContext: { constraints: ["wifi"] },
        }),
      }),
    );
    const body = await response.json();
    expect(body.sessionContext).toMatchObject({
      sessionId: "browser-session",
      profileId: "U001",
      lastQuery: "Tìm cafe yên tĩnh để làm việc.",
    });
    expect(body.privacy).toEqual({ mode: "session-only", persisted: false });
    expect(body.recommendations[0].scoreBreakdown).toBeTypeOf("object");
  });
});
