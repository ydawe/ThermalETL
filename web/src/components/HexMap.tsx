"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer, PolygonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { cellToBoundary, cellToParent, getResolution } from "h3-js";
import { BASEMAP_STYLE } from "@/lib/config";
import { countScale, viridis } from "@/lib/colors";
import { fmt } from "@/lib/analysis";
import { closeRing, rectPolygon, type LonLat } from "@/lib/geo";
import { aggregateHexesToRes, targetResForZoom } from "@/lib/h3Zoom";
import type { HexInfo } from "@/lib/types";

export type DrawMode = "none" | "rect" | "polygon";

function cellToParentSafe(h3: string, res: number): string {
  return cellToParent(h3, res);
}

const CLOSE_PX = 14;
/** Ignore a click that is the first half of a double-click finish. */
const DBLCLICK_GUARD_MS = 350;

interface HexDatum {
  h3: string;
  total: number;
  selected: boolean;
  active: boolean;
}

export interface HexMapProps {
  hexes: HexInfo[];
  totals: Map<string, number>;
  maxTotal: number;
  metricLabel: string;
  selected: Set<string> | null;
  selectionRing: LonLat[] | null;
  activeHex: string | null;
  bbox: [number, number, number, number];
  /** When set, map flies to this bbox (e.g. country picker). */
  focusBbox?: [number, number, number, number] | null;
  drawMode: DrawMode;
  onHexClick: (h3: string) => void;
  onDrawComplete: (ring: LonLat[]) => void;
  onDrawCancel: () => void;
}

