"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { PathLayer, ScatterplotLayer, PolygonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { cellToBoundary } from "h3-js";
import { BASEMAP_STYLE } from "@/lib/config";
import { countScale, viridis } from "@/lib/colors";
import { fmt } from "@/lib/analysis";
import { rectPolygon, type LonLat } from "@/lib/geo";
import type { HexInfo } from "@/lib/types";

export type DrawMode = "none" | "rect" | "polygon";

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
  drawMode: DrawMode;
  onHexClick: (h3: string) => void;
  onDrawComplete: (ring: LonLat[]) => void;
  onDrawCancel: () => void;
}

export default function HexMap(props: HexMapProps) {
  const {
    hexes, totals, maxTotal, metricLabel, selected, selectionRing, activeHex, bbox,
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

  const drawRef = useRef({ drawMode, draft, onDrawComplete, onHexClick });
  drawRef.current = { drawMode, draft, onDrawComplete, onHexClick };

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
    map.on("error", (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? "");
      if (/style|tile|fetch|load/i.test(msg)) setBasemapWarning(true);
    });

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    mapRef.current = map;
    overlayRef.current = overlay;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { drawMode: mode, draft: pts, onDrawComplete: done } = drawRef.current;
      const p: LonLat = [e.lngLat.lng, e.lngLat.lat];
      if (mode === "rect") {
        if (pts.length === 0) setDraft([p]);
        else {
          setDraft([]);
          done(rectPolygon(pts[0], p));
        }
      } else if (mode === "polygon") {
        if (pts.length >= 3) {
          const first = map.project(pts[0] as [number, number]);
          if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < 12) {
            setDraft([]);
            done([...pts, pts[0]]);
            return;
          }
        }
        setDraft([...pts, p]);
      }
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (drawRef.current.drawMode !== "none") setCursor([e.lngLat.lng, e.lngLat.lat]);
    };
    const onDbl = (e: maplibregl.MapMouseEvent) => {
      const { drawMode: mode, draft: pts, onDrawComplete: done } = drawRef.current;
      if (mode === "polygon" && pts.length >= 3) {
        e.preventDefault();
        setDraft([]);
        done([...pts, pts[0]]);
      }
    };
    map.on("click", onClick);
    map.on("mousemove", onMove);
    map.on("dblclick", onDbl);

    return () => {
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
    setDraft([]);
    setCursor(null);
    if (drawMode === "none") {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    } else {
      map.doubleClickZoom.disable();
      map.getCanvas().style.cursor = "crosshair";
    }
  }, [drawMode]);

  const data: HexDatum[] = useMemo(
    () =>
      hexes.map((h) => ({
        h3: h.h3,
        total: totals.get(h.h3) ?? 0,
        selected: selected ? selected.has(h.h3) : true,
        active: h.h3 === activeHex,
      })),
    [hexes, totals, selected, activeHex],
  );

  const onHover = useCallback((info: PickingInfo<HexDatum>) => {
    setHover(info.object ? { x: info.x, y: info.y, d: info.object } : null);
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const scale = countScale(maxTotal);
    const drawing = drawMode !== "none";
    const layers: unknown[] = [
      new H3HexagonLayer<HexDatum>({
        id: "hexes",
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
        updateTriggers: { getFillColor: [maxTotal], getLineColor: [activeHex], getLineWidth: [activeHex] },
        onHover,
        onClick: (info) => {
          if (info.object && drawRef.current.drawMode === "none") drawRef.current.onHexClick(info.object.h3);
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
  }, [data, maxTotal, selectionRing, draft, cursor, drawMode, activeHex, onHover]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (drawMode === "none") return;
    if (e.key === "Escape") {
      setDraft([]);
      onDrawCancel();
    } else if (e.key === "Enter" && drawMode === "polygon" && draft.length >= 3) {
      onDrawComplete([...draft, draft[0]]);
      setDraft([]);
    } else if (e.key === "Backspace" && draft.length) {
      setDraft(draft.slice(0, -1));
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
    <div className="relative h-full w-full" onKeyDown={onKeyDown}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label={`Map of fire hotspot hexagons coloured by ${metricLabel} count. Use arrow keys to pan and plus or minus to zoom.`}
      />
      {drawMode !== "none" && (
        <div
          className="pointer-events-none absolute left-3 top-3 max-w-[18rem] animate-fade border border-ink/15 bg-white/95 px-3 py-2 text-sm text-ink"
          role="status"
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
