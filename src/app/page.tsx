import dataset from "@/data/dataset.json";

import { TascoAtlas } from "@/components/tasco-atlas";
import type { Poi, UserProfile } from "@/lib/types";

export default function Home() {
  const featuredPois = (dataset.pois as Poi[]).filter(
    (poi) => poi.datasetTier === "featured"
  );

  return (
    <TascoAtlas
      initialPois={featuredPois}
      profiles={dataset.userProfiles as UserProfile[]}
    />
  );
}
