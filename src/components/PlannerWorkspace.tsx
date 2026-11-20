import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BookOpen,
  Check,
  Cloud,
  Download,
  Edit3,
  ExternalLink,
  FolderOpen,
  Globe,
  Headphones,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Search,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  ActiveRouteSummary,
  Itinerary,
  ItineraryDay,
  ItineraryStop,
  LandmarkResearchResult,
  TravelMode,
  TravelPace,
} from '../types';
import { ItineraryMap } from './ItineraryMap';
import { PlaceAutocompleteInput, type ResolvedPlaceSelection } from './PlaceAutocompleteInput';
import { exportItineraryToDocx } from '../utils/docxExport';
import {
  buildDayRouteDirectionsUrl,
  buildDestinationDirectionsUrl,
  buildStopDirectionsUrl,
} from '../utils/mapsLinks';

const HERO_IMAGE = '/src/assets/images/hero_editorial_atlas_1795096381842.jpg';

const SAMPLE_TRIPS = [
  {
    label: 'Kyoto Temples & Tea Lanes',
    destination: 'Kyoto, Japan',
    daysCount: 3,
    places: ['Fushimi Inari Taisha', 'Kiyomizu-dera', 'Arashiyama Bamboo Grove', 'Kinkaku-ji'],
    interests: 'Historic shrines, quiet morning walks, architecture, traditional matcha houses',
  },
  {
    label: 'Lisbon Hills & Azulejos',
    destination: 'Lisbon, Portugal',
    daysCount: 2,
    places: ['Alfama District', 'Belém Tower', 'Jerónimos Monastery', 'LX Factory'],
    interests: 'Tram routes, scenic miradouros, tile architecture, coastal bakeries',
  },
  {
    label: 'Rome Classical Walk',
    destination: 'Rome, Italy',
    daysCount: 3,
    places: ['Colosseum', 'Pantheon', 'Borghese Gallery', 'Trastevere'],
    interests: 'Ancient ruins, Renaissance art, golden-hour piazzas, local trattorias',
  },
];

interface PlannerWorkspaceProps {
  user: User | null;
  itinerary: Itinerary | null;
  savedItineraries: Itinerary[];
  onItineraryChange: (next: Itinerary | null) => void;
  onSaveItinerary: (itin: Itinerary) => Promise<void>;
  onDeleteSavedItinerary: (id: string) => Promise<void>;
  onSignIn: () => Promise<void>;
  onPlayAudioGuide: (opts: {
    mode: 'guide' | 'podcast';
    title: string;
    script: string;
    stops?: ItineraryStop[];
    voiceName?: string;
  }) => Promise<void>;
  seedDraft: { destination: string; places: string[]; title?: string } | null;
  onClearSeedDraft: () => void;
  mapsStatus: 'loading' | 'loaded' | 'error';
  onRetryMaps: () => void;
}

