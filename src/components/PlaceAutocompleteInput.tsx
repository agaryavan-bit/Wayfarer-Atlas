import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, Search, Loader2 } from 'lucide-react';

export interface ResolvedPlaceSelection {
  name: string;
  formattedAddress: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  googleMapsURI?: string;
}

interface PlaceAutocompleteInputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onPlaceSelect: (place: ResolvedPlaceSelection) => void;
  placeholder?: string;
  submitLabel?: string;
  clearOnSelect?: boolean;
  className?: string;
}

export function PlaceAutocompleteInput({
  value,
  onChangeText,
  onPlaceSelect,
  placeholder = 'Search a landmark, neighborhood, or museum...',
  submitLabel,
  clearOnSelect = false,
  className = '',
}: PlaceAutocompleteInputProps) {
  const placesLib = useMapsLibrary('places');
  const [internalText, setInternalText] = useState(value ?? '');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const inputValue = value !== undefined ? value : internalText;

  const setInputValue = useCallback(
    (next: string) => {
      if (value === undefined) setInternalText(next);
      onChangeText?.(next);
    },
    [value, onChangeText]
  );

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!placesLib || !inputValue.trim() || inputValue.trim().length < 3) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        setIsLoading(true);
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: inputValue.trim(),
          sessionToken: sessionTokenRef.current,
        });
        if (!cancelled) {
          setSuggestions(res?.suggestions?.slice(0, 5) ?? []);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSuggestions([]);
          setIsLoading(false);
        }
        const msg = String(err?.message || err || '');
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, inputValue]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!suggestion.placePrediction) return;
      const fallbackText = suggestion.placePrediction.text?.text ?? inputValue.trim();

      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'googleMapsURI'],
        });

        const resolved: ResolvedPlaceSelection = {
          name: place.displayName || fallbackText,
          formattedAddress: place.formattedAddress || '',
          placeId: place.id,
          lat: place.location?.lat(),
          lng: place.location?.lng(),
          rating: typeof place.rating === 'number' ? place.rating : undefined,
          googleMapsURI: place.googleMapsURI || undefined,
        };

        onPlaceSelect(resolved);
        sessionTokenRef.current = null;
        setSuggestions([]);
        setOpen(false);
        if (clearOnSelect) {
          setInputValue('');
        } else if (value === undefined) {
          setInputValue(resolved.name);
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onPlaceSelect({ name: fallbackText, formattedAddress: '' });
        sessionTokenRef.current = null;
        setSuggestions([]);
        setOpen(false);
        if (clearOnSelect) setInputValue('');
      }
    },
    [clearOnSelect, inputValue, onPlaceSelect, setInputValue]
  );

  const handleManualSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onPlaceSelect({ name: trimmed, formattedAddress: '' });
    setSuggestions([]);
    setOpen(false);
    if (clearOnSelect) setInputValue('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={inputValue}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setInputValue(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions.length > 0 && open) {
                  void handleSelectSuggestion(suggestions[0]);
                } else {
                  handleManualSubmit();
                }
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder={placeholder}
            className="w-full pl-10 pr-9 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900 placeholder:text-slate-400"
          />
          {isLoading && (
            <Loader2 className="w-4 h-4 text-[#007AFF] animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>
        {submitLabel && (
          <button
            type="button"
            onClick={handleManualSubmit}
            className="liquid-btn-glass px-4 py-2.5 text-sm font-medium rounded-2xl whitespace-nowrap shrink-0 cursor-pointer"
          >
            {submitLabel}
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-40 left-0 right-0 mt-2 liquid-glass-popover rounded-2xl overflow-hidden divide-y divide-slate-900/6">
          {suggestions.map((suggestion, idx) => {
            const mainText = suggestion.placePrediction?.mainText?.text || suggestion.placePrediction?.text?.text;
            const secondaryText = suggestion.placePrediction?.secondaryText?.text;
            return (
              <li key={suggestion.placePrediction?.placeId || idx}>
                <button
                  type="button"
                  onClick={() => void handleSelectSuggestion(suggestion)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-white/75 transition-colors flex items-start gap-2.5 cursor-pointer"
                >
                  <MapPin className="w-4 h-4 text-[#007AFF] mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{mainText}</div>
                    {secondaryText && (
                      <div className="text-xs text-slate-500 truncate">{secondaryText}</div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
