import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  Loader2,
  Navigation,
  Route as RouteIcon,
  LocateFixed,
  AlertCircle,
} from 'lucide-react';
import type { ActiveRouteSummary, ItineraryStop, RouteLegSummary, TravelMode } from '../types';
import { buildDayRouteDirectionsUrl, buildStopDirectionsUrl } from '../utils/mapsLinks';

interface ItineraryMapProps {
  destination?: string;
  stops: ItineraryStop[];
  travelMode: TravelMode;
  selectedStopId: string | null;
  onSelectStop: (stopId: string | null) => void;
  onResolveStops: (updates: Record<string, Partial<ItineraryStop>>) => void;
  onRouteComputed?: (summary: ActiveRouteSummary | null) => void;
}

const DEFAULT_CENTER = { lat: 35.0116, lng: 135.7681 };

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sin2 * sin2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDuration(millis: number): string {
  const totalMins = Math.max(1, Math.round(millis / 60000));
  if (totalMins < 60) return `${totalMins} min`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function ItineraryMap({
  destination,
  stops,
  travelMode,
  selectedStopId,
  onSelectStop,
  onResolveStops,
  onRouteComputed,
}: ItineraryMapProps) {
  const [livePosition, setLivePosition] = useState<{ lat: number; lng: number } | null>(null);
  const [trackingGps, setTrackingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [routeSummary, setRouteSummary] = useState<ActiveRouteSummary | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [resolvingPlaces, setResolvingPlaces] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const toggleLiveNavigation = () => {
    if (trackingGps) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setTrackingGps(false);
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported in this browser.');
      return;
    }

    setGpsError(null);
    setTrackingGps(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLivePosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsError(null);
      },
      (err) => {
        setGpsError(err.message || 'Location permission was declined.');
        setTrackingGps(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const mappedStops = useMemo(
    () => stops.filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number'),
    [stops]
  );

  const activeStop = useMemo(
    () => mappedStops.find((s) => s.id === selectedStopId) ?? null,
    [mappedStops, selectedStopId]
  );

  const nextStopForGps = useMemo(() => {
    if (!livePosition || mappedStops.length === 0) return null;
    const target = activeStop || mappedStops[0];
    if (typeof target.lat !== 'number' || typeof target.lng !== 'number') return null;
    const dist = haversineMeters(livePosition, { lat: target.lat, lng: target.lng });
    return { stop: target, distanceMeters: dist };
  }, [livePosition, mappedStops, activeStop]);

  const googleMapsDirectionsUrl = useMemo(() => {
    const activeStops = mappedStops.length > 0 ? mappedStops : stops;
    return buildDayRouteDirectionsUrl(activeStops, destination, travelMode, livePosition);
  }, [mappedStops, stops, destination, livePosition, travelMode]);

  return (
    <div className="flex flex-col h-full liquid-glass rounded-[28px] overflow-hidden">
      {/* Top Map Control Bar */}
      <div className="px-5 py-3.5 border-b border-white/60 flex items-center justify-between gap-3 bg-white/40 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Compass className="w-4 h-4 text-[#007AFF] shrink-0" />
            <span className="truncate">Live Route Map</span>
          </div>
          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5 truncate">
            {resolvingPlaces ? (
              <span>Resolving landmarks via Google Places...</span>
            ) : routeLoading ? (
              <span>Computing route...</span>
            ) : routeSummary ? (
              <span>
                {formatDistance(routeSummary.totalDistanceMeters)} · {formatDuration(routeSummary.totalDurationMillis)} · {travelMode.toLowerCase()}
              </span>
            ) : mappedStops.length > 0 ? (
              <span>{mappedStops.length} mapped stop{mappedStops.length === 1 ? '' : 's'}</span>
            ) : (
              <span>Generate or add places to map your route</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleLiveNavigation}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              trackingGps
                ? 'bg-[#16A34A] text-white border border-white/30 shadow-md shadow-emerald-600/30 hover:bg-green-700'
                : 'liquid-btn-glass'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5" />
            {trackingGps ? 'GPS Active' : 'Live GPS'}
          </button>

          {googleMapsDirectionsUrl && (
            <a
              href={googleMapsDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="liquid-btn-primary inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
            >
              <Navigation className="w-3.5 h-3.5" />
              Navigate
              <ExternalLink className="w-3 h-3 opacity-85" />
            </a>
          )}
        </div>
      </div>

      {/* Live GPS Guidance Strip */}
      {(gpsError || nextStopForGps) && (
        <div className="px-5 py-2.5 bg-white/50 backdrop-blur-md border-b border-white/60 text-xs flex items-center justify-between gap-3">
          {gpsError ? (
            <span className="text-[#DC2626] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {gpsError}
            </span>
          ) : nextStopForGps ? (
            <span className="text-slate-700 font-mono tabular-nums truncate">
              Live distance to <strong className="font-sans font-semibold text-slate-900">{nextStopForGps.stop.name}</strong>:{' '}
              {formatDistance(nextStopForGps.distanceMeters)}
            </span>
          ) : null}
        </div>
      )}

      {/* Map Viewport (explicit height prevents CF2 collapse) */}
      <div className="relative w-full h-[380px] lg:h-[430px] shrink-0 bg-sky-100/60">
        <GoogleMap
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={12}
          mapId="DEMO_MAP_ID"
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={true}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <MapOrchestrator
            stops={stops}
            mappedStops={mappedStops}
            travelMode={travelMode}
            selectedStopId={selectedStopId}
            livePosition={livePosition}
            onResolveStops={onResolveStops}
            onResolvingChange={setResolvingPlaces}
            onRouteLoadingChange={setRouteLoading}
            onRouteErrorChange={setRouteError}
            onRouteSummaryChange={(summary) => {
              setRouteSummary(summary);
              onRouteComputed?.(summary);
            }}
          />

          {mappedStops.map((stop, idx) => {
            const isSelected = stop.id === selectedStopId;
            return (
              <AdvancedMarker
                key={stop.id}
                position={{ lat: stop.lat!, lng: stop.lng! }}
                onClick={() => onSelectStop(stop.id)}
                zIndex={isSelected ? 30 : 10 + idx}
              >
                <Pin
                  background={isSelected ? '#0F172A' : '#007AFF'}
                  borderColor="#FFFFFF"
                  glyphColor="#FFFFFF"
                  glyphText={String(idx + 1)}
                  scale={isSelected ? 1.18 : 1}
                />
              </AdvancedMarker>
            );
          })}

          {livePosition && (
            <AdvancedMarker position={livePosition} zIndex={50} title="Your live GPS position">
              <div className="w-4 h-4 rounded-full bg-[#16A34A] border-2 border-white shadow-md" />
            </AdvancedMarker>
          )}

          {activeStop && typeof activeStop.lat === 'number' && typeof activeStop.lng === 'number' && (
            <InfoWindow
              position={{ lat: activeStop.lat, lng: activeStop.lng }}
              onCloseClick={() => onSelectStop(null)}
              pixelOffset={[0, -34]}
            >
              <div className="max-w-[230px] p-1 text-slate-900">
                <div className="text-sm font-semibold leading-snug">{activeStop.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {activeStop.timeSlot} · {activeStop.durationMinutes} min
                  {typeof activeStop.rating === 'number' ? ` · ★ ${activeStop.rating.toFixed(1)}` : ''}
                </div>
                {activeStop.formattedAddress && (
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {activeStop.formattedAddress}
                  </p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <a
                    href={buildStopDirectionsUrl(activeStop, destination, travelMode, livePosition)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0071E3] hover:underline"
                  >
                    <Navigation className="w-3 h-3" />
                    Directions from here
                  </a>
                  {activeStop.googleMapsURI && (
                    <a
                      href={activeStop.googleMapsURI}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                    >
                      Place Info
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>

        {(resolvingPlaces || routeLoading) && (
          <div className="absolute bottom-3.5 left-3.5 liquid-glass-popover rounded-full px-3.5 py-2 text-xs font-medium text-slate-800 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-[#007AFF] animate-spin" />
            {resolvingPlaces ? 'Verifying stops on Google Maps...' : 'Calculating optimal route...'}
          </div>
        )}
      </div>

      {/* Turn-by-Turn & Leg Breakdown Panel */}
      <div className="flex-1 overflow-y-auto p-5 bg-white/30 backdrop-blur-xl border-t border-white/60">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
            <RouteIcon className="w-3.5 h-3.5 text-[#007AFF]" />
            Leg-by-Leg Navigation
          </h3>
          {routeSummary && (
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {routeSummary.legs.length} leg{routeSummary.legs.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {routeError && (
          <div className="p-3 bg-amber-50/85 backdrop-blur-md border border-amber-200/80 rounded-2xl text-xs text-amber-950 mb-3">
            {routeError}
          </div>
        )}

        {routeSummary && routeSummary.legs.length > 0 ? (
          <div className="space-y-2.5">
            {routeSummary.legs.map((leg, i) => (
              <div key={i} className="liquid-glass-subtle rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="font-semibold text-slate-900 truncate">
                    {i + 1}. {leg.fromName} → {leg.toName}
                  </div>
                  <div className="font-mono tabular-nums text-[#007AFF] font-medium shrink-0">
                    {formatDistance(leg.distanceMeters)} · {formatDuration(leg.durationMillis)}
                  </div>
                </div>
                {leg.steps.length > 0 && (
                  <ol className="mt-2 pt-2 border-t border-slate-900/8 space-y-1 text-xs text-slate-600">
                    {leg.steps.slice(0, 4).map((step, sIdx) => (
                      <li key={sIdx} className="flex items-start justify-between gap-2">
                        <span className="leading-snug">{step.instruction}</span>
                        {step.distanceText && (
                          <span className="font-mono tabular-nums text-slate-400 shrink-0">
                            {step.distanceText}
                          </span>
                        )}
                      </li>
                    ))}
                    {leg.steps.length > 4 && (
                      <li className="text-[11px] text-slate-400">
                        + {leg.steps.length - 4} more step{leg.steps.length - 4 === 1 ? '' : 's'} in Google Maps navigation
                      </li>
                    )}
                  </ol>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">
            {mappedStops.length < 2
              ? 'Add at least two landmarks on the selected day to compute live turn-by-turn routes.'
              : 'Select a travel mode above to view step-by-step routing between your itinerary landmarks.'}
          </p>
        )}
      </div>
    </div>
  );
}

interface MapOrchestratorProps {
  stops: ItineraryStop[];
  mappedStops: ItineraryStop[];
  travelMode: TravelMode;
  selectedStopId: string | null;
  livePosition: { lat: number; lng: number } | null;
  onResolveStops: (updates: Record<string, Partial<ItineraryStop>>) => void;
  onResolvingChange: (loading: boolean) => void;
  onRouteLoadingChange: (loading: boolean) => void;
  onRouteErrorChange: (err: string | null) => void;
  onRouteSummaryChange: (summary: ActiveRouteSummary | null) => void;
}

function MapOrchestrator({
  stops,
  mappedStops,
  travelMode,
  selectedStopId,
  livePosition,
  onResolveStops,
  onResolvingChange,
  onRouteLoadingChange,
  onRouteErrorChange,
  onRouteSummaryChange,
}: MapOrchestratorProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const attemptedResolveRef = useRef<Record<string, boolean>>({});
  const placeQueryCacheRef = useRef<Record<string, Partial<ItineraryStop>>>({});
  const routeCacheRef = useRef<Record<string, { primaryRoute: any; summary: ActiveRouteSummary }>>({});

  // 1. Resolve unresolved stops via Places API (New) Place.searchByText
  useEffect(() => {
    if (!placesLib || stops.length === 0) return;

    const unresolved = stops.filter(
      (s) =>
        (typeof s.lat !== 'number' || typeof s.lng !== 'number') &&
        !attemptedResolveRef.current[s.id] &&
        (s.searchQuery || s.name)
    );

    if (unresolved.length === 0) return;

    let cancelled = false;
    onResolvingChange(true);

    (async () => {
      const updates: Record<string, Partial<ItineraryStop>> = {};
      for (const stop of unresolved) {
        if (cancelled) break;
        attemptedResolveRef.current[stop.id] = true;
        const queryKey = (stop.searchQuery || stop.name).trim().toLowerCase();
        if (placeQueryCacheRef.current[queryKey]) {
          updates[stop.id] = placeQueryCacheRef.current[queryKey];
          continue;
        }
        try {
          const { places } = await placesLib.Place.searchByText({
            textQuery: stop.searchQuery || stop.name,
            fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'googleMapsURI'],
            maxResultCount: 1,
          });
          const best = places?.[0];
          if (best?.location) {
            const resolved: Partial<ItineraryStop> = {
              placeId: best.id,
              formattedAddress: best.formattedAddress || stop.formattedAddress || '',
              lat: best.location.lat(),
              lng: best.location.lng(),
              rating: typeof best.rating === 'number' ? best.rating : undefined,
              googleMapsURI: best.googleMapsURI || undefined,
            };
            placeQueryCacheRef.current[queryKey] = resolved;
            updates[stop.id] = resolved;
          }
        } catch (err: any) {
          const msg = String(err?.message || err || '');
          if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            break;
          }
        }
      }

      if (!cancelled) {
        onResolvingChange(false);
        if (Object.keys(updates).length > 0) {
          onResolveStops(updates);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [placesLib, stops, onResolveStops, onResolvingChange]);

  // 2. Focus map on selected stop
  useEffect(() => {
    if (!map || !selectedStopId) return;
    const stop = mappedStops.find((s) => s.id === selectedStopId);
    if (stop && typeof stop.lat === 'number' && typeof stop.lng === 'number') {
      map.panTo({ lat: stop.lat, lng: stop.lng });
      if ((map.getZoom() ?? 12) < 14) map.setZoom(14);
    }
  }, [map, selectedStopId, mappedStops]);

  // 3. Compute modern Routes API polyline & leg breakdown via Route.computeRoutes (with session cache)
  const routeKey = useMemo(
    () =>
      `${travelMode}|${mappedStops.map((s) => `${s.id}:${s.lat?.toFixed(5)},${s.lng?.toFixed(5)}`).join(';')}`,
    [travelMode, mappedStops]
  );

  useEffect(() => {
    if (!map) return;

    // Clean up existing polylines
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (mappedStops.length === 1) {
      map.setCenter({ lat: mappedStops[0].lat!, lng: mappedStops[0].lng! });
      map.setZoom(14);
      onRouteSummaryChange(null);
      onRouteErrorChange(null);
      return;
    }

    if (!routesLib || mappedStops.length < 2) {
      onRouteSummaryChange(null);
      onRouteErrorChange(null);
      return;
    }

    // Reuse in-session computed route when switching between days without re-hitting Routes API
    const cached = routeCacheRef.current[routeKey];
    if (cached) {
      onRouteErrorChange(null);
      onRouteLoadingChange(false);
      if (typeof cached.primaryRoute.createPolylines === 'function') {
        const newPolylines: google.maps.Polyline[] = cached.primaryRoute.createPolylines();
        newPolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: '#007AFF',
            strokeOpacity: 0.9,
            strokeWeight: 5,
          });
          polyline.setMap(map);
        });
        polylinesRef.current = newPolylines;
      }
      if (cached.primaryRoute.viewport) {
        map.fitBounds(cached.primaryRoute.viewport, 48);
      }
      onRouteSummaryChange(cached.summary);
      return () => {
        polylinesRef.current.forEach((p) => p.setMap(null));
        polylinesRef.current = [];
      };
    }

    let cancelled = false;
    onRouteLoadingChange(true);
    onRouteErrorChange(null);

    const origin = { lat: mappedStops[0].lat!, lng: mappedStops[0].lng! };
    const destination = {
      lat: mappedStops[mappedStops.length - 1].lat!,
      lng: mappedStops[mappedStops.length - 1].lng!,
    };

    const intermediates =
      travelMode === 'TRANSIT'
        ? []
        : mappedStops.slice(1, -1).map((s) => ({
            location: { lat: s.lat!, lng: s.lng! },
          }));

    const request: Record<string, unknown> = {
      origin,
      destination,
      travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };
    if (intermediates.length > 0) {
      request.intermediates = intermediates;
    }

    (routesLib.Route as any)
      .computeRoutes(request)
      .then(({ routes }: { routes: any[] }) => {
        if (cancelled) return;
        onRouteLoadingChange(false);

        if (!routes || routes.length === 0) {
          onRouteSummaryChange(null);
          onRouteErrorChange(`No ${travelMode.toLowerCase()} route found between these landmarks. Try switching travel mode.`);
          const bounds = new google.maps.LatLngBounds();
          mappedStops.forEach((s) => bounds.extend({ lat: s.lat!, lng: s.lng! }));
          map.fitBounds(bounds, 56);
          return;
        }

        const primaryRoute = routes[0];
        if (typeof primaryRoute.createPolylines === 'function') {
          const newPolylines: google.maps.Polyline[] = primaryRoute.createPolylines();
          newPolylines.forEach((polyline) => {
            polyline.setOptions({
              strokeColor: '#007AFF',
              strokeOpacity: 0.9,
              strokeWeight: 5,
            });
            polyline.setMap(map);
          });
          polylinesRef.current = newPolylines;
        }

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport, 48);
        } else {
          const bounds = new google.maps.LatLngBounds();
          mappedStops.forEach((s) => bounds.extend({ lat: s.lat!, lng: s.lng! }));
          map.fitBounds(bounds, 56);
        }

        const rawLegs: any[] = Array.isArray(primaryRoute.legs) ? primaryRoute.legs : [];
        const legs: RouteLegSummary[] = rawLegs.map((leg, i) => {
          const fromName = mappedStops[i]?.name || `Stop ${i + 1}`;
          const toName =
            travelMode === 'TRANSIT'
              ? mappedStops[mappedStops.length - 1]?.name || 'Destination'
              : mappedStops[i + 1]?.name || `Stop ${i + 2}`;

          const rawSteps: any[] = Array.isArray(leg.steps) ? leg.steps : [];
          const steps = rawSteps
            .map((step) => ({
              instruction: String(step?.instructions || step?.navigationInstruction?.instructions || '').trim(),
              distanceText:
                typeof step?.distanceMeters === 'number' ? formatDistance(step.distanceMeters) : '',
            }))
            .filter((st) => st.instruction.length > 0);

          return {
            fromName,
            toName,
            distanceMeters: Number(leg.distanceMeters) || 0,
            durationMillis: Number(leg.durationMillis) || 0,
            steps,
          };
        });

        const summary: ActiveRouteSummary = {
          totalDistanceMeters: Number(primaryRoute.distanceMeters) || legs.reduce((a, l) => a + l.distanceMeters, 0),
          totalDurationMillis: Number(primaryRoute.durationMillis) || legs.reduce((a, l) => a + l.durationMillis, 0),
          legs,
        };
        routeCacheRef.current[routeKey] = { primaryRoute, summary };
        onRouteSummaryChange(summary);
      })
      .catch((err: any) => {
        if (cancelled) return;
        onRouteLoadingChange(false);
        const msg = String(err?.message || err || '');
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onRouteErrorChange(
          travelMode === 'TRANSIT'
            ? 'Transit routing is unavailable for this segment. Switch to Walking or Driving.'
            : 'Unable to calculate route between these stops. Try adjusting stop order or travel mode.'
        );
        const bounds = new google.maps.LatLngBounds();
        mappedStops.forEach((s) => bounds.extend({ lat: s.lat!, lng: s.lng! }));
        map.fitBounds(bounds, 56);
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, routeKey]);

  return null;
}