export function PlannerWorkspace({
  user,
  itinerary,
  savedItineraries,
  onItineraryChange,
  onSaveItinerary,
  onDeleteSavedItinerary,
  onSignIn,
  onPlayAudioGuide,
  seedDraft,
  onClearSeedDraft,
  mapsStatus,
  onRetryMaps,
}: PlannerWorkspaceProps) {
  const [startingPoint, setStartingPoint] = useState('');
  const [destination, setDestination] = useState(seedDraft?.destination || '');
  const [placeDraft, setPlaceDraft] = useState('');
  const [placesList, setPlacesList] = useState<string[]>(seedDraft?.places || []);
  const [daysCount, setDaysCount] = useState(3);
  const [isCustomDays, setIsCustomDays] = useState(false);
  const [customDaysInput, setCustomDaysInput] = useState('10');
  const [pace, setPace] = useState<TravelPace>('balanced');
  const [travelMode, setTravelMode] = useState<TravelMode>('WALKING');
  const [interests, setInterests] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);
  const [routeSummary, setRouteSummary] = useState<ActiveRouteSummary | null>(null);

  const [researchMap, setResearchMap] = useState<Record<string, LandmarkResearchResult>>({});
  const [researchLoadingId, setResearchLoadingId] = useState<string | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Sync seedDraft when arriving from Collaborative Lists
  React.useEffect(() => {
    if (seedDraft) {
      setDestination(seedDraft.destination);
      setPlacesList(seedDraft.places);
      onItineraryChange(null);
      onClearSeedDraft();
    }
  }, [seedDraft, onItineraryChange, onClearSeedDraft]);

  const currentDay: ItineraryDay | null = useMemo(() => {
    if (!itinerary || itinerary.days.length === 0) return null;
    const safeIdx = Math.min(activeDayIndex, itinerary.days.length - 1);
    return itinerary.days[safeIdx];
  }, [itinerary, activeDayIndex]);

  const handleGenerate = async (override?: {
    destination: string;
    startingPoint?: string;
    places: string[];
    daysCount: number;
    interests: string;
  }) => {
    const dest = (override?.destination ?? destination).trim();
    const origin = (override?.startingPoint ?? startingPoint).trim();
    const pendingDraft = !override ? placeDraft.trim() : '';
    const basePlaces = override?.places ?? placesList;
    const targetPlaces =
      pendingDraft && !basePlaces.includes(pendingDraft)
        ? [...basePlaces, pendingDraft]
        : basePlaces;

    if (pendingDraft && !override) {
      if (!placesList.includes(pendingDraft)) {
        setPlacesList((prev) => [...prev, pendingDraft]);
      }
      setPlaceDraft('');
    }

    const parsedCustom = isCustomDays ? parseInt(customDaysInput, 10) : daysCount;
    const resolvedDays = Math.max(1, Math.min(30, Number.isFinite(parsedCustom) ? parsedCustom : daysCount));
    const targetDays = override?.daysCount ?? resolvedDays;
    const targetInterests = override?.interests ?? interests;

    if (!override && isCustomDays) {
      setDaysCount(resolvedDays);
      setCustomDaysInput(String(resolvedDays));
    }

    if (!dest) {
      setGenError('Enter where you are going (your destination city or region) to generate an itinerary.');
      return;
    }

    setGenerating(true);
    setGenError(null);
    setResearchMap({});
    setSelectedStopId(null);
    setEditingStopId(null);

    try {
      const res = await fetch('/api/itinerary/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dest,
          startingPoint: origin,
          places: targetPlaces,
          daysCount: targetDays,
          pace,
          travelMode,
          interests: targetInterests,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not generate itinerary.');
      }
      setActiveDayIndex(0);
      onItineraryChange(data as Itinerary);
    } catch (err: any) {
      setGenError(err?.message || 'Failed to generate itinerary. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleResolveStops = React.useCallback(
    (updates: Record<string, Partial<ItineraryStop>>) => {
      if (!itinerary) return;
      const nextDays = itinerary.days.map((day) => ({
        ...day,
        stops: day.stops.map((stop) => (updates[stop.id] ? { ...stop, ...updates[stop.id] } : stop)),
      }));
      onItineraryChange({ ...itinerary, days: nextDays });
    },
    [itinerary, onItineraryChange]
  );

  const updateCurrentDay = (updater: (day: ItineraryDay) => ItineraryDay) => {
    if (!itinerary || !currentDay) return;
    const safeIdx = Math.min(activeDayIndex, itinerary.days.length - 1);
    const nextDays = itinerary.days.map((d, i) => (i === safeIdx ? updater(d) : d));
    onItineraryChange({ ...itinerary, days: nextDays, daysCount: nextDays.length });
  };

  const handleAddStop = (place: ResolvedPlaceSelection) => {
    if (!itinerary || !currentDay) return;
    const nextHour = Math.min(20, 9 + currentDay.stops.length * 2);
    const newStop: ItineraryStop = {
      id: `stop-custom-${Date.now()}`,
      name: place.name,
      searchQuery: place.formattedAddress ? `${place.name}, ${place.formattedAddress}` : `${place.name}, ${itinerary.destination}`,
      timeSlot: `${String(nextHour).padStart(2, '0')}:00`,
      durationMinutes: 75,
      category: 'Added Stop',
      description: 'Custom stop added to your itinerary.',
      visitingTips: 'Verify local opening hours before heading over.',
      estimatedCost: 'Varies',
      placeId: place.placeId,
      formattedAddress: place.formattedAddress || undefined,
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      googleMapsURI: place.googleMapsURI,
    };
    updateCurrentDay((day) => ({ ...day, stops: [...day.stops, newStop] }));
    setSelectedStopId(newStop.id);
  };

  const handleMoveStop = (stopIdx: number, direction: -1 | 1) => {
    updateCurrentDay((day) => {
      const target = stopIdx + direction;
      if (target < 0 || target >= day.stops.length) return day;
      const nextStops = [...day.stops];
      const [item] = nextStops.splice(stopIdx, 1);
      nextStops.splice(target, 0, item);
      return { ...day, stops: nextStops };
    });
  };

  const handleMoveStopToDay = (stopId: string, targetDayIdx: number) => {
    if (!itinerary || !currentDay || targetDayIdx === activeDayIndex) return;
    const stop = currentDay.stops.find((s) => s.id === stopId);
    if (!stop) return;
    const nextDays = itinerary.days.map((d, i) => {
      if (i === activeDayIndex) return { ...d, stops: d.stops.filter((s) => s.id !== stopId) };
      if (i === targetDayIdx) return { ...d, stops: [...d.stops, stop] };
      return d;
    });
    onItineraryChange({ ...itinerary, days: nextDays });
    setEditingStopId(null);
  };

  const handleDeleteStop = (stopId: string) => {
    updateCurrentDay((day) => ({ ...day, stops: day.stops.filter((s) => s.id !== stopId) }));
    if (selectedStopId === stopId) setSelectedStopId(null);
    if (editingStopId === stopId) setEditingStopId(null);
  };

  const handleUpdateStop = (stopId: string, patch: Partial<ItineraryStop>) => {
    updateCurrentDay((day) => ({
      ...day,
      stops: day.stops.map((s) => (s.id === stopId ? { ...s, ...patch } : s)),
    }));
  };

  const handleAddDay = () => {
    if (!itinerary || itinerary.days.length >= 30) return;
    const nextNum = itinerary.days.length + 1;
    const newDay: ItineraryDay = {
      dayNumber: nextNum,
      title: `Day ${nextNum} Exploration`,
      theme: 'Flexible neighborhood discovery',
      stops: [],
    };
    onItineraryChange({
      ...itinerary,
      daysCount: nextNum,
      days: [...itinerary.days, newDay],
    });
    setActiveDayIndex(nextNum - 1);
  };

  const handleRemoveDay = (dayIdx: number) => {
    if (!itinerary || itinerary.days.length <= 1) return;
    const filtered = itinerary.days
      .filter((_, i) => i !== dayIdx)
      .map((d, i) => ({ ...d, dayNumber: i + 1 }));
    onItineraryChange({ ...itinerary, daysCount: filtered.length, days: filtered });
    setActiveDayIndex(Math.max(0, Math.min(activeDayIndex, filtered.length - 1)));
  };

  const handleResearchStop = async (stop: ItineraryStop) => {
    if (!itinerary) return;
    setResearchLoadingId(stop.id);
    setResearchError(null);
    try {
      const res = await fetch('/api/landmark/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landmarkName: stop.name,
          destination: itinerary.destination,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not fetch live landmark facts.');
      setResearchMap((prev) => ({ ...prev, [stop.id]: data as LandmarkResearchResult }));
    } catch (err: any) {
      setResearchError(err?.message || 'Landmark search failed.');
    } finally {
      setResearchLoadingId(null);
    }
  };

  const handleCloudSave = async () => {
    if (!itinerary) return;
    if (!user) {
      await onSignIn();
      return;
    }
    setSavingCloud(true);
    setSaveNotice(null);
    try {
      await onSaveItinerary(itinerary);
      setSaveNotice('Saved to your cloud trips');
      window.setTimeout(() => setSaveNotice(null), 3000);
    } catch (err: any) {
      setSaveNotice(err?.message || 'Could not save itinerary');
    } finally {
      setSavingCloud(false);
    }
  };

  const handleDownloadWord = async () => {
    if (!itinerary) return;
    setExportingDocx(true);
    try {
      await exportItineraryToDocx(itinerary);
    } finally {
      setExportingDocx(false);
    }
  };

  // --- LANDING / TRIP BUILDER STATE (when no active itinerary yet) ---
  if (!itinerary) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Split Hero: Left Liquid Glass Builder Form, Right Full-Bleed Editorial Photo with Floating Glass Lens */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-7 liquid-glass rounded-[30px] p-8 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-[#007AFF] mb-3">
                Search-grounded itinerary studio · Live Google Maps routing · Word export
              </p>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-950 leading-[1.15]">
                Turn places you want to see into a mapped, day-by-day route.
              </h1>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-xl">
                Add your destination and wish-list landmarks. Wayfarer Atlas researches current visiting details via Google Search, resolves exact locations on Google Maps, and builds an editable schedule ready for live navigation or Word download.
              </p>

              <div className="mt-7 space-y-5">
                {/* Starting Point vs Destination (Where You're Going) */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                        Starting point <span className="font-normal text-slate-500">(optional)</span>
                      </label>
                      <PlaceAutocompleteInput
                        value={startingPoint}
                        onChangeText={setStartingPoint}
                        onPlaceSelect={(p) =>
                          setStartingPoint(
                            p.formattedAddress
                              ? `${p.name}, ${p.formattedAddress.split(',').slice(-1)[0]?.trim() || ''}`.replace(/,\s*$/, '')
                              : p.name
                          )
                        }
                        placeholder="e.g. Jabalpur, India"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Where you depart from (used for arrival guidance only)
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-semibold text-slate-900">
                          Where are you going? <span className="text-[#007AFF]">*</span>
                        </label>
                        {(startingPoint.trim() || destination.trim()) && (
                          <button
                            type="button"
                            onClick={() => {
                              const prevStart = startingPoint;
                              setStartingPoint(destination);
                              setDestination(prevStart);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007AFF] hover:underline cursor-pointer"
                            title="Swap starting point and destination"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            Swap
                          </button>
                        )}
                      </div>
                      <PlaceAutocompleteInput
                        value={destination}
                        onChangeText={setDestination}
                        onPlaceSelect={(p) =>
                          setDestination(
                            p.formattedAddress
                              ? `${p.name}, ${p.formattedAddress.split(',').slice(-1)[0]?.trim() || ''}`.replace(/,\s*$/, '')
                              : p.name
                          )
                        }
                        placeholder="e.g. Osaka, Japan or Kyoto, Japan"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        All sightseeing stops &amp; daily routes are planned here
                      </p>
                    </div>
                  </div>
                </div>

                {/* Must-Visit Places in Destination */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Specific landmarks in {destination.trim() || 'your destination'}{' '}
                    <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <PlaceAutocompleteInput
                    value={placeDraft}
                    onChangeText={setPlaceDraft}
                    clearOnSelect
                    submitLabel="Add Place"
                    onPlaceSelect={(p) => {
                      const clean = p.name.trim();
                      if (clean && !placesList.includes(clean)) {
                        setPlacesList((prev) => [...prev, clean]);
                      }
                      setPlaceDraft('');
                    }}
                    placeholder={`e.g. ${destination.trim() ? `Top landmarks in ${destination.trim()}` : 'Osaka Castle, Dotonbori'} — press Enter or Add Place`}
                  />

                  {placesList.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {placesList.map((place, idx) => (
                        <div
                          key={`${place}-${idx}`}
                          className="liquid-glass-subtle inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-slate-800"
                        >
                          <span>{place}</span>
                          <button
                            type="button"
                            onClick={() => setPlacesList((prev) => prev.filter((_, i) => i !== idx))}
                            aria-label={`Remove ${place}`}
                            className="text-slate-400 hover:text-slate-900 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Days, Pace, Travel Mode */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Trip length
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={isCustomDays ? 'custom' : String(daysCount)}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'custom') {
                            setIsCustomDays(true);
                            const nextCustom = daysCount > 7 ? daysCount : 10;
                            setCustomDaysInput(String(nextCustom));
                            setDaysCount(nextCustom);
                          } else {
                            setIsCustomDays(false);
                            setDaysCount(Number(val));
                          }
                        }}
                        aria-label="Trip length"
                        className={`${
                          isCustomDays ? 'w-[54%]' : 'w-full'
                        } px-3 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900`}
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <option key={d} value={d}>
                            {d} {d === 1 ? 'Day' : 'Days'}
                          </option>
                        ))}
                        <option value="custom">Custom...</option>
                      </select>

                      {isCustomDays && (
                        <div className="relative flex-1 min-w-0">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            inputMode="numeric"
                            value={customDaysInput}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setCustomDaysInput(raw);
                              const num = parseInt(raw, 10);
                              if (!Number.isNaN(num) && num >= 1) {
                                setDaysCount(Math.min(30, num));
                              }
                            }}
                            onBlur={() => {
                              const num = parseInt(customDaysInput, 10);
                              const clamped = Math.max(1, Math.min(30, Number.isNaN(num) ? 1 : num));
                              setDaysCount(clamped);
                              setCustomDaysInput(String(clamped));
                            }}
                            aria-label="Custom number of days"
                            placeholder="1-30"
                            className="w-full pl-3 pr-9 py-2.5 text-sm font-mono tabular-nums liquid-glass-input rounded-2xl text-slate-900"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-slate-500">
                            d
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Daily pace
                    </label>
                    <div className="grid grid-cols-3 p-1 liquid-segmented rounded-2xl">
                      {(['relaxed', 'balanced', 'intensive'] as TravelPace[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPace(p)}
                          className={`py-1.5 text-xs font-semibold rounded-xl capitalize transition-all whitespace-nowrap cursor-pointer ${
                            pace === p
                              ? 'liquid-segmented-active'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                      Primary travel mode
                    </label>
                    <select
                      value={travelMode}
                      onChange={(e) => setTravelMode(e.target.value as TravelMode)}
                      className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900"
                    >
                      <option value="WALKING">Walking</option>
                      <option value="DRIVING">Driving</option>
                      <option value="TRANSIT">Public Transit</option>
                      <option value="BICYCLING">Cycling</option>
                    </select>
                  </div>
                </div>

                {/* Interests */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Interests or preferences (optional)
                  </label>
                  <input
                    type="text"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    placeholder="e.g. Modern architecture, quiet viewpoints, local bakeries, wheelchair-friendly paths"
                    className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900 placeholder:text-slate-400"
                  />
                </div>

                {genError && (
                  <div className="p-3 bg-red-50/85 backdrop-blur-md border border-red-200/90 rounded-2xl text-xs text-[#DC2626]">
                    {genError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => void handleGenerate()}
                    className="liquid-btn-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold disabled:opacity-60 rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Researching &amp; Optimizing Route...
                      </>
                    ) : (
                      'Generate Optimized Itinerary'
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => {
                      const dest = destination.trim() || 'Custom Trip';
                      const origin = startingPoint.trim();
                      const pendingDraft = placeDraft.trim();
                      const combinedPlaces =
                        pendingDraft && !placesList.includes(pendingDraft)
                          ? [...placesList, pendingDraft]
                          : placesList;
                      if (pendingDraft) setPlaceDraft('');
                      const initialStops: ItineraryStop[] = combinedPlaces.map((name, idx) => ({
                        id: `stop-manual-${Date.now()}-${idx}`,
                        name,
                        searchQuery: destination.trim() ? `${name}, ${destination.trim()}` : name,
                        timeSlot: `${String(Math.min(20, 9 + idx * 2)).padStart(2, '0')}:00`,
                        durationMinutes: 90,
                        category: 'Landmark',
                        description: 'Added to your editable itinerary.',
                        visitingTips: 'Edit this stop or search live hours anytime.',
                        estimatedCost: 'Varies',
                      }));
                      const parsedCustom = isCustomDays ? parseInt(customDaysInput, 10) : daysCount;
                      const manualDays = Math.max(
                        1,
                        Math.min(30, Number.isFinite(parsedCustom) ? parsedCustom : daysCount)
                      );
                      if (isCustomDays) {
                        setDaysCount(manualDays);
                        setCustomDaysInput(String(manualDays));
                      }
                      const blankDays: ItineraryDay[] = Array.from({ length: manualDays }, (_, dIdx) => ({
                        dayNumber: dIdx + 1,
                        title: `Day ${dIdx + 1} in ${dest}`,
                        theme: 'Custom route & landmarks',
                        stops: dIdx === 0 ? initialStops : [],
                      }));
                      setActiveDayIndex(0);
                      onItineraryChange({
                        title: `${manualDays} Day${manualDays === 1 ? '' : 's'} in ${dest}`,
                        destination: dest,
                        ...(origin ? { startingPoint: origin } : {}),
                        travelMode,
                        pace,
                        daysCount: manualDays,
                        summary: origin
                          ? `Custom editable itinerary for ${dest} (departing from ${origin}). Add stops using Google Places search to map live routes and export as a Word document.`
                          : `Custom editable itinerary for ${dest}. Add stops using Google Places search to map live routes and export as a Word document.`,
                        days: blankDays,
                        sources: [],
                      });
                    }}
                    className="liquid-btn-glass inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Build Manually
                  </button>

                  {savedItineraries.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSavedDrawer((v) => !v)}
                      className="liquid-btn-glass inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4 text-[#007AFF]" />
                      Saved Trips ({savedItineraries.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Photography Frame with Floating Liquid Glass Lens */}
          <div className="lg:col-span-5 rounded-[30px] overflow-hidden border border-white/80 shadow-[0_20px_50px_-14px_rgba(15,35,70,0.22)] bg-slate-900 relative min-h-[360px]">
            {!heroImgFailed ? (
              <img
                src={HERO_IMAGE}
                alt="Scenic coastal cliffside town at golden hour overlooking the sea"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 flex items-center justify-center p-8 text-center text-white">
                <div>
                  <MapPin className="w-8 h-8 mx-auto mb-3 text-sky-300" />
                  <p className="font-editorial text-xl">Wayfarer Atlas</p>
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent flex flex-col justify-end p-5">
              <div className="liquid-glass-dark rounded-[22px] p-5 text-white">
                <p className="text-xs text-white/80">
                  Live Google Search Grounding · Google Maps Routes API · Audio Tour Narration
                </p>
                <p className="font-editorial text-xl mt-1.5 leading-snug">
                  Every stop verified on the map, paced by neighborhood, and ready to export as a Word dossier.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Saved Itineraries Drawer if toggled */}
        {showSavedDrawer && savedItineraries.length > 0 && (
          <div className="mt-8 liquid-glass rounded-[28px] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-950">Your Saved Cloud Itineraries</h2>
              <button
                type="button"
                onClick={() => setShowSavedDrawer(false)}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {savedItineraries.map((saved) => (
                <div
                  key={saved.id}
                  className="liquid-glass-subtle liquid-card-interactive rounded-2xl p-4 flex flex-col justify-between"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{saved.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {saved.destination} · {saved.days.length} day{saved.days.length === 1 ? '' : 's'} · {saved.travelMode.toLowerCase()}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveDayIndex(0);
                        onItineraryChange(saved);
                        setShowSavedDrawer(false);
                      }}
                      className="text-xs font-semibold text-[#007AFF] hover:underline cursor-pointer"
                    >
                      Open &amp; Edit
                    </button>
                    {saved.id && (
                      <button
                        type="button"
                        onClick={() => void onDeleteSavedItinerary(saved.id!)}
                        className="text-xs text-slate-400 hover:text-[#DC2626] cursor-pointer"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick-Start Curated Routes Row */}
        <div className="mt-10 pt-8 border-t border-white/60">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-950">Start with a curated route brief</h2>
            <span className="text-xs text-slate-500">Generates a fresh live search-grounded itinerary</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {SAMPLE_TRIPS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                disabled={generating}
                onClick={() => {
                  setDestination(sample.destination);
                  setPlacesList(sample.places);
                  setIsCustomDays(false);
                  setDaysCount(sample.daysCount);
                  setInterests(sample.interests);
                  void handleGenerate({
                    destination: sample.destination,
                    places: sample.places,
                    daysCount: sample.daysCount,
                    interests: sample.interests,
                  });
                }}
                className="text-left liquid-glass liquid-card-interactive rounded-[24px] p-5 group cursor-pointer"
              >
                <div className="text-sm font-semibold text-slate-950 group-hover:text-[#007AFF] transition-colors">
                  {sample.label}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {sample.destination} · {sample.daysCount} days · {sample.places.length} landmarks
                </div>
                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed line-clamp-2">
                  {sample.places.join(' · ')}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- ACTIVE ITINERARY STUDIO & LIVE MAP WORKSPACE ---
  const totalStops = itinerary.days.reduce((sum, d) => sum + d.stops.length, 0);

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-6">
      {/* Studio Action Bar */}
      <div className="liquid-glass rounded-[28px] p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            {editingHeader ? (
              <div className="space-y-3 max-w-2xl">
                <input
                  type="text"
                  value={itinerary.title}
                  onChange={(e) => onItineraryChange({ ...itinerary, title: e.target.value })}
                  className="w-full text-xl font-editorial font-semibold px-3.5 py-2 liquid-glass-input rounded-2xl text-slate-950"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={itinerary.destination}
                    onChange={(e) => onItineraryChange({ ...itinerary, destination: e.target.value })}
                    className="flex-1 text-sm px-3.5 py-2 liquid-glass-input rounded-2xl text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingHeader(false)}
                    className="liquid-btn-primary px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={itinerary.summary}
                  onChange={(e) => onItineraryChange({ ...itinerary, summary: e.target.value })}
                  className="w-full text-sm px-3.5 py-2 liquid-glass-input rounded-2xl text-slate-900"
                />
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-semibold text-slate-950 tracking-tight truncate">
                    {itinerary.title}
                  </h1>
                  <button
                    type="button"
                    onClick={() => setEditingHeader(true)}
                    aria-label="Edit trip details"
                    className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-white/60 rounded-full transition-colors shrink-0 cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span className="font-sans font-semibold text-slate-800">
                    {itinerary.startingPoint
                      ? `From ${itinerary.startingPoint} → ${itinerary.destination}`
                      : itinerary.destination}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{itinerary.days.length} days</span>
                  <span aria-hidden="true">·</span>
                  <span>{totalStops} stops</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize font-sans">{itinerary.pace} pace</span>
                  {saveNotice && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#16A34A] font-sans font-semibold">{saveNotice}</span>
                    </>
                  )}
                </div>
                {itinerary.summary && (
                  <p className="mt-2.5 text-sm text-slate-600 leading-relaxed max-w-3xl">
                    {itinerary.summary}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Primary Workspace Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={buildDestinationDirectionsUrl(itinerary.destination, itinerary.travelMode)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open Google Maps directions from your current location to ${itinerary.destination}`}
              className="liquid-btn-glass inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0"
            >
              <Navigation className="w-3.5 h-3.5 text-[#007AFF]" />
              Directions to Destination
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <button
              type="button"
              onClick={() => {
                if (!currentDay) return;
                void onPlayAudioGuide({
                  mode: 'podcast',
                  title: `Day ${currentDay.dayNumber}: ${currentDay.title}`,
                  script: currentDay.theme,
                  stops: currentDay.stops,
                });
              }}
              className="liquid-btn-glass inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Headphones className="w-3.5 h-3.5 text-[#007AFF]" />
              Day Podcast
            </button>

            <button
              type="button"
              disabled={exportingDocx}
              onClick={() => void handleDownloadWord()}
              className="liquid-btn-glass inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              {exportingDocx ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#007AFF]" />
              ) : (
                <Download className="w-3.5 h-3.5 text-[#007AFF]" />
              )}
              Word Doc (.docx)
            </button>

            <button
              type="button"
              disabled={savingCloud}
              onClick={() => void handleCloudSave()}
              className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold disabled:opacity-60 rounded-full whitespace-nowrap shrink-0 cursor-pointer"
            >
              {savingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              {user ? 'Save Trip' : 'Sign In to Save'}
            </button>

            <button
              type="button"
              onClick={() => {
                onItineraryChange(null);
                setRouteSummary(null);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-950 hover:bg-white/50 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              New Trip
            </button>
          </div>
        </div>

        {/* Sub-bar: Day Selector Tabs + Travel Mode Switcher */}
        <div className="mt-5 pt-4 border-t border-slate-900/8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            {itinerary.days.map((day, idx) => (
              <button
                key={day.dayNumber}
                type="button"
                onClick={() => {
                  setActiveDayIndex(idx);
                  setSelectedStopId(null);
                  setEditingStopId(null);
                }}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  idx === activeDayIndex
                    ? 'bg-slate-900/90 text-white shadow-md shadow-slate-900/20 border border-white/20'
                    : 'liquid-btn-glass text-slate-700'
                }`}
              >
                Day {day.dayNumber} · {day.stops.length}
              </button>
            ))}
            {itinerary.days.length < 30 && (
              <button
                type="button"
                onClick={handleAddDay}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950 border border-dashed border-slate-400/50 hover:border-[#007AFF] bg-white/35 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Day
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 liquid-segmented rounded-full">
            {(
              [
                { id: 'WALKING', label: 'Walk' },
                { id: 'DRIVING', label: 'Drive' },
                { id: 'TRANSIT', label: 'Transit' },
                { id: 'BICYCLING', label: 'Cycle' },
              ] as Array<{ id: TravelMode; label: string }>
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onItineraryChange({ ...itinerary, travelMode: mode.id })}
                className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  itinerary.travelMode === mode.id
                    ? 'liquid-segmented-active'
                    : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Left Editable Schedule, Right Sticky Live Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Day Schedule & Inline Editor */}
        <div className="lg:col-span-7 space-y-5">
          {currentDay && (
            <div className="liquid-glass rounded-[28px] p-6">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-900/8">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={currentDay.title}
                    onChange={(e) => updateCurrentDay((d) => ({ ...d, title: e.target.value }))}
                    aria-label="Day title"
                    className="w-full text-lg font-editorial font-semibold text-slate-950 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#007AFF] focus:outline-none pb-0.5"
                  />
                  <input
                    type="text"
                    value={currentDay.theme}
                    onChange={(e) => updateCurrentDay((d) => ({ ...d, theme: e.target.value }))}
                    aria-label="Day theme"
                    className="w-full text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-[#007AFF] focus:outline-none mt-1"
                  />
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {currentDay.stops.length > 0 && (
                    <a
                      href={
                        buildDayRouteDirectionsUrl(
                          currentDay.stops,
                          itinerary.destination,
                          itinerary.travelMode
                        ) || buildDestinationDirectionsUrl(itinerary.destination, itinerary.travelMode)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Start Google Maps navigation from your current location through all Day ${currentDay.dayNumber} stops`}
                      className="liquid-btn-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0071E3] rounded-full whitespace-nowrap shrink-0"
                    >
                      <Navigation className="w-3.5 h-3.5 text-[#007AFF]" />
                      Navigate Day {currentDay.dayNumber}
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  )}
                  {itinerary.days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDay(activeDayIndex)}
                      className="text-xs font-medium text-slate-400 hover:text-[#DC2626] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Remove Day
                    </button>
                  )}
                </div>
              </div>

              {researchError && (
                <div className="mt-4 p-3 bg-red-50/85 backdrop-blur-md border border-red-200/90 rounded-2xl text-xs text-[#DC2626]">
                  {researchError}
                </div>
              )}

              {/* Stops List */}
              {currentDay.stops.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm font-semibold text-slate-800">No stops scheduled for Day {currentDay.dayNumber} yet.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Search any landmark below to append a verified stop to this day.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-900/8">
                  {currentDay.stops.map((stop, idx) => {
                    const isEditing = editingStopId === stop.id;
                    const isSelected = selectedStopId === stop.id;
                    const research = researchMap[stop.id];
                    const legAfter = routeSummary?.legs[idx];

                    return (
                      <div key={stop.id} className="py-5 first:pt-4 last:pb-2">
                        {isEditing ? (
                          <div className="space-y-3 liquid-glass-subtle rounded-[20px] p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Landmark name
                                </label>
                                <input
                                  type="text"
                                  value={stop.name}
                                  onChange={(e) => handleUpdateStop(stop.id, { name: e.target.value })}
                                  className="w-full px-3 py-2 text-sm liquid-glass-input rounded-xl text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Time slot
                                </label>
                                <input
                                  type="text"
                                  value={stop.timeSlot}
                                  onChange={(e) => handleUpdateStop(stop.id, { timeSlot: e.target.value })}
                                  className="w-full px-3 py-2 text-sm font-mono liquid-glass-input rounded-xl text-slate-900"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Category
                                </label>
                                <input
                                  type="text"
                                  value={stop.category}
                                  onChange={(e) => handleUpdateStop(stop.id, { category: e.target.value })}
                                  className="w-full px-3 py-2 text-sm liquid-glass-input rounded-xl text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Duration (min)
                                </label>
                                <input
                                  type="number"
                                  min={15}
                                  max={480}
                                  value={stop.durationMinutes}
                                  onChange={(e) =>
                                    handleUpdateStop(stop.id, { durationMinutes: Math.max(15, Number(e.target.value) || 60) })
                                  }
                                  className="w-full px-3 py-2 text-sm font-mono liquid-glass-input rounded-xl text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                  Estimated cost
                                </label>
                                <input
                                  type="text"
                                  value={stop.estimatedCost}
                                  onChange={(e) => handleUpdateStop(stop.id, { estimatedCost: e.target.value })}
                                  className="w-full px-3 py-2 text-sm liquid-glass-input rounded-xl text-slate-900"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Description
                              </label>
                              <textarea
                                rows={2}
                                value={stop.description}
                                onChange={(e) => handleUpdateStop(stop.id, { description: e.target.value })}
                                className="w-full px-3 py-2 text-sm liquid-glass-input rounded-xl text-slate-900"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Visitor tips
                              </label>
                              <input
                                type="text"
                                value={stop.visitingTips}
                                onChange={(e) => handleUpdateStop(stop.id, { visitingTips: e.target.value })}
                                className="w-full px-3 py-2 text-sm liquid-glass-input rounded-xl text-slate-900"
                              />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                              {itinerary.days.length > 1 && (
                                <div className="flex items-center gap-2 text-xs text-slate-600">
                                  <span>Move to:</span>
                                  <select
                                    value={activeDayIndex}
                                    onChange={(e) => handleMoveStopToDay(stop.id, Number(e.target.value))}
                                    className="px-2.5 py-1.5 liquid-glass-input rounded-xl text-xs text-slate-900"
                                  >
                                    {itinerary.days.map((d, dIdx) => (
                                      <option key={d.dayNumber} value={dIdx}>
                                        Day {d.dayNumber}: {d.title}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingStopId(null)}
                                className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Done Editing
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-4">
                            {/* Sequence Index + Time */}
                            <div className="w-14 shrink-0 text-right pt-0.5">
                              <button
                                type="button"
                                onClick={() => setSelectedStopId(stop.id)}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-mono text-xs font-semibold tabular-nums transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'liquid-btn-glass text-slate-800 hover:text-[#007AFF]'
                                }`}
                              >
                                {idx + 1}
                              </button>
                              <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-1.5">
                                {stop.timeSlot}
                              </div>
                            </div>

                            {/* Main Stop Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedStopId(stop.id)}
                                    className={`text-left text-base font-semibold transition-colors cursor-pointer ${
                                      isSelected ? 'text-[#007AFF]' : 'text-slate-950 hover:text-[#007AFF]'
                                    }`}
                                  >
                                    {stop.name}
                                  </button>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                    <span>{stop.category}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono tabular-nums">{stop.durationMinutes} min</span>
                                    {stop.estimatedCost && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>{stop.estimatedCost}</span>
                                      </>
                                    )}
                                    {typeof stop.rating === 'number' && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums text-slate-700">
                                          ★ {stop.rating.toFixed(1)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Reorder + Edit + Delete Controls */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveStop(idx, -1)}
                                    aria-label="Move stop earlier"
                                    className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-white/60 disabled:opacity-30 rounded-full transition-colors cursor-pointer"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === currentDay.stops.length - 1}
                                    onClick={() => handleMoveStop(idx, 1)}
                                    aria-label="Move stop later"
                                    className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-white/60 disabled:opacity-30 rounded-full transition-colors cursor-pointer"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingStopId(stop.id)}
                                    aria-label="Edit stop"
                                    className="p-1.5 text-slate-400 hover:text-[#007AFF] hover:bg-white/60 rounded-full transition-colors cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteStop(stop.id)}
                                    aria-label="Delete stop"
                                    className="p-1.5 text-slate-400 hover:text-[#DC2626] hover:bg-white/60 rounded-full transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {stop.formattedAddress && (
                                <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1.5">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{stop.formattedAddress}</span>
                                </p>
                              )}

                              {stop.description && (
                                <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                                  {stop.description}
                                </p>
                              )}

                              {stop.visitingTips && (
                                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                                  <strong className="font-semibold text-slate-800">Visitor note:</strong> {stop.visitingTips}
                                </p>
                              )}

                              {/* Stop Action Row */}
                              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onPlayAudioGuide({
                                      mode: 'guide',
                                      title: stop.name,
                                      script: `${stop.name} in ${itinerary.destination}. ${stop.description} Practical advice: ${stop.visitingTips}`,
                                    })
                                  }
                                  className="inline-flex items-center gap-1.5 text-[#007AFF] hover:underline whitespace-nowrap cursor-pointer"
                                >
                                  <Volume2 className="w-3.5 h-3.5" />
                                  Listen to Guide
                                </button>

                                <button
                                  type="button"
                                  disabled={researchLoadingId === stop.id}
                                  onClick={() => void handleResearchStop(stop)}
                                  className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-950 whitespace-nowrap cursor-pointer"
                                >
                                  {researchLoadingId === stop.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#007AFF]" />
                                  ) : (
                                    <Search className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                  {research ? 'Refresh Search Facts' : 'Search Live Hours & Tips'}
                                </button>

                                <a
                                  href={buildStopDirectionsUrl(stop, itinerary.destination, itinerary.travelMode)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Open Google Maps directions from your current location to ${stop.name}`}
                                  className="inline-flex items-center gap-1.5 text-[#0071E3] hover:underline whitespace-nowrap"
                                >
                                  <Navigation className="w-3.5 h-3.5" />
                                  Directions from Current Location
                                  <ExternalLink className="w-3 h-3 opacity-80" />
                                </a>

                                {stop.googleMapsURI && (
                                  <a
                                    href={stop.googleMapsURI}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-950 whitespace-nowrap"
                                  >
                                    Place Info
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                              </div>

                              {/* Live Search Grounding Expansion Panel */}
                              {research && (
                                <div className="mt-3 p-4 liquid-glass-subtle rounded-2xl text-xs space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-slate-900 flex items-center gap-1.5">
                                      <Globe className="w-3.5 h-3.5 text-[#007AFF]" />
                                      Live Google Search Dossier
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setResearchMap((prev) => {
                                          const copy = { ...prev };
                                          delete copy[stop.id];
                                          return copy;
                                        })
                                      }
                                      className="text-slate-400 hover:text-slate-800 cursor-pointer"
                                    >
                                      Hide
                                    </button>
                                  </div>
                                  {research.overview && (
                                    <p className="text-slate-700 leading-relaxed">{research.overview}</p>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-600">
                                    <div>
                                      <strong className="text-slate-800">Hours:</strong> {research.openingHours}
                                    </div>
                                    <div>
                                      <strong className="text-slate-800">Tickets:</strong> {research.ticketInfo}
                                    </div>
                                    <div className="sm:col-span-2">
                                      <strong className="text-slate-800">Best timing:</strong> {research.bestTime}
                                    </div>
                                  </div>
                                  {research.nearbyRecommendations.length > 0 && (
                                    <div className="pt-1 text-slate-600">
                                      <strong className="text-slate-800">Nearby:</strong>{' '}
                                      {research.nearbyRecommendations.join(' · ')}
                                    </div>
                                  )}
                                  {research.sources.length > 0 && (
                                    <div className="pt-2 border-t border-slate-900/8 flex flex-wrap gap-x-3 gap-y-1">
                                      {research.sources.slice(0, 4).map((src, sIdx) => (
                                        <a
                                          key={sIdx}
                                          href={src.uri}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[11px] text-[#007AFF] hover:underline truncate max-w-[200px]"
                                        >
                                          {src.title}
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Transit Connector to Next Stop */}
                              {legAfter && idx < currentDay.stops.length - 1 && (
                                <div className="mt-3 pt-2 text-[11px] font-mono tabular-nums text-slate-400">
                                  Next stop: {(legAfter.distanceMeters / 1000).toFixed(1)} km ·{' '}
                                  {Math.max(1, Math.round(legAfter.durationMillis / 60000))} min ({itinerary.travelMode.toLowerCase()})
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add New Stop via Places API (New) */}
              <div className="mt-5 pt-4 border-t border-slate-900/8">
                <label className="block text-xs font-semibold text-slate-800 mb-2">
                  Add another stop to Day {currentDay.dayNumber}
                </label>
                <PlaceAutocompleteInput
                  clearOnSelect
                  submitLabel="Add Stop"
                  onPlaceSelect={handleAddStop}
                  placeholder={`Search a place in ${itinerary.destination} to append...`}
                />
              </div>
            </div>
          )}

          {/* Grounding Citations Section */}
          {itinerary.sources && itinerary.sources.length > 0 && (
            <div className="liquid-glass rounded-[28px] p-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 mb-3">
                <BookOpen className="w-3.5 h-3.5 text-[#007AFF]" />
                Verified Google Search Research Sources
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {itinerary.sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="liquid-glass-subtle flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs text-slate-700 hover:text-[#007AFF] rounded-2xl transition-colors"
                  >
                    <span className="truncate">{src.title}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Sticky Interactive Google Map & Turn-by-Turn Navigation */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 h-[640px]">
          {mapsStatus === 'loaded' ? (
            <ItineraryMap
              destination={itinerary.destination}
              stops={currentDay?.stops || []}
              travelMode={itinerary.travelMode}
              selectedStopId={selectedStopId}
              onSelectStop={setSelectedStopId}
              onResolveStops={handleResolveStops}
              onRouteComputed={setRouteSummary}
            />
          ) : mapsStatus === 'error' ? (
            <div className="h-full liquid-glass rounded-[28px] p-7 flex flex-col justify-between">
              <div className="text-center pt-6">
                <div className="w-12 h-12 rounded-2xl liquid-glass-subtle flex items-center justify-center mx-auto mb-4">
                  <Navigation className="w-5 h-5 text-[#007AFF]" />
                </div>
                <h3 className="text-base font-semibold text-slate-950">
                  Interactive Map Unavailable
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-xs mx-auto">
                  The embedded Google Maps script could not connect right now (often caused by a brief network drop or browser script blocker). You can reload the map or launch Google Maps directly below.
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={onRetryMaps}
                    className="liquid-btn-glass px-4 py-2 text-xs font-semibold rounded-full cursor-pointer"
                  >
                    Reload Map
                  </button>
                  {currentDay && (
                    <a
                      href={
                        buildDayRouteDirectionsUrl(
                          currentDay.stops,
                          itinerary.destination,
                          itinerary.travelMode
                        ) || buildDestinationDirectionsUrl(itinerary.destination, itinerary.travelMode)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Open Day {currentDay.dayNumber} in Google Maps
                      <ExternalLink className="w-3 h-3 opacity-85" />
                    </a>
                  )}
                </div>
              </div>

              {currentDay && currentDay.stops.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-900/8 overflow-y-auto space-y-2">
                  <p className="text-[11px] font-semibold text-slate-500 mb-2">
                    Direct navigation from your current location
                  </p>
                  {currentDay.stops.map((stop, idx) => (
                    <a
                      key={stop.id}
                      href={buildStopDirectionsUrl(stop, itinerary.destination, itinerary.travelMode)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="liquid-glass-subtle flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl text-xs text-slate-800 hover:text-[#0071E3] transition-colors"
                    >
                      <span className="truncate font-medium">
                        {idx + 1}. {stop.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#0071E3] font-semibold shrink-0">
                        Directions
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full liquid-glass rounded-[28px] flex items-center justify-center p-8 text-center">
              <div>
                <Loader2 className="w-6 h-6 text-[#007AFF] animate-spin mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-900">Loading Google Maps Platform...</p>
                <p className="text-xs text-slate-500 mt-1">
                  Initializing interactive map pins and real-time Routes API.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
