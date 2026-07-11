import type { Coordinates } from "./types";

export function integerParam(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

export function numberParam(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function coordinatesFromSearchParams(
  params: URLSearchParams,
): Coordinates | undefined {
  const lat = numberParam(params.get("lat"));
  const lon = numberParam(params.get("lon"));
  if (
    lat === undefined ||
    lon === undefined ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return undefined;
  }
  return { lat, lon };
}
