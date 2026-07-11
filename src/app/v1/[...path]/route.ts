import { NextResponse } from "next/server";

import { getPoiById, getUserProfile, pois } from "../../../lib/data";
import { closestPois } from "../../../lib/geo";
import {
  coordinatesFromSearchParams,
  integerParam,
  numberParam,
} from "../../../lib/http";
import {
  buildRoutes,
  validateRouteRequest,
} from "../../../lib/routing";
import { rankPois, searchPlaces, toPlaceResult } from "../../../lib/search";

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  const endpoint = path[0];
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? searchParams.get("query") ?? "";
  const limit = integerParam(searchParams.get("limit"), 10, 1, 50);

  if (endpoint === "search" && path.length === 1) {
    const origin = coordinatesFromSearchParams(searchParams);
    const profile = getUserProfile(searchParams.get("profileId") ?? undefined);
    const category = searchParams.get("category") ?? undefined;
    const results = searchPlaces(query, {
      profile,
      origin,
      category,
      hardCategory: Boolean(category),
      limit,
    });
    return NextResponse.json({
      query,
      results,
      meta: { limit, lang: searchParams.get("lang") ?? "vi" },
    });
  }

  if (endpoint === "autocomplete" && path.length === 1) {
    const suggestions = searchPlaces(query, { limit });
    return NextResponse.json({
      query,
      suggestions,
      meta: {
        limit,
        sessionId: searchParams.get("sessionId") ?? "tasco-local-session",
      },
    });
  }

  if (endpoint === "poi" && path.length === 2) {
    const poi = getPoiById(decodeURIComponent(path[1]));
    return poi
      ? NextResponse.json({ poi })
      : apiError(404, "POI_NOT_FOUND", "Không tìm thấy địa điểm.");
  }

  if (endpoint === "reverse-geocoding" && path.length === 1) {
    const center = coordinatesFromSearchParams(searchParams);
    if (!center) {
      return apiError(
        400,
        "INVALID_COORDINATES",
        "lat và lon hợp lệ là bắt buộc.",
      );
    }
    const results = closestPois(center, pois)
      .slice(0, limit)
      .map(({ poi, distanceMeters }) =>
        toPlaceResult(poi, { distanceMeters }),
      );
    return NextResponse.json({ results });
  }

  if (endpoint === "nearby-search" && path.length === 1) {
    const center = coordinatesFromSearchParams(searchParams);
    if (!center) {
      return apiError(
        400,
        "INVALID_COORDINATES",
        "lat và lon hợp lệ là bắt buộc.",
      );
    }
    const radiusMeters = Math.min(
      100_000,
      Math.max(
        50,
        numberParam(searchParams.get("radiusMeters")) ??
          numberParam(searchParams.get("radius")) ??
          5_000,
      ),
    );
    const category = searchParams.get("category") ?? undefined;
    const results = rankPois(query, {
      origin: center,
      radiusMeters,
      category,
      hardCategory: Boolean(category),
      limit,
    }).map(({ poi, distanceMeters, score }) =>
      toPlaceResult(poi, { distanceMeters, score }),
    );
    return NextResponse.json({
      center,
      results,
      meta: { radiusMeters, limit },
    });
  }

  if (endpoint === "geocoding" && path.length === 1) {
    const address = searchParams.get("address") ?? query;
    const results = searchPlaces(address, { limit });
    return NextResponse.json({ query: address, results });
  }

  return apiError(404, "ENDPOINT_NOT_FOUND", "Endpoint không tồn tại.");
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { path } = await context.params;
  if (path.length !== 1 || path[0] !== "route") {
    return apiError(404, "ENDPOINT_NOT_FOUND", "Endpoint không tồn tại.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Nội dung JSON không hợp lệ.");
  }
  if (!validateRouteRequest(body)) {
    return apiError(
      400,
      "INVALID_ROUTE_REQUEST",
      "locations phải có ít nhất hai tọa độ WGS84 dạng {lat, lon}.",
    );
  }
  return NextResponse.json(buildRoutes(body));
}
