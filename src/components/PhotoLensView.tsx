import React, { useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Compass,
  Loader2,
  MapPin,
  PenLine,
  Plus,
  Upload,
  Volume2,
} from 'lucide-react';
import type { ImageAnalysisResult } from '../types';

const SAMPLE_PHOTOS = [
  {
    label: 'Kyoto Temple Lane',
    src: '/src/assets/images/exp_kyoto_temple_1795096393382.jpg',
  },
  {
    label: 'Italian Coastal Loggia',
    src: '/src/assets/images/exp_amalfi_coast_1795096409111.jpg',
  },
  {
    label: 'Lisbon Tile Street',
    src: '/src/assets/images/exp_lisbon_alley_1795096384508.jpg',
  },
];

interface PhotoLensViewProps {
  onAddLandmarkToItinerary: (result: ImageAnalysisResult) => void;
  onDraftJournalFromPhoto: (result: ImageAnalysisResult, previewUrl: string) => void;
  onPlayAudioGuide: (opts: { mode: 'guide'; title: string; script: string }) => Promise<void>;
}

export function PhotoLensView({
  onAddLandmarkToItinerary,
  onDraftJournalFromPhoto,
  onPlayAudioGuide,
}: PhotoLensViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [question, setQuestion] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageAnalysisResult | null>(null);
  const [addedConfirm, setAddedConfirm] = useState(false);

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid JPEG, PNG, or WebP photograph.');
      return;
    }
    setError(null);
    setResult(null);
    setAddedConfirm(false);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx !== -1) {
        setPreviewUrl(dataUrl);
        setImageBase64(dataUrl.slice(commaIdx + 1));
        setMimeType(file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLoadSample = async (sampleSrc: string) => {
    setError(null);
    setResult(null);
    setAddedConfirm(false);
    try {
      const res = await fetch(sampleSrc);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx !== -1) {
          setPreviewUrl(sampleSrc);
          setImageBase64(dataUrl.slice(commaIdx + 1));
          setMimeType(blob.type || 'image/jpeg');
        }
      };
      reader.readAsDataURL(blob);
    } catch {
      setError('Could not load sample photograph.');
    }
  };

  const handleAnalyze = async () => {
    if (!imageBase64) {
      setError('Upload a travel photograph or pick a sample scene first.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    setAddedConfirm(false);
    try {
      const res = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          question: question.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image analysis failed.');
      setResult(data as ImageAnalysisResult);
    } catch (err: any) {
      setError(err?.message || 'Unable to analyze this image right now.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="max-w-2xl mb-8">
        <p className="text-xs font-semibold text-[#007AFF] mb-2">
          Visual landmark recognition · Architectural &amp; cultural context
        </p>
        <h1 className="text-3xl font-semibold text-slate-950 tracking-tight">
          Landmark Photo Lens
        </h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Upload any photograph of a monument, streetscape, museum artwork, or viewpoint. Identify the place, uncover its architectural story, listen to a narrated audio brief, or drop it straight into your itinerary.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Upload & Controls */}
        <div className="lg:col-span-6 liquid-glass rounded-[28px] p-6 space-y-5">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileChange(e.dataTransfer.files?.[0] || null);
            }}
            className="border border-dashed border-slate-400/50 hover:border-[#007AFF] rounded-[20px] overflow-hidden bg-white/45 backdrop-blur-md transition-colors"
          >
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Uploaded travel photograph preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-72 object-cover"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-3.5 right-3.5 liquid-glass-popover px-3.5 py-1.5 text-xs font-semibold text-slate-900 rounded-full hover:bg-white transition-colors cursor-pointer"
                >
                  Change Photo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-72 flex flex-col items-center justify-center p-6 text-center cursor-pointer"
              >
                <div className="w-12 h-12 rounded-2xl liquid-glass-popover flex items-center justify-center text-[#007AFF] mb-3.5">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  Drop a travel photo here or browse files
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Supports JPEG, PNG, and WebP photographs up to 12 MB
                </p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
              className="hidden"
            />
          </div>

          {/* Sample Photos Strip */}
          <div>
            <div className="text-xs font-medium text-slate-600 mb-2">
              Or test with a sample scene:
            </div>
            <div className="grid grid-cols-3 gap-3">
              {SAMPLE_PHOTOS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => void handleLoadSample(sample.src)}
                  className="text-left group liquid-glass-subtle liquid-card-interactive rounded-2xl overflow-hidden cursor-pointer"
                >
                  <img
                    src={sample.src}
                    alt={sample.label}
                    referrerPolicy="no-referrer"
                    className="w-full h-16 object-cover"
                  />
                  <div className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 group-hover:text-[#007AFF] truncate">
                    {sample.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5">
              Ask a specific question about this photo (optional)
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What architectural period is this facade from and what is nearby?"
              className="w-full px-3.5 py-2.5 text-sm liquid-glass-input rounded-2xl text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50/85 backdrop-blur-md border border-red-200/90 rounded-2xl text-xs text-[#DC2626]">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={analyzing || !imageBase64}
            onClick={() => void handleAnalyze()}
            className="w-full liquid-btn-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:opacity-50 rounded-full cursor-pointer"
          >
            {analyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing Landmark Photograph...
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                Analyze Photo
              </>
            )}
          </button>
        </div>

        {/* Right: Structured Analysis Dossier */}
        <div className="lg:col-span-6 liquid-glass rounded-[28px] p-6 min-h-[460px]">
          {analyzing ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center">
              <Loader2 className="w-7 h-7 text-[#007AFF] animate-spin mb-3" />
              <p className="text-sm font-semibold text-slate-900">Inspecting architectural and visual cues...</p>
              <p className="text-xs text-slate-500 mt-1">
                Identifying location, historical context, and visitor recommendations.
              </p>
            </div>
          ) : result ? (
            <div className="space-y-5">
              <div className="pb-4 border-b border-slate-900/10">
                <div className="text-xs text-slate-500">
                  {result.category} · {result.architecturalEra} · Confidence: {result.confidence}
                </div>
                <h2 className="text-2xl font-semibold text-slate-950 mt-1">
                  {result.landmarkName}
                </h2>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-600">
                  <MapPin className="w-3.5 h-3.5 text-[#007AFF]" />
                  <span>
                    {result.city}, {result.country}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Recommended visit: {result.recommendedDurationMinutes} min
                  </span>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-1.5">
                  Historical &amp; Cultural Story
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {result.historicalContext}
                </p>
              </div>

              {result.highlights.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-900 mb-2">
                    Visual Details Spotted
                  </h3>
                  <ul className="space-y-1.5 text-sm text-slate-700">
                    {result.highlights.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="font-mono text-xs text-[#007AFF] mt-0.5 tabular-nums font-semibold">
                          0{idx + 1}.
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-4 liquid-glass-subtle rounded-2xl">
                <h3 className="text-xs font-semibold text-slate-900 mb-1">
                  Visitor &amp; Photography Guidance
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">{result.visitingTips}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onAddLandmarkToItinerary(result);
                    setAddedConfirm(true);
                  }}
                  className="liquid-btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {addedConfirm ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Added to Itinerary
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Add to Itinerary
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void onPlayAudioGuide({
                      mode: 'guide',
                      title: result.landmarkName,
                      script: `${result.landmarkName} in ${result.city}, ${result.country}. ${result.historicalContext} Visitor tip: ${result.visitingTips}`,
                    })
                  }
                  className="liquid-btn-glass inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5 text-[#007AFF]" />
                  Listen to Audio Story
                </button>

                <button
                  type="button"
                  onClick={() => onDraftJournalFromPhoto(result, previewUrl || SAMPLE_PHOTOS[0].src)}
                  className="liquid-btn-glass inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PenLine className="w-3.5 h-3.5 text-slate-600" />
                  Share in Journal
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center px-6">
              <div className="w-12 h-12 rounded-2xl liquid-glass-subtle flex items-center justify-center text-slate-400 mb-3.5">
                <Compass className="w-6 h-6" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                Ready to inspect a travel photograph
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
                Upload a photo on the left or choose one of the editorial sample scenes, then select Analyze Photo to unlock architectural insights and instant itinerary integration.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
