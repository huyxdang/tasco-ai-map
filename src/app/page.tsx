import { TascoAtlas } from "@/components/tasco-atlas";
import { featuredPois, getPack, userProfiles } from "@/lib/data";
import { SUBMISSION_DEMO_POI_IDS } from "@/lib/submission-demo";

const presetDrivingPois = SUBMISSION_DEMO_POI_IDS.flatMap((id) => {
  const poi = getPack("workbook").pois.find((candidate) => candidate.id === id);
  return poi ? [poi] : [];
});

export default function Home() {
  return (
    <TascoAtlas initialPois={featuredPois()} profiles={[...userProfiles]} presetDrivingPois={presetDrivingPois} />
  );
}
