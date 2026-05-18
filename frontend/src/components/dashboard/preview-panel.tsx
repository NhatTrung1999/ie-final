import { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import type { StageItem } from '@/types/dashboard';

export type PreviewPlaybackState = {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
};

export type PreviewPlaybackRequest =
  | { type: 'play'; token: number }
  | { type: 'pause'; token: number }
  | { type: 'seek'; token: number; time: number };

type PreviewPanelProps = {
  selectedItem?: StageItem;
  playbackRequest?: PreviewPlaybackRequest | null;
  onPlaybackStateChange?: (state: PreviewPlaybackState) => void;
};

export function PreviewPanel({
  selectedItem,
  playbackRequest,
  onPlaybackStateChange,
}: PreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const hasVideo = Boolean(selectedItem?.videoUrl);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    setCurrentTime(current);
  };

  useEffect(() => {
    if (!isPlaying || !videoRef.current) {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const syncPlayback = () => {
      if (!videoRef.current) {
        return;
      }

      const current = videoRef.current.currentTime;
      setCurrentTime(current);
      animationFrameRef.current = window.requestAnimationFrame(syncPlayback);
    };

    animationFrameRef.current = window.requestAnimationFrame(syncPlayback);

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying]);

  const lastRequestTokenRef = useRef<number | null>(null);

  useEffect(() => {
    onPlaybackStateChange?.({
      currentTime,
      duration,
      isPlaying,
    });
  }, [currentTime, duration, isPlaying, onPlaybackStateChange]);

  useEffect(() => {
    if (!videoRef.current || !playbackRequest || !hasVideo) {
      return;
    }

    if (lastRequestTokenRef.current === playbackRequest.token) {
      return;
    }

    lastRequestTokenRef.current = playbackRequest.token;

    if (playbackRequest.type === 'play') {
      void videoRef.current.play();
      return;
    }

    if (playbackRequest.type === 'pause') {
      videoRef.current.pause();
      return;
    }

    videoRef.current.currentTime = Math.max(0, Math.min(playbackRequest.time, duration || 0));
    setCurrentTime(videoRef.current.currentTime);
  }, [duration, hasVideo, playbackRequest]);

  useEffect(() => {
    if (!hasVideo) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [hasVideo, selectedItem?.id]);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.muted = true;
    videoRef.current.defaultMuted = true;
    videoRef.current.volume = 0;
  }, [selectedItem?.id, hasVideo]);

  return (
    <div className="relative min-h-[300px] overflow-hidden bg-[#0a0a0a] md:min-h-[360px] lg:h-[62%] lg:min-h-0">
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        src={selectedItem?.videoUrl}
        muted
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {!hasVideo ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-20 w-20 rounded-full border border-white/5 animate-ping md:h-24 md:w-24" />
            <div className="absolute h-14 w-14 rounded-full border border-white/5 md:h-16 md:w-16" />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur md:h-14 md:w-14">
              <Film className="h-5 w-5 text-white/20 md:h-6 md:w-6" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-white/30 uppercase md:text-[12px]">
              No video selected
            </p>
            <p className="text-[10px] text-white/15">
              Select a stage from the list to play
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
