"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";

// Built by scripts/build-neighborhood-map.mjs: one shape per area. "walk" shapes
// show when rides are off, "ride" when on, "both" either way.
type AreaProps = { area: string; mode: "walk" | "ride" | "both" };
type AreaFeature = Feature<Geometry, AreaProps>;

const ACCENT = "#ff8a5b";
const OUTLINE = "#a59fb3";

function styleFor(area: string, selected: string, hovered: string | null): L.PathOptions {
  if (area === selected) return { color: ACCENT, weight: 2, opacity: 1, fillColor: ACCENT, fillOpacity: 0.45 };
  if (area === hovered) return { color: "#f3efe8", weight: 2, opacity: 1, fillColor: ACCENT, fillOpacity: 0.22 };
  return { color: OUTLINE, weight: 1, opacity: 0.6, fillColor: OUTLINE, fillOpacity: 0.06 };
}

/**
 * Leaflet measures its box once, when created. If that happens before the
 * page has laid out, it thinks it's 0 px wide and its pan/zoom animations
 * never finish (which blocked dragging and wheel zoom). Re-measure whenever
 * the box changes size, and report each time it goes from no size to a real
 * size, so the view can be fitted again.
 */
function KeepSizeInSync({ onShown }: { onShown: () => void }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let hadSize = false;
    const check = () => {
      // The observer can fire once more while the map is being torn down (leaving the page).
      if (!el.isConnected || !map.getPane("mapPane")) return;
      map.invalidateSize({ pan: false });
      const hasSize = el.clientWidth > 0 && el.clientHeight > 0;
      if (hasSize && !hadSize) onShown();
      hadSize = hasSize;
    };
    const observer = new ResizeObserver(check);
    observer.observe(el);
    check();
    return () => observer.disconnect();
  }, [map, onShown]);
  return null;
}

/**
 * Keeps the selected area in view (or all areas if none is selected). Jumps
 * into place when the map (re)appears; glides when the selection changes.
 */
function FollowSelection({ features, selected, shown }: { features: AreaFeature[]; selected: string; shown: number }) {
  const map = useMap();
  const lastShown = useRef(-1);
  useEffect(() => {
    if (!shown || map.getSize().x === 0) return; // never fit an invisible map
    const match = features.filter((f) => f.properties.area === selected);
    const target = match.length ? match : features;
    if (!target.length) return;
    const bounds = L.geoJSON({ type: "FeatureCollection", features: target } as FeatureCollection).getBounds();
    if (!bounds.isValid()) return;
    const options = { padding: [24, 24] as [number, number], maxZoom: match.length ? 14 : 12 };
    if (lastShown.current !== shown) map.fitBounds(bounds, options);
    else map.flyToBounds(bounds, { ...options, duration: 0.6 });
    lastShown.current = shown;
  }, [map, features, selected, shown]);
  return null;
}

/**
 * Decides per gesture instead of guessing the device (some browsers report no
 * mouse even when there is one): a mouse or trackpad always drags; on a
 * touchscreen one finger scrolls the page past the map, and two fingers
 * pinch to zoom and move it. The CSS on .area-map lets the browser handle
 * one-finger scrolling.
 */
function TouchFriendlyDragging() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const touches = new Set<number>();
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.add(e.pointerId);
      if (touches.size === 1) map.dragging.disable();
      else map.dragging.enable();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.delete(e.pointerId);
      if (touches.size === 0) map.dragging.enable();
    };
    // Capture phase, so this runs before Leaflet starts a drag.
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
    };
  }, [map]);
  return null;
}

/**
 * Shapes are for pointer and touch; keyboard users choose from the list
 * instead of tabbing through ~40 shapes first. Runs after every redraw.
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
 * selects that area; hovering a shape highlights its name in the list and
 * vice versa; selecting from the list pans to it.
 */
export default function AreaMap({
  selected,
  hovered,
  rides,
  onSelect,
  onHover,
  onEscape,
}: {
  selected: string;
  hovered: string | null;
  rides: boolean;
  onSelect: (area: string) => void;
  onHover: (area: string | null) => void;
  /** Escape hands focus back to the neighborhood list. */
  onEscape: () => void;
}) {
  const [data, setData] = useState<FeatureCollection<Geometry, AreaProps> | null>(null);
  const [failed, setFailed] = useState(false);
  const layerRef = useRef<L.GeoJSON | null>(null);
  // Bumped each time the map goes from no size to a real size, to re-fit the view.
  const [shown, setShown] = useState(0);
  const markShown = useCallback(() => setShown((n) => n + 1), []);
  // Latest values for Leaflet's event handlers, which are bound once per layer.
  const latest = useRef({ selected, hovered, onSelect, onHover });
  useEffect(() => {
    latest.current = { selected, hovered, onSelect, onHover };
  });

  useEffect(() => {
    fetch("/maps/neighborhoods.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  const features = useMemo(
    () => (data?.features ?? []).filter((f) => f.properties.mode === "both" || f.properties.mode === (rides ? "ride" : "walk")),
    [data, rides],
  );

  // Restyle in place when the selection or hover changes: instant, no redraw.
  useEffect(() => {
    layerRef.current?.eachLayer((layer) => {
      const area = ((layer as L.Path & { feature?: AreaFeature }).feature as AreaFeature | undefined)?.properties.area;
      if (!area) return;
      (layer as L.Path).setStyle(styleFor(area, selected, hovered));
      // Only the selection moves to the front. Moving the hovered shape re-inserts it
      // under the pointer, so it never gets "mouseout" and its label stays up.
      if (area === selected) (layer as L.Path).bringToFront();
      // At most one label at a time: the shape under the pointer (or the chip hovered).
      if (area !== hovered) layer.closeTooltip();
    });
  }, [selected, hovered, features]);

  if (failed) return null; // the list below still works
  if (!data) return <div className="skeleton h-full w-full" />;

  return (
    <div
      className="h-full w-full"
      onKeyDown={(e) => {
        if (e.key === "Escape") onEscape();
      }}
      // Leaving the map clears the highlight and label even if a shape missed its "mouseout".
      onMouseLeave={() => onHover(null)}
    >
      <MapContainer
        center={[40.74, -73.96]}
        zoom={12}
        // Mouse wheel and trackpad pinch (sent as ctrl+wheel) both zoom.
        scrollWheelZoom
        // Smaller, smoother steps so a trackpad pinch doesn't jump several levels.
        wheelPxPerZoomLevel={120}
        zoomSnap={0.25}
        keyboard={false}
        className="plan-map area-map h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Boundaries: NYC Open Data'
          maxZoom={19}
        />
        <GeoJSON
          // Only rebuilt when switching between walking pieces and whole neighborhoods.
          key={rides ? "ride" : "walk"}
          ref={layerRef}
          data={{ type: "FeatureCollection", features } as FeatureCollection}
          style={(f) => styleFor((f as AreaFeature).properties.area, latest.current.selected, latest.current.hovered)}
          onEachFeature={(feature: AreaFeature, layer) => {
            const { area } = feature.properties;
            layer.bindTooltip(area, { sticky: true, className: "area-tip" });
            layer.on({
              click: () => latest.current.onSelect(area),
              mouseover: () => latest.current.onHover(area),
              mouseout: () => latest.current.onHover(null),
            });
          }}
        />
        <KeepSizeInSync onShown={markShown} />
        <FollowSelection features={features} selected={selected} shown={shown} />
        <TouchFriendlyDragging />
        <KeepShapesOutOfTabOrder version={rides ? "ride" : "walk"} />
      </MapContainer>
    </div>
  );
}
