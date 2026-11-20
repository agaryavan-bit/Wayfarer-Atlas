import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { LogOut } from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from './firebase';
import type { ActiveTab, ImageAnalysisResult, Itinerary, ItineraryStop } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PlannerWorkspace } from './components/PlannerWorkspace';
import { PhotoLensView } from './components/PhotoLensView';
import { CollaborativeListsView } from './components/CollaborativeListsView';
import { TravelJournalView } from './components/TravelJournalView';
import { FractionCalculatorView } from './components/FractionCalculatorView';
import { AudioGuideBar, type AudioGuideTrack } from './components/AudioGuideBar';

function sanitizeItineraryForFirestore(itinerary: Itinerary) {
  const days = itinerary.days.slice(0, 14).map((d, dIdx) => ({
    dayNumber: dIdx + 1,
    title: String(d.title || `Day ${dIdx + 1}`).slice(0, 120),
    theme: String(d.theme || '').slice(0, 140),
    stops: d.stops.slice(0, 15).map((s) => {
      const cleanStop: Record<string, unknown> = {
        id: String(s.id || `stop-${dIdx}-${Date.now()}`).slice(0, 100),
        name: String(s.name || 'Landmark').slice(0, 140),
        searchQuery: String(s.searchQuery || s.name || '').slice(0, 200),
        timeSlot: String(s.timeSlot || '09:00').slice(0, 20),
        durationMinutes: Math.max(15, Math.min(480, Math.round(Number(s.durationMinutes) || 60))),
        category: String(s.category || 'Landmark').slice(0, 60),
        description: String(s.description || '').slice(0, 600),
        visitingTips: String(s.visitingTips || '').slice(0, 400),
        estimatedCost: String(s.estimatedCost || '').slice(0, 80),
      };
      if (s.placeId) cleanStop.placeId = String(s.placeId).slice(0, 200);
      if (s.formattedAddress) cleanStop.formattedAddress = String(s.formattedAddress).slice(0, 240);
      if (typeof s.lat === 'number' && Number.isFinite(s.lat)) cleanStop.lat = s.lat;
      if (typeof s.lng === 'number' && Number.isFinite(s.lng)) cleanStop.lng = s.lng;
      if (typeof s.rating === 'number' && Number.isFinite(s.rating)) cleanStop.rating = s.rating;
      if (s.googleMapsURI) cleanStop.googleMapsURI = String(s.googleMapsURI).slice(0, 400);
      return cleanStop;
    }),
  }));

  const sources = (itinerary.sources || []).slice(0, 25).map((src) => ({
    title: String(src.title || '').slice(0, 140),
    uri: String(src.uri || '').slice(0, 500),
  }));

  return {
    title: String(itinerary.title || 'Travel Itinerary').slice(0, 160),
    destination: String(itinerary.destination || 'Destination').slice(0, 120),
    travelMode: itinerary.travelMode || 'WALKING',
    pace: itinerary.pace || 'balanced',
    daysCount: Math.max(1, Math.min(14, days.length || 1)),
    summary: String(itinerary.summary || '').slice(0, 2000),
    days,
    sources,
    isPublic: Boolean(itinerary.isPublic),
  };
}

type MapsLoadStatus = 'loading' | 'loaded' | 'error';

interface AppShellProps {
  mapsStatus: MapsLoadStatus;
  onRetryMaps: () => void;
}

