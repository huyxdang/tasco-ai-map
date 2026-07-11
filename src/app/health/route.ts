import { NextResponse } from "next/server";

import { dataset } from "../../lib/data";

export function GET(): NextResponse {
  return NextResponse.json({
    status: "ok",
    service: "tasco-atlas",
    data: {
      poiCount: dataset.pois.length,
      profileCount: dataset.userProfiles.length,
      language: dataset.source.language,
      synthetic: dataset.source.synthetic,
    },
  });
}
