import rawDataset from "../data/dataset.json";

import type { Dataset, Poi, UserProfile } from "./types";

export const dataset = rawDataset as Dataset;
export const pois: readonly Poi[] = dataset.pois;
export const userProfiles: readonly UserProfile[] = dataset.userProfiles;

const poiById = new Map(pois.map((poi) => [poi.id, poi]));
const profileById = new Map(
  userProfiles.map((profile) => [profile.id, profile]),
);

export function getPoiById(id: string): Poi | undefined {
  return poiById.get(id.toUpperCase());
}

export function getUserProfile(id?: string): UserProfile | undefined {
  return id ? profileById.get(id.toUpperCase()) : undefined;
}
