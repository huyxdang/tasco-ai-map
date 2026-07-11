"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type Marker
} from "maplibre-gl";

import type { Poi } from "@/lib/types";

type MapMode = "2d" | "3d";

type MapViewProps = {
  pois: Poi[];
  mode: MapMode;
  selectedPoiId: string | null;
  routeCoordinates: [number, number][];
  activeStopIndex: number;
  onSelectPoi: (poi: Poi) => void;
  onReadyChange?: (ready: boolean) => void;
};

const EMPTY_COLLECTION = {
  type: "FeatureCollection" as const,
  features: []
};

const BASE_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  },
  layers: [
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      paint: {
        "raster-saturation": -0.74,
        "raster-contrast": 0.12,
        "raster-brightness-min": 0.2,
        "raster-brightness-max": 0.72
      }
    }
  ]
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function colorForPoi(poi: Poi) {
  const category = normalize(poi.category);
  if (category.includes("ca phe")) return "#42d7b6";
  if (category.includes("nha hang")) return "#ff9a57";
  if (category.includes("khach san") || category.includes("resort")) {
    return "#a88bff";
  }
  if (category.includes("tram xang") || category.includes("san bay")) {
    return "#ffd84f";
  }
  if (category.includes("benh vien")) return "#ff6b7a";
  if (category.includes("cong vien") || category.includes("du lich")) {
    return "#74e48e";
  }
  return "#6fc8ff";
}

function pointCollection(pois: Poi[], selectedPoiId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: pois.map((poi, index) => ({
      type: "Feature" as const,
      id: poi.id,
      properties: {
        id: poi.id,
        name: poi.name,
        rank: index + 1,
        color: colorForPoi(poi),
        selected: poi.id === selectedPoiId
      },
      geometry: {
        type: "Point" as const,
        coordinates: [poi.coordinates.lon, poi.coordinates.lat]
      }
    }))
  };
}

function towerCollection(pois: Poi[], selectedPoiId: string | null) {
  return {
    type: "FeatureCollection" as const,
    features: pois.map((poi, index) => {
      const size = 0.00012 + Math.min(poi.popularityScore, 100) * 0.0000008;
      const { lon, lat } = poi.coordinates;
      return {
        type: "Feature" as const,
        id: poi.id,
        properties: {
          id: poi.id,
          name: poi.name,
          rank: index + 1,
          color: colorForPoi(poi),
          height: 24 + poi.popularityScore * 2.1,
          selected: poi.id === selectedPoiId
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [lon - size, lat - size],
              [lon + size, lat - size],
              [lon + size, lat + size],
              [lon - size, lat + size],
              [lon - size, lat - size]
            ]
          ]
        }
      };
    })
  };
}

function routeCollection(routeCoordinates: [number, number][]) {
  return {
    type: "FeatureCollection" as const,
    features:
      routeCoordinates.length > 1
        ? [
            {
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "LineString" as const,
                coordinates: routeCoordinates
              }
            }
          ]
        : []
  };
}

function addDataLayers(map: MapLibreMap) {
  map.addSource("tasco-pois", { type: "geojson", data: EMPTY_COLLECTION });
  map.addSource("tasco-towers", { type: "geojson", data: EMPTY_COLLECTION });
  map.addSource("tasco-route", {
    type: "geojson",
    data: EMPTY_COLLECTION,
    lineMetrics: true
  });

  map.addLayer({
    id: "tasco-route-glow",
    type: "line",
    source: "tasco-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": "#c9ff57",
      "line-width": 12,
      "line-opacity": 0.18,
      "line-blur": 4
    }
  });

  map.addLayer({
    id: "tasco-route",
    type: "line",
    source: "tasco-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-gradient": [
        "interpolate",
        ["linear"],
        ["line-progress"],
        0,
        "#43d7b7",
        0.52,
        "#c9ff57",
        1,
        "#ff9a57"
      ],
      "line-width": 4.5,
      "line-opacity": 0.96
    }
  });

  map.addLayer({
    id: "tasco-towers",
    type: "fill-extrusion",
    source: "tasco-towers",
    paint: {
      "fill-extrusion-color": [
        "case",
        ["boolean", ["get", "selected"], false],
        "#d7ff5e",
        ["get", "color"]
      ],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0
    }
  });

  map.addLayer({
    id: "tasco-poi-halo",
    type: "circle",
    source: "tasco-pois",
    paint: {
      "circle-radius": [
        "case",
        ["boolean", ["get", "selected"], false],
        22,
        13
      ],
      "circle-color": ["get", "color"],
      "circle-opacity": 0.16,
      "circle-blur": 0.6
    }
  });
}

