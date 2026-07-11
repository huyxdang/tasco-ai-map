import type { Coordinates, Poi } from "./types";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function isCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Coordinates>;
  return (
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    candidate.lat >= -90 &&
    candidate.lat <= 90 &&
    typeof candidate.lon === "number" &&
    Number.isFinite(candidate.lon) &&
    candidate.lon >= -180 &&
    candidate.lon <= 180
  );
}

export function haversineMeters(
  from: Coordinates,
  to: Coordinates,
): number {
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lon - from.lon);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

export function closestPois(
  center: Coordinates,
  candidates: readonly Poi[],
): Array<{ poi: Poi; distanceMeters: number }> {
  return candidates
    .map((poi) => ({
      poi,
      distanceMeters: haversineMeters(center, poi.coordinates),
    }))
    .sort(
      (left, right) =>
        left.distanceMeters - right.distanceMeters ||
        left.poi.id.localeCompare(right.poi.id),
    );
}

export function interpolateLine(
  locations: Coordinates[],
  pointsPerSegment = 6,
): [number, number][] {
  const geometry: [number, number][] = [];

  locations.slice(0, -1).forEach((start, segmentIndex) => {
    const end = locations[segmentIndex + 1];
    for (let pointIndex = 0; pointIndex < pointsPerSegment; pointIndex += 1) {
      if (segmentIndex > 0 && pointIndex === 0) continue;
      const progress = pointIndex / (pointsPerSegment - 1);
      geometry.push([
        Number((start.lon + (end.lon - start.lon) * progress).toFixed(6)),
        Number((start.lat + (end.lat - start.lat) * progress).toFixed(6)),
      ]);
    }
  });

  return geometry;
}
