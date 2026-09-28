"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";

export type MapStop = { index: number; lat: number; lng: number; name: string; color: string };

function pinIcon(n: number, color: string, active: boolean) {
  return L.divIcon({
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `<div class="plan-pin${active ? " is-active" : ""}" style="--pin:${color}">${n}</div>`,
  });
}

function FitToStops({ stops }: { stops: MapStop[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length === 1) map.setView([stops[0].lat, stops[0].lng], 16);
    else map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng])), { padding: [40, 40], maxZoom: 16 });
  }, [map, stops]);
  return null;
}

export default function PlanMap({
  stops,
  active,
  onSelect,
}: {
  stops: MapStop[];
  active: number | null;
  onSelect: (index: number) => void;
}) {
  const route = useMemo(() => stops.map((s) => [s.lat, s.lng] as [number, number]), [stops]);

  return (
    <MapContainer
      center={route[0]}
      zoom={15}
      scrollWheelZoom={false}
      className="plan-map h-full w-full"
      attributionControl
    >
      {/* Free OpenStreetMap tiles, darkened with a CSS filter (.plan-map) to fit the app. */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {route.length > 1 && (
        <Polyline positions={route} pathOptions={{ color: "#ff8a5b", weight: 3, opacity: 0.8, dashArray: "6 8" }} />
      )}
      {stops.map((s) => (
        <Marker
          key={s.index}
          position={[s.lat, s.lng]}
          icon={pinIcon(s.index + 1, s.color, active === s.index)}
          title={s.name}
          zIndexOffset={active === s.index ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(s.index) }}
        />
      ))}
      <FitToStops stops={stops} />
    </MapContainer>
  );
}