function AppShell({ mapsStatus, onRetryMaps }: AppShellProps) {
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('planner');
  const [user, setUser] = useState<User | null>(null);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const authMenuRef = useRef<HTMLDivElement>(null);

  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [savedItineraries, setSavedItineraries] = useState<Itinerary[]>([]);

  const [seedDraft, setSeedDraft] = useState<{ destination: string; places: string[]; title?: string } | null>(null);
  const [journalDraft, setJournalDraft] = useState<{
    title: string;
    location: string;
    country: string;
    summary: string;
    tips: string;
    imageUrl: string;
  } | null>(null);

  const [audioTrack, setAudioTrack] = useState<AudioGuideTrack | null>(null);
  const [audioLoadingLabel, setAudioLoadingLabel] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Listen for Google Maps Platform Demo Key Quota Exhaustion events
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (authMenuRef.current && !authMenuRef.current.contains(e.target as Node)) {
        setAuthMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Firebase Auth listener + private user profile sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (nextUser && nextUser.emailVerified) {
        const userRef = doc(db, 'users', nextUser.uid);
        try {
          const snap = await getDoc(userRef);
          const profileBase = {
            uid: nextUser.uid,
            displayName: (nextUser.displayName || 'Traveler').slice(0, 100),
            ...(nextUser.email ? { email: nextUser.email.slice(0, 200) } : {}),
            ...(nextUser.photoURL ? { photoURL: nextUser.photoURL.slice(0, 500) } : {}),
            updatedAt: serverTimestamp(),
          };
          if (!snap.exists()) {
            await setDoc(userRef, { ...profileBase, createdAt: serverTimestamp() });
          } else {
            await updateDoc(userRef, {
              displayName: profileBase.displayName,
              ...(profileBase.email ? { email: profileBase.email } : {}),
              ...(profileBase.photoURL ? { photoURL: profileBase.photoURL } : {}),
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Non-fatal profile sync error
        }
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to signed-in user's saved itineraries
  useEffect(() => {
    if (!user) {
      setSavedItineraries([]);
      return;
    }
    const q = query(collection(db, 'itineraries'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Itinerary, 'id'>) }))
          .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
        setSavedItineraries(list);
      },
      (err) => {
        if ((err as { code?: string })?.code === 'unavailable') {
          console.warn('Firestore temporarily unavailable while syncing itineraries.');
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'itineraries');
      }
    );
    return () => unsub();
  }, [user]);

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Google Sign-In failed:', err);
    }
  }, []);

  const handleSaveItinerary = useCallback(
    async (target: Itinerary) => {
      if (!user) return;
      const sanitized = sanitizeItineraryForFirestore(target);
      const isExisting = Boolean(target.id && target.ownerId === user.uid);
      const docId = isExisting
        ? target.id!
        : `itin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ref = doc(db, 'itineraries', docId);

      try {
        if (isExisting) {
          await updateDoc(ref, {
            ...sanitized,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerId: user.uid,
            ownerName: (user.displayName || 'Traveler').slice(0, 100),
            ...sanitized,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setItinerary((prev) =>
            prev ? { ...prev, id: docId, ownerId: user.uid, ownerName: user.displayName || 'Traveler' } : prev
          );
        }
      } catch (err) {
        handleFirestoreError(err, isExisting ? OperationType.UPDATE : OperationType.CREATE, `itineraries/${docId}`);
      }
    },
    [user]
  );

  const handleDeleteSavedItinerary = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'itineraries', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `itineraries/${id}`);
    }
  }, []);

  const handlePlayAudioGuide = useCallback(
    async (opts: {
      mode: 'guide' | 'podcast';
      title: string;
      script: string;
      stops?: ItineraryStop[];
      voiceName?: string;
    }) => {
      setAudioError(null);
      setAudioLoadingLabel(
        opts.mode === 'podcast'
          ? `Generating dual-host briefing for ${opts.title}...`
          : `Narrating audio guide for ${opts.title}...`
      );
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts),
        });
        const data = await res.json();
        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || 'Could not generate audio narration.');
        }

        const audioUrl = `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`;
        setAudioTrack({
          title: opts.title,
          subtitle: opts.mode === 'podcast' ? 'Clara & Mateo Briefing' : 'Audio Tour Guide',
          audioUrl,
          mode: opts.mode,
        });
      } catch (err: any) {
        setAudioError(err?.message || 'Audio generation failed.');
      } finally {
        setAudioLoadingLabel(null);
      }
    },
    []
  );

  const handleAddLandmarkFromPhoto = useCallback(
    (result: ImageAnalysisResult) => {
      const newStop: ItineraryStop = {
        id: `stop-photo-${Date.now()}`,
        name: result.landmarkName,
        searchQuery: result.mapsSearchQuery || `${result.landmarkName}, ${result.city}, ${result.country}`,
        timeSlot: '11:00',
        durationMinutes: Math.max(30, result.recommendedDurationMinutes || 75),
        category: result.category || 'Landmark',
        description: result.historicalContext,
        visitingTips: result.visitingTips,
        estimatedCost: 'Varies',
      };

      if (itinerary && itinerary.days.length > 0) {
        const nextDays = itinerary.days.map((d, idx) =>
          idx === 0 ? { ...d, stops: [...d.stops, newStop] } : d
        );
        setItinerary({ ...itinerary, days: nextDays });
      } else {
        setItinerary({
          title: `${result.city || result.landmarkName} Discovery`,
          destination: [result.city, result.country].filter(Boolean).join(', ') || result.landmarkName,
          travelMode: 'WALKING',
          pace: 'balanced',
          daysCount: 1,
          summary: `Curated itinerary seeded from your Landmark Photo Lens discovery of ${result.landmarkName}.`,
          days: [
            {
              dayNumber: 1,
              title: `${result.city || 'City'} Highlights`,
              theme: 'Architecture & Landmark Walk',
              stops: [newStop],
            },
          ],
          sources: [],
        });
      }
      setActiveTab('planner');
    },
    [itinerary]
  );

  const handleDraftJournalFromPhoto = useCallback(
    (result: ImageAnalysisResult, previewUrl: string) => {
      setJournalDraft({
        title: `Exploring ${result.landmarkName}`,
        location: result.city || result.landmarkName,
        country: result.country || '',
        summary: result.historicalContext,
        tips: result.visitingTips,
        imageUrl: previewUrl,
      });
      setActiveTab('journal');
    },
    []
  );

  const handleBuildItineraryFromList = useCallback(
    (destination: string, places: string[], title: string) => {
      setSeedDraft({ destination, places, title });
      setActiveTab('planner');
    },
    []
  );

  const content = (
    <div className="min-h-screen flex flex-col liquid-canvas text-slate-900 relative">
      {/* Subtle luminous refractive glow accents behind the glass layer */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-28 left-[12%] w-[34rem] h-[34rem] rounded-full bg-sky-300/30 blur-[110px]" />
        <div className="absolute top-[22%] right-[6%] w-[30rem] h-[30rem] rounded-full bg-blue-300/25 blur-[120px]" />
        <div className="absolute bottom-[-8rem] left-[32%] w-[36rem] h-[28rem] rounded-full bg-indigo-200/25 blur-[120px]" />
      </div>

      {/* Mandatory Demo Key Quota Defense Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50/85 backdrop-blur-xl border-b border-amber-200/80 text-amber-950 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Strict 3-Zone Floating iPhone Liquid Glass Top Bar */}
      <header className="sticky top-0 z-30 pt-3 px-4 sm:px-6">
        <div className="max-w-[1440px] mx-auto liquid-glass-bar rounded-[22px] px-5 sm:px-6 h-15 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('planner')}
            className="font-editorial text-xl font-semibold tracking-tight text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Wayfarer Atlas
          </button>

          {/* Zone 2: 5 clean single-line text navigation links */}
          <nav className="flex items-center gap-5 sm:gap-7 text-sm font-medium overflow-x-auto">
            {(
              [
                { id: 'planner', label: 'Planner' },
                { id: 'lens', label: 'Photo Lens' },
                { id: 'lists', label: 'Lists' },
                { id: 'journal', label: 'Journal' },
                { id: 'fractions', label: 'Fractions' },
              ] as Array<{ id: ActiveTab; label: string }>
            ).map((nav) => {
              const active = activeTab === nav.id;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => setActiveTab(nav.id)}
                  className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-[#007AFF] text-slate-950 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-950'
                  }`}
                >
                  {nav.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div ref={authMenuRef} className="relative shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => setAuthMenuOpen((v) => !v)}
                  className="liquid-btn-glass px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {(user.displayName || 'Account').split(' ')[0]}
                </button>
                {authMenuOpen && (
                  <div className="absolute right-0 mt-2.5 w-60 liquid-glass-popover rounded-[20px] p-3.5 z-40">
                    <div className="pb-2.5 mb-2.5 border-b border-slate-900/10">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {user.displayName || 'Traveler'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMenuOpen(false);
                        void signOutUser();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:text-[#DC2626] hover:bg-white/60 rounded-xl transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                className="liquid-btn-primary px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Audio Error Toast if TTS fails */}
      {audioError && (
        <div className="max-w-7xl mx-auto px-6 pt-4 w-full">
          <div className="px-4 py-3 bg-red-50/85 backdrop-blur-xl border border-red-200/90 rounded-2xl text-xs text-[#DC2626] flex items-center justify-between shadow-sm">
            <span>{audioError}</span>
            <button
              type="button"
              onClick={() => setAudioError(null)}
              className="font-semibold underline ml-4"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 pb-24">
        {activeTab === 'planner' && (
          <PlannerWorkspace
            user={user}
            itinerary={itinerary}
            savedItineraries={savedItineraries}
            onItineraryChange={setItinerary}
            onSaveItinerary={handleSaveItinerary}
            onDeleteSavedItinerary={handleDeleteSavedItinerary}
            onSignIn={handleSignIn}
            onPlayAudioGuide={handlePlayAudioGuide}
            seedDraft={seedDraft}
            onClearSeedDraft={() => setSeedDraft(null)}
            mapsStatus={mapsStatus}
            onRetryMaps={onRetryMaps}
          />
        )}

        {activeTab === 'lens' && (
          <PhotoLensView
            onAddLandmarkToItinerary={handleAddLandmarkFromPhoto}
            onDraftJournalFromPhoto={handleDraftJournalFromPhoto}
            onPlayAudioGuide={handlePlayAudioGuide}
          />
        )}

        {activeTab === 'lists' && (
          <CollaborativeListsView
            user={user}
            onSignIn={handleSignIn}
            onBuildItineraryFromList={handleBuildItineraryFromList}
          />
        )}

        {activeTab === 'journal' && (
          <TravelJournalView
            user={user}
            onSignIn={handleSignIn}
            onPlayAudioGuide={handlePlayAudioGuide}
            initialDraft={journalDraft}
            onClearInitialDraft={() => setJournalDraft(null)}
          />
        )}

        {activeTab === 'fractions' && <FractionCalculatorView />}
      </main>

      {/* Docked Audio Guide Player (iPhone Dynamic Island Liquid Glass) */}
      <AudioGuideBar
        track={audioTrack}
        loadingLabel={audioLoadingLabel}
        onClose={() => {
          setAudioTrack(null);
          setAudioLoadingLabel(null);
        }}
      />

      {/* Quiet Translucent Editorial Footer with Google Maps End User Terms Attribution */}
      <footer className="border-t border-white/60 bg-white/35 backdrop-blur-xl mt-auto">
        <div className="max-w-[1440px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <span>Wayfarer Atlas · Day-by-Day Itinerary &amp; Live Navigation Studio</span>
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="https://maps.google.com/help/terms_maps/?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-950 transition-colors"
            >
              Google Maps Terms
            </a>
            <a
              href="https://policies.google.com/privacy?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-950 transition-colors"
            >
              Google Privacy Policy
            </a>
          </div>
        </div>
      </footer>
    </div>
  );

  return content;
}

export default function App() {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
  const [mapsApiKey, setMapsApiKey] = useState<string>(envKey);
  const [configResolved, setConfigResolved] = useState<boolean>(Boolean(envKey));
  const [mapsStatus, setMapsStatus] = useState<MapsLoadStatus>('loading');

  useEffect(() => {
    if (envKey) return;
    let cancelled = false;

    const loadKey = async (attempt = 0) => {
      try {
        const res = await fetch('/api/config/maps');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          const key = String(data?.apiKey || '').trim();
          setMapsApiKey(key);
          if (!key) setMapsStatus('error');
          setConfigResolved(true);
        }
      } catch {
        if (attempt < 1 && !cancelled) {
          window.setTimeout(() => void loadKey(attempt + 1), 800);
        } else if (!cancelled) {
          setMapsStatus('error');
          setConfigResolved(true);
        }
      }
    };

    void loadKey();
    return () => {
      cancelled = true;
    };
  }, [envKey]);

  const handleRetryMaps = useCallback(() => {
    window.location.reload();
  }, []);

  if (!configResolved) {
    return (
      <div className="min-h-screen liquid-canvas flex items-center justify-center p-6">
        <div className="liquid-glass rounded-[24px] px-6 py-4 text-sm font-medium text-slate-700">
          Loading Wayfarer Atlas...
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {mapsApiKey ? (
        <APIProvider
          apiKey={mapsApiKey}
          version="weekly"
          language="en"
          region="US"
          onLoad={() => setMapsStatus('loaded')}
          onError={() => setMapsStatus('error')}
        >
          <AppShell mapsStatus={mapsStatus} onRetryMaps={handleRetryMaps} />
        </APIProvider>
      ) : (
        <AppShell mapsStatus="error" onRetryMaps={handleRetryMaps} />
      )}
    </ErrorBoundary>
  );
}
