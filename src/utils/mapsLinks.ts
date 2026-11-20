import type { ItineraryStop, TravelMode } from '../types';

const TRAVEL_MODE_PARAM: Record<TravelMode, string> = {
  WALKING: 'walking',
  DRIVING: 'driving',
  TRANSIT: 'transit',
  BICYCLING: 'bicycling',
};

function formatStopDestinationLabel(stop: ItineraryStop, fallbackDestination?: string): string {
  if (stop.formattedAddress) {
    // Avoid duplicating the stop name if formattedAddress already starts with it
    if (stop.formattedAddress.toLowerCase().startsWith(stop.name.toLowerCase())) {
      return stop.formattedAddress;
    }
    return `${stop.name}, ${stop.formattedAddress}`;
  }
  if (stop.searchQuery && stop.searchQuery.trim()) {
    return stop.searchQuery.trim();
  }
  return fallbackDestination ? `${stop.name}, ${fallbackDestination}` : stop.name;
}

/**
 * Builds an official Google Maps Directions URL starting from the user's
 * current location (omitting `origin` defaults to "Your location" across
 * Google Maps Web, iOS, and Android) to a specific destination string.
 */
export function buildDestinationDirectionsUrl(
  destination: string,
  travelMode: TravelMode = 'DRIVING',
  originCoords?: { lat: number; lng: number } | null
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: destination.trim(),
    travelmode: TRAVEL_MODE_PARAM[travelMode] || 'driving',
  });
  if (originCoords) {
    params.set('origin', `${originCoords.lat},${originCoords.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Builds an official Google Maps Directions URL starting from the user's
 * current location directly to an itinerary stop.
 */
export function buildStopDirectionsUrl(
  stop: ItineraryStop,
  fallbackDestination?: string,
  travelMode: TravelMode = 'WALKING',
  originCoords?: { lat: number; lng: number } | null
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: formatStopDestinationLabel(stop, fallbackDestination),
    travelmode: TRAVEL_MODE_PARAM[travelMode] || 'walking',
  });
  if (stop.placeId) {
    params.set('destination_place_id', stop.placeId);
  }
  if (originCoords) {
    params.set('origin', `${originCoords.lat},${originCoords.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Builds a multi-stop Google Maps Directions URL starting from the user's
 * current location through all stops of a day in order.
 */
export function buildDayRouteDirectionsUrl(
  stops: ItineraryStop[],
  fallbackDestination?: string,
  travelMode: TravelMode = 'WALKING',
  originCoords?: { lat: number; lng: number } | null
): string | null {
  if (stops.length === 0) {
    return fallbackDestination
      ? buildDestinationDirectionsUrl(fallbackDestination, travelMode, originCoords)
      : null;
  }

  if (stops.length === 1) {
    return buildStopDirectionsUrl(stops[0], fallbackDestination, travelMode, originCoords);
  }

  const lastStop = stops[stops.length - 1];
  // Google Maps URLs supports up to 9 waypoints cleanly
  const intermediateStops = stops.slice(0, -1).slice(0, 9);

  const params = new URLSearchParams({
    api: '1',
    destination: formatStopDestinationLabel(lastStop, fallbackDestination),
    travelmode: TRAVEL_MODE_PARAM[travelMode] || 'walking',
  });

  if (lastStop.placeId) {
    params.set('destination_place_id', lastStop.placeId);
  }

  if (originCoords) {
    params.set('origin', `${originCoords.lat},${originCoords.lng}`);
  }

  if (intermediateStops.length > 0) {
    params.set(
      'waypoints',
      intermediateStops.map((s) => formatStopDestinationLabel(s, fallbackDestination)).join('|')
    );
    if (intermediateStops.every((s) => Boolean(s.placeId))) {
      params.set(
        'waypoint_place_ids',
        intermediateStops.map((s) => s.placeId!).join('|')
      );
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
