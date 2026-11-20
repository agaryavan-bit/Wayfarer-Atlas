import React, { useEffect, useRef, useState } from 'react';
import { Download, Headphones, Loader2, Pause, Play, Volume2, X } from 'lucide-react';

export interface AudioGuideTrack {
  title: string;
  subtitle: string;
  audioUrl: string;
  mode: 'guide' | 'podcast';
}

interface AudioGuideBarProps {
  track: AudioGuideTrack | null;
  loadingLabel: string | null;
  onClose: () => void;
}

export function AudioGuideBar({ track, loadingLabel, onClose }: AudioGuideBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [track]);

  if (!track && !loadingLabel) return null;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl liquid-glass-dark text-white rounded-[26px] px-4 py-3">
      {loadingLabel ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
            <div className="text-sm font-medium truncate">{loadingLabel}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audio player"
            className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : track ? (
        <div className="flex items-center gap-3.5">
          <audio
            ref={audioRef}
            src={track.audioUrl}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => setIsPlaying(false)}
          />

          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause audio guide' : 'Play audio guide'}
            className="w-10 h-10 rounded-full liquid-btn-primary flex items-center justify-center shrink-0 cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {track.mode === 'podcast' ? (
                  <Headphones className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                )}
                <span className="text-sm font-medium truncate">{track.title}</span>
              </div>
              <span className="text-xs font-mono tabular-nums text-white/65 shrink-0">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (audioRef.current) audioRef.current.currentTime = val;
                  setCurrentTime(val);
                }}
                aria-label="Seek audio guide"
                className="w-full h-1.5 accent-[#0A84FF] bg-white/20 rounded-full cursor-pointer"
              />
            </div>
          </div>

          <a
            href={track.audioUrl}
            download={`${track.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wav`}
            aria-label="Download audio WAV"
            className="p-2 rounded-full text-white/75 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <Download className="w-4 h-4" />
          </a>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close audio player"
            className="p-2 rounded-full text-white/65 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