export function MapView({
  pois,
  mode,
  selectedPoiId,
  routeCoordinates,
  activeStopIndex,
  onSelectPoi,
  onReadyChange
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelectPoi);
  const poiByIdRef = useRef(new Map<string, Poi>());
  const [loaded, setLoaded] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mapInitError, setMapInitError] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelectPoi;
  }, [onSelectPoi]);

  useEffect(() => {
    poiByIdRef.current = new Map(pois.map((poi) => [poi.id, poi]));
  }, [pois]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASE_STYLE,
        center: [106.7002, 10.7758],
        zoom: 13.2,
        minZoom: 4,
        maxZoom: 18,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        cooperativeGestures: true
      });
    } catch {
      queueMicrotask(() => {
        setMapInitError(true);
        onReadyChange?.(false);
      });
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      addDataLayers(map);
      setLoaded(true);
      onReadyChange?.(true);
    });
    map.on("error", (event) => {
      if (String(event.error?.message ?? "").toLowerCase().includes("tile")) {
        setTileError(true);
      }
    });
    map.on("click", "tasco-towers", (event) => {
      const id = String(event.features?.[0]?.properties?.id ?? "");
      const poi = poiByIdRef.current.get(id);
      if (poi) onSelectRef.current(poi);
    });
    map.on("mouseenter", "tasco-towers", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "tasco-towers", () => {
      map.getCanvas().style.cursor = "";
    });

    mapRef.current = map;
    return () => {
      onReadyChange?.(false);
      markersRef.current.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [onReadyChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const pointSource = map.getSource("tasco-pois") as GeoJSONSource;
    const towerSource = map.getSource("tasco-towers") as GeoJSONSource;
    pointSource.setData(pointCollection(pois, selectedPoiId));
    towerSource.setData(towerCollection(pois, selectedPoiId));

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = pois.slice(0, 12).map((poi, index) => {
      const markerNode = document.createElement("button");
      markerNode.type = "button";
      markerNode.className = `map-marker${poi.id === selectedPoiId ? " is-selected" : ""}`;
      markerNode.style.setProperty("--marker-color", colorForPoi(poi));
      markerNode.style.opacity = mode === "3d" ? "0.78" : "1";
      markerNode.setAttribute("aria-label", `Chọn ${poi.name}`);
      markerNode.innerHTML = `<span>${index + 1}</span>`;
      markerNode.addEventListener("click", () => onSelectRef.current(poi));
      return new maplibregl.Marker({ element: markerNode, anchor: "bottom" })
        .setLngLat([poi.coordinates.lon, poi.coordinates.lat])
        .addTo(map);
    });

    if (pois.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      pois.slice(0, 12).forEach((poi) => {
        bounds.extend([poi.coordinates.lon, poi.coordinates.lat]);
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 120, right: 110, bottom: 130, left: 110 },
          maxZoom: 14.6,
          duration: 850,
          pitch: mode === "3d" ? 58 : 0,
          bearing: mode === "3d" ? -20 : 0
        });
      }
    }
  }, [loaded, mode, pois, selectedPoiId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    map.easeTo({
      pitch: mode === "3d" ? 58 : 0,
      bearing: mode === "3d" ? -20 : 0,
      duration: 900
    });
    map.setPaintProperty(
      "tasco-towers",
      "fill-extrusion-opacity",
      mode === "3d" ? 0.84 : 0
    );
    map.setPaintProperty(
      "tasco-poi-halo",
      "circle-opacity",
      mode === "3d" ? 0.05 : 0.16
    );
  }, [loaded, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const routeSource = map.getSource("tasco-route") as GeoJSONSource;
    routeSource.setData(routeCollection(routeCoordinates));
  }, [loaded, routeCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeStopIndex < 0 || activeStopIndex >= pois.length) return;
    const poi = pois[activeStopIndex];
    map.flyTo({
      center: [poi.coordinates.lon, poi.coordinates.lat],
      zoom: Math.max(map.getZoom(), 14.5),
      pitch: mode === "3d" ? 62 : 20,
      bearing: mode === "3d" ? -28 + activeStopIndex * 11 : 0,
      duration: 1050,
      essential: true
    });
  }, [activeStopIndex, mode, pois]);

  return (
    <div className="map-stage">
      <div ref={containerRef} className="map-canvas" aria-label="Bản đồ đề xuất TASCO" />
      {mapInitError ? (
        <div className="map-unavailable" role="status">
          <strong>Bản đồ 3D chưa sẵn sàng</strong>
          <span>Hành trình và xác nhận mô phỏng vẫn hoạt động. Có thể thử Trình diễn lại trên thiết bị hỗ trợ WebGL.</span>
        </div>
      ) : null}
      <div className="map-vignette" aria-hidden="true" />
      <div className="map-grid" aria-hidden="true" />
      {tileError ? (
        <div className="map-offline-note">
          Lớp nền đang ngoại tuyến — dữ liệu TASCO vẫn hoạt động.
        </div>
      ) : null}
      <div className="map-legend" aria-label="Chú giải bản đồ">
        <span><i className="legend-dot cafe" /> Cà phê</span>
        <span><i className="legend-dot food" /> Ăn uống</span>
        <span><i className="legend-dot explore" /> Khám phá</span>
        {mode === "3d" ? <strong>Chiều cao = độ phổ biến</strong> : null}
      </div>
    </div>
  );
}
