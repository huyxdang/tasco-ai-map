import { TascoAtlas } from "@/components/tasco-atlas";
import { featuredPois, userProfiles } from "@/lib/data";

export default function Home() {
  return (
    <TascoAtlas initialPois={featuredPois()} profiles={[...userProfiles]} />
  );
}
