"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { areaForNta, ntasForArea } from "@/lib/neighborhoods";

type NtaProps = { nta: string };

const ACCENT = "#ff8a5b";
const OUTLINE = "#a59fb3";

/** Pans to the selected area whenever it changes. */
function FollowSelection({ data, selectedNtas }: { data: FeatureCollection<Geometry, NtaProps>; selectedNtas: string[] }) {
  const map = useMap();
  useEffect(() => {
    const features = selectedNtas.length
      ? data.features.filter((f) => selectedNtas.includes(f.properties.nta))
      : data.features;
    if (!features.length) return;
    const bounds = L.geoJSON({ type: "FeatureCollection", features } as FeatureCollection).getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [24, 24], maxZoom: selectedNtas.length ? 14 : 12, duration: 0.6 });
  }, [map, data, selectedNtas]);
  return null;
}

/**
 * Shapes are for pointer and touch; keyboard users choose from the list
 * instead of tabbing through ~50 shapes first. Runs after every redraw.
 */
function KeepShapesOutOfTabOrder({ version }: { version: string }) {
  const map = useMap();
  useEffect(() => {
    map
      .getPanes()
      .overlayPane.querySelectorAll("path, svg")
      .forEach((el) => {
        el.setAttribute("tabindex", "-1");
        el.setAttribute("focusable", "false");
      });
  }, [map, version]);
  return null;
}

/**
 * Optional tappable map of the neighborhoods in the list. Tapping a shape
 * selects that area; selecting from the list highlights and pans to it.
 */
export default function AreaMap({
  selected,
  rides,
  onSelect,
  onEscape,
}: {
  selected: string;
  rides: boolean;
  onSelect: (area: string) => void;
  /** Escape hands focus back to the neighborhood list. */
  onEscape: () => void;
}) {
  const [data, setData] = useState<FeatureCollection<Geometry, NtaProps> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/maps/neighborhoods.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const selectedNtas = useMemo(() => ntasForArea(selected), [selected]);
  // Phones: one finger scrolls the page; pinch or the +/- buttons zoom.
  const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  if (failed) return null; // the list below still works
  if (!data) return <div className="skeleton h-full w-full" />;

  const style = (f?: Feature<Geometry, NtaProps>): L.PathOptions => {
    const isSelected = !!f && selectedNtas.includes(f.properties.nta);
    return isSelected
      ? { color: ACCENT, weight: 2, fillColor: ACCENT, fillOpacity: 0.45 }
      : { color: OUTLINE, weight: 1, opacity: 0.6, fillColor: OUTLINE, fillOpacity: 0.06 };
  };

  return (
    <div
      className="h-full w-full"
      onKeyDown={(e) => {
        if (e.key === "Escape") onEscape();
      }}
    >
      <MapContainer
        center={[40.74, -73.96]}
        zoom={12}
        scrollWheelZoom={false}
        dragging={!touch}
        keyboard={false}
        className="plan-map h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Boundaries: NYC Open Data'
          maxZoom={19}
        />
        <GeoJSON
          // Re-create the layer when the selection or mode changes so styles and tooltips refresh.
          key={`${rides}-${selected}`}
          data={data}
          style={style}
          onEachFeature={(feature: Feature<Geometry, NtaProps>, layer) => {
            const area = areaForNta(feature.properties.nta, rides);
            if (!area) return;
            layer.bindTooltip(area, { sticky: true, className: "area-tip" });
            layer.on({
              click: () => onSelect(area),
              mouseover: (e) => {
                if (!selectedNtas.includes(feature.properties.nta)) {
                  (e.target as L.Path).setStyle({ fillOpacity: 0.2, opacity: 1, color: "#f3efe8" });
                }
              },
              mouseout: (e) => {
                (e.target as L.Path).setStyle(style(feature));
              },
            });
          }}
        />
        <FollowSelection data={data} selectedNtas={selectedNtas} />
        <KeepShapesOutOfTabOrder version={`${rides}-${selected}`} />
      </MapContainer>
    </div>
  );
}