export default function HexMap(props: HexMapProps) {
  const {
    hexes, totals, maxTotal, metricLabel, selected, selectionRing, activeHex, bbox, focusBbox,
    drawMode, onHexClick, onDrawComplete, onDrawCancel,
  } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [basemapWarning, setBasemapWarning] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; d: HexDatum } | null>(null);
  const [draft, setDraft] = useState<LonLat[]>([]);
  const [cursor, setCursor] = useState<LonLat | null>(null);
  const [zoom, setZoom] = useState(5);
  /** Synchronous draft for click handlers (React state alone races on rapid / test clicks). */
  const draftPoints = useRef<LonLat[]>([]);

  const commitDraft = (pts: LonLat[]) => {
    draftPoints.current = pts;
    setDraft(pts);
  };

  const drawRef = useRef({ drawMode, onDrawComplete, onHexClick });
  drawRef.current = { drawMode, onDrawComplete, onHexClick };
  /** Delayed vertex commit so a double-click can cancel the pending add and finish cleanly. */
  const pendingVertex = useRef<{ point: LonLat; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const extent: [number, number, number, number] = [...bbox];
    for (const h of hexes) {
      for (const [lat, lon] of cellToBoundary(h.h3)) {
        extent[0] = Math.min(extent[0], lon);
        extent[1] = Math.min(extent[1], lat);
        extent[2] = Math.max(extent[2], lon);
        extent[3] = Math.max(extent[3], lat);
      }
    }
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: BASEMAP_STYLE,
        bounds: [
          [extent[0], extent[1]],
          [extent[2], extent[3]],
        ],
        fitBoundsOptions: { padding: 40 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      setMapError("Your browser could not start the map (WebGL is unavailable or disabled).");
      return;
    }
    map.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();
    setZoom(map.getZoom());
    map.on("zoom", () => setZoom(map.getZoom()));
    map.on("error", (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? "");
      if (/style|tile|fetch|load/i.test(msg)) setBasemapWarning(true);
    });

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    mapRef.current = map;
    overlayRef.current = overlay;

    const clearPendingVertex = () => {
      if (pendingVertex.current) {
        clearTimeout(pendingVertex.current.timer);
        pendingVertex.current = null;
      }
    };

    const finishPolygon = (pts: LonLat[], done: (ring: LonLat[]) => void) => {
      clearPendingVertex();
      if (pts.length < 3) return;
      commitDraft([]);
      setCursor(null);
      done(closeRing(pts));
    };

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { drawMode: mode, onDrawComplete: done } = drawRef.current;
      const pts = draftPoints.current;
      const p: LonLat = [e.lngLat.lng, e.lngLat.lat];
      if (mode === "rect") {
        clearPendingVertex();
        if (pts.length === 0) commitDraft([p]);
        else {
          if (pts[0][0] === p[0] && pts[0][1] === p[1]) return;
          commitDraft([]);
          setCursor(null);
          done(rectPolygon(pts[0], p));
        }
      } else if (mode === "polygon") {
        if (pts.length >= 3) {
          const first = map.project(pts[0] as [number, number]);
          if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < CLOSE_PX) {
            finishPolygon(pts, done);
            return;
          }
          // Already have a closable ring: delay commit so dblclick can finish without an extra vertex.
          clearPendingVertex();
          pendingVertex.current = {
            point: p,
            timer: setTimeout(() => {
              pendingVertex.current = null;
              commitDraft([...draftPoints.current, p]);
            }, DBLCLICK_GUARD_MS),
          };
          return;
        }
        clearPendingVertex();
        commitDraft([...pts, p]);
      }
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (drawRef.current.drawMode !== "none") setCursor([e.lngLat.lng, e.lngLat.lat]);
    };
    const onDbl = (e: maplibregl.MapMouseEvent) => {
      const { drawMode: mode, onDrawComplete: done } = drawRef.current;
      if (mode !== "polygon") return;
      e.preventDefault();
      clearPendingVertex();
      finishPolygon(draftPoints.current, done);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawRef.current.drawMode !== "none") {
        clearPendingVertex();
      }
    };
    window.addEventListener("keydown", onKey);
    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("dblclick", onDbl);

    // Stable hooks for Playwright / manual QA (lon/lat, not fragile CSS pixels).
    type TestApi = {
      clickLngLat: (lng: number, lat: number) => void;
      dblClickLngLat: (lng: number, lat: number) => void;
      getDraftCount: () => number;
    };
    const testApi: TestApi = {
      clickLngLat(lng, lat) {
        const point = map.project([lng, lat]);
        onClick({
          lngLat: { lng, lat } as maplibregl.LngLat,
          point,
          originalEvent: new MouseEvent("click"),
        } as maplibregl.MapMouseEvent);
      },
      dblClickLngLat(lng, lat) {
        const point = map.project([lng, lat]);
        onDbl({
          lngLat: { lng, lat } as maplibregl.LngLat,
          point,
          originalEvent: new MouseEvent("dblclick"),
          preventDefault() {},
        } as maplibregl.MapMouseEvent);
      },
      getDraftCount() {
        return draftPoints.current.length;
      },
    };
    (window as unknown as { __thermaletlMap?: TestApi }).__thermaletlMap = testApi;

    return () => {
      clearPendingVertex();
      window.removeEventListener("keydown", onKey);
      delete (window as unknown as { __thermaletlMap?: TestApi }).__thermaletlMap;
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // Initial extent only; later region changes remount the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pendingVertex.current) {
      clearTimeout(pendingVertex.current.timer);
      pendingVertex.current = null;
    }
    commitDraft([]);
    setCursor(null);
    if (drawMode === "none") {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    } else {
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = "crosshair";
      // Focus wrapper so Esc / Enter work without an extra tab.
      containerRef.current?.parentElement?.focus({ preventScroll: true });
    }
  }, [drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusBbox) return;
    const [west, south, east, north] = focusBbox;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: 48, maxZoom: 9, duration: 700 },
    );
  }, [focusBbox]);

  const nativeRes = useMemo(() => (hexes[0] ? getResolution(hexes[0].h3) : 5), [hexes]);
  const viewRes = targetResForZoom(zoom, nativeRes);

  const data: HexDatum[] = useMemo(() => {
    const finest = hexes.map((h) => ({
      h3: h.h3,
      total: totals.get(h.h3) ?? 0,
      selected: selected ? selected.has(h.h3) : true,
      active: h.h3 === activeHex,
    }));
    return aggregateHexesToRes(finest, viewRes);
  }, [hexes, totals, selected, activeHex, viewRes]);

  const viewMax = useMemo(() => Math.max(1, ...data.map((d) => d.total)), [data]);

  const onHover = useCallback((info: PickingInfo<HexDatum>) => {
    setHover(info.object ? { x: info.x, y: info.y, d: info.object } : null);
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const scale = countScale(viewMax);
    const drawing = drawMode !== "none";
    const layers: unknown[] = [
      new H3HexagonLayer<HexDatum>({
        id: `hexes-r${viewRes}`,
        data,
        getHexagon: (d) => d.h3,
        extruded: false,
        stroked: true,
        filled: true,
        pickable: !drawing,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 110],
        lineWidthUnits: "pixels",
        getFillColor: (d) => {
          const c = viridis(scale(d.total));
          return [c[0], c[1], c[2], d.selected ? (d.total > 0 ? 205 : 90) : 55];
        },
        getLineColor: (d) => (d.active ? [184, 68, 27, 255] : d.selected ? [19, 38, 47, 230] : [19, 38, 47, 60]),
        getLineWidth: (d) => (d.active ? 3.5 : d.selected ? 1.5 : 0.75),
        transitions: { getFillColor: 450, getLineWidth: 200 },
        updateTriggers: {
          getFillColor: [viewMax, viewRes],
          getLineColor: [activeHex, viewRes],
          getLineWidth: [activeHex, viewRes],
          getHexagon: [viewRes],
        },
        onHover,
        onClick: (info) => {
          // Parent cells are display-only; detail panel needs a finest-res id under the click.
          if (!info.object || drawRef.current.drawMode !== "none") return;
          if (viewRes >= nativeRes) {
            drawRef.current.onHexClick(info.object.h3);
            return;
          }
          const child = hexes.find((h) => {
            try {
              return cellToParentSafe(h.h3, viewRes) === info.object!.h3;
            } catch {
              return false;
            }
          });
          if (child) drawRef.current.onHexClick(child.h3);
        },
      }),
    ];
    if (selectionRing) {
      layers.push(
        new PathLayer<{ path: LonLat[] }>({
          id: "selection",
          data: [{ path: selectionRing }],
          getPath: (d) => d.path,
          getColor: [184, 68, 27, 230],
          getWidth: 2.5,
          widthUnits: "pixels",
        }),
      );
    }
    if (drawing && draft.length) {
      const preview: LonLat[] =
        drawMode === "rect" && cursor
          ? rectPolygon(draft[0], cursor)
          : cursor
            ? [...draft, cursor]
            : draft;
      layers.push(
        new PolygonLayer<{ polygon: LonLat[] }>({
          id: "draft-fill",
          data: preview.length >= 3 ? [{ polygon: preview }] : [],
          getPolygon: (d) => d.polygon,
          getFillColor: [184, 68, 27, 40],
          stroked: false,
        }),
        new PathLayer<{ path: LonLat[] }>({
          id: "draft-line",
          data: [{ path: preview }],
          getPath: (d) => d.path,
          getColor: [184, 68, 27, 255],
          getWidth: 2,
          widthUnits: "pixels",
        }),
        new ScatterplotLayer<LonLat>({
          id: "draft-points",
          data: draft,
          getPosition: (d) => d,
          getRadius: 5,
          radiusUnits: "pixels",
          getFillColor: [255, 255, 255, 255],
          getLineColor: [184, 68, 27, 255],
          stroked: true,
          lineWidthUnits: "pixels",
          getLineWidth: 2,
        }),
      );
    }
    overlay.setProps({ layers: layers as never });
  }, [data, viewMax, viewRes, nativeRes, hexes, selectionRing, draft, cursor, drawMode, activeHex, onHover]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (drawMode === "none") return;
    if (e.key === "Escape") {
      if (pendingVertex.current) {
        clearTimeout(pendingVertex.current.timer);
        pendingVertex.current = null;
      }
      commitDraft([]);
      setCursor(null);
      onDrawCancel();
    } else if (e.key === "Enter" && drawMode === "polygon" && draftPoints.current.length >= 3) {
      if (pendingVertex.current) {
        clearTimeout(pendingVertex.current.timer);
        pendingVertex.current = null;
      }
      const pts = draftPoints.current;
      commitDraft([]);
      setCursor(null);
      onDrawComplete(closeRing(pts));
    } else if (e.key === "Backspace" && draftPoints.current.length) {
      e.preventDefault();
      commitDraft(draftPoints.current.slice(0, -1));
    }
  };

  if (mapError) {
    return (
      <div role="alert" className="flex h-full items-center justify-center bg-ash-100 p-6 text-center text-ink-soft">
        {mapError} The fire calendar on the right still works.
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full"
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid="hex-map"
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        data-testid="hex-map-canvas"
        aria-label={`Map of fire hotspot hexagons coloured by ${metricLabel} count. Use arrow keys to pan and plus or minus to zoom.`}
      />
      {drawMode !== "none" && (
        <div
          className="pointer-events-none absolute left-3 top-3 max-w-[18rem] animate-fade border border-ink/15 bg-white/95 px-3 py-2 text-sm text-ink"
          role="status"
          data-testid="draw-status"
        >
          {drawMode === "rect"
            ? draft.length === 0
              ? "Click the first corner of your rectangle."
              : "Click the opposite corner."
            : draft.length < 3
              ? "Click to add points (at least 3)."
              : "Double-click, press Enter, or click the first point to finish."}{" "}
          <span className="text-ink-mute">Esc cancels.</span>
        </div>
      )}
      {basemapWarning && (
        <div className="absolute bottom-8 left-3 border border-ember/30 bg-white/95 px-3 py-1.5 text-xs text-ink" role="status">
          Background map tiles could not load; hexagons are still shown.
        </div>
      )}
      <div
        className="pointer-events-none absolute bottom-8 right-3 border border-ink/10 bg-white/90 px-2.5 py-1.5 text-[11px] tabular-nums text-ink-soft"
        aria-live="polite"
      >
        H3 res {viewRes}
        {viewRes < nativeRes ? " (merged)" : " (finest published)"}
      </div>
      {hover && drawMode === "none" && (
        <div
          className="pointer-events-none absolute z-10 animate-fade border border-ink/15 bg-white px-3 py-2 text-sm text-ink shadow-md"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="font-semibold">{fmt(hover.d.total)} hotspots</div>
          <div className="text-xs text-ink-mute">
            {metricLabel}, selected months · click for details
          </div>
        </div>
      )}
    </div>
  );
}
