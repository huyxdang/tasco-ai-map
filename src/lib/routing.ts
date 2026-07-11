import { haversineMeters, interpolateLine, isCoordinates } from "./geo";
import type { Coordinates, RouteResult } from "./types";

export interface RouteRequest {
  locations: Coordinates[];
  mode?: string;
  alternates?: boolean | number;
  language?: string;
  units?: string;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}

export interface RouteResponse {
  routes: RouteResult[];
  meta: {
    mode: string;
    alternates: number;
  };
}

const SPEED_METERS_PER_SECOND: Record<string, number> = {
  driving: 35_000 / 3_600,
  car: 35_000 / 3_600,
  cycling: 15_000 / 3_600,
  bicycle: 15_000 / 3_600,
  walking: 5_000 / 3_600,
  foot: 5_000 / 3_600,
};

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

function routeId(locations: Coordinates[], mode: string, index: number): string {
  const key = locations
    .map(({ lat, lon }) => `${lat.toFixed(6)},${lon.toFixed(6)}`)
    .join("|");
  return `tasco-${mode}-${stableHash(`${key}|${index}`)}`;
}

function offsetLocations(
  locations: Coordinates[],
  alternateIndex: number,
): Coordinates[] {
  if (alternateIndex === 0 || locations.length < 2) return locations;
  const offset = 0.0012 * alternateIndex;
  return locations.flatMap((location, index) => {
    if (index === locations.length - 1) return [location];
    const next = locations[index + 1];
    return [
      location,
      {
        lat: Number(((location.lat + next.lat) / 2 + offset).toFixed(6)),
        lon: Number(((location.lon + next.lon) / 2 - offset).toFixed(6)),
      },
    ];
  });
}

function normalizeMode(mode?: string): string {
  const normalized = mode?.toLowerCase() ?? "driving";
  return SPEED_METERS_PER_SECOND[normalized] ? normalized : "driving";
}

function alternateCount(value?: boolean | number): number {
  if (value === true) return 1;
  if (value === false || value === undefined) return 0;
  return Math.min(2, Math.max(0, Math.floor(value)));
}

export function validateRouteRequest(value: unknown): value is RouteRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<RouteRequest>;
  return (
    Array.isArray(request.locations) &&
    request.locations.length >= 2 &&
    request.locations.every(isCoordinates)
  );
}

function makeRoute(
  locations: Coordinates[],
  mode: string,
  sourceIndex: number,
): RouteResult {
  const routedLocations = offsetLocations(locations, sourceIndex);
  const speed = SPEED_METERS_PER_SECOND[mode];
  const segmentDistances = routedLocations.slice(0, -1).map((location, index) =>
    haversineMeters(location, routedLocations[index + 1]),
  );
  const distanceMeters = segmentDistances.reduce(
    (total, segment) => total + segment,
    0,
  );
  const durationSeconds = Math.max(1, Math.round(distanceMeters / speed));
  const geometry = interpolateLine(routedLocations);
  const maneuvers = segmentDistances.map((segmentDistance, index) => ({
    instruction:
      index === segmentDistances.length - 1
        ? "Tiếp tục theo tuyến mô phỏng và đến điểm đích."
        : "Tiếp tục theo tuyến mô phỏng đến điểm tiếp theo.",
    distanceMeters: segmentDistance,
    durationSeconds: Math.max(1, Math.round(segmentDistance / speed)),
    beginShapeIndex: index * 5,
    endShapeIndex: (index + 1) * 5,
    streetNames: [] as string[],
  }));

  return {
    routeId: routeId(locations, mode, sourceIndex),
    sourceIndex,
    summary: { distanceMeters, durationSeconds },
    geometry: { type: "LineString", coordinates: geometry },
    maneuvers,
  };
}

export function buildRoutes(request: RouteRequest): RouteResponse {
  const mode = normalizeMode(request.mode);
  const alternates = alternateCount(request.alternates);
  return {
    routes: Array.from({ length: alternates + 1 }, (_, index) =>
      makeRoute(request.locations, mode, index),
    ),
    meta: { mode, alternates },
  };
}
