import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldAlert, Sparkles, CheckCircle2, Wind, AlertTriangle } from 'lucide-react';
import { FocusSession, ThemeMode } from '../types';
import { playZenChime, triggerHaptic, playMinimalClick } from '../utils/audio';

interface FocusModeScreenProps {
  session: FocusSession;
  onComplete: (durationMinutes: number) => void;
  onCancel: () => void;
  theme: ThemeMode;
  soundEnabled: boolean;
}

const FOCUS_THOUGHTS = [
  "Votre attention est préservée. Posez votre téléphone écran vers le bas.",
  "La créativité émerge quand les distractions s'éteignent.",
  "Chaque minute loin de l'écran renforce votre capacité d'attention.",
  "Ce que vous faites maintenant dans le monde réel a plus de valeur qu'un flux de contenu.",
  "Respirez calmement. Rien d'urgent ne se passe sur vos applications.",
];

export const FocusModeScreen: React.FC<FocusModeScreenProps> = ({
  session,
  onComplete,
  onCancel,
  theme,
  soundEnabled,
}) => {
  const [timeLeftMs, setTimeLeftMs] = useState<number>(() =>
    Math.max(0, session.endTime - Date.now())
  );
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, session.endTime - Date.now());
      setTimeLeftMs(remaining);

      if (remaining <= 0) {
        playZenChime(soundEnabled);
        triggerHaptic(true);
        onComplete(session.durationMinutes);
      }
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [session, onComplete, soundEnabled]);

  // Rotate mindful thought every 18 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % FOCUS_THOUGHTS.length);
    }, 18000);
    return () => clearInterval(interval);
  }, []);

  const totalDurationMs = session.durationMinutes * 60 * 1000;
  const progressRatio = Math.max(0, Math.min(1, 1 - timeLeftMs / totalDurationMs));

  const totalSeconds = Math.ceil(timeLeftMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');

  const isLight = theme === 'light';
  const isEink = theme === 'eink';

  // Handle intentional 3-second hold to cancel if emergency
  const startHolding = () => {
    setHoldProgress(0);
    const start = Date.now();
    holdIntervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, (elapsed / 2500) * 100);
      setHoldProgress(pct);

      if (pct >= 100) {
        if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
        playMinimalClick(soundEnabled);
        onCancel();
      }
    }, 50);
  };

  const stopHolding = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldProgress(0);
  };

  return (
    <div
      className="w-full flex-1 flex flex-col items-center justify-between py-6 px-3 text-center animate-in fade-in duration-300"
      id="focus-mode-active-screen"
    >
      {/* Top lock indicator */}
      <div className="flex flex-col items-center gap-1.5">
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs tracking-wider border font-medium ${
            isLight
              ? 'bg-amber-100/90 border-amber-300 text-amber-900'
              : isEink
              ? 'bg-neutral-900 text-white font-bold'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Mode Concentration Actif</span>
        </div>
        <span
          className={`text-[11px] ${
            isLight ? 'text-neutral-500' : isEink ? 'text-neutral-700' : 'text-neutral-500'
          }`}
        >
          Accès aux autres applications verrouillé
        </span>
      </div>

      {/* Central circular timer display */}
      <div className="relative my-auto flex flex-col items-center justify-center p-6">
        {/* Subtle radial or circular SVG progress ring */}
        <div className="relative w-56 h-56 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="44"
              className={isLight ? 'stroke-neutral-200' : isEink ? 'stroke-neutral-300' : 'stroke-neutral-800'}
              strokeWidth="4"
              fill="transparent"
            />
            <circle
              cx="50"
              cy="50"
              r="44"
              className={isLight ? 'stroke-amber-600' : isEink ? 'stroke-neutral-900' : 'stroke-amber-400'}
              strokeWidth="4"
              strokeDasharray={276.46}
              strokeDashoffset={276.46 * (1 - progressRatio)}
              strokeLinecap="round"
              fill="transparent"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>

          {/* Time text centered */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className={`font-digital text-5xl font-light tracking-tight ${
                isLight ? 'text-neutral-900' : isEink ? 'text-neutral-950 font-bold' : 'text-neutral-100'
              }`}
            >
              <span>{formattedMinutes}</span>
              <span className="opacity-40 animate-pulse">:</span>
              <span>{formattedSeconds}</span>
            </div>
            <span
              className={`text-xs mt-1 font-medium ${
                isLight ? 'text-neutral-500' : isEink ? 'text-neutral-700' : 'text-neutral-400'
              }`}
            >
              Session {session.durationMinutes} min
            </span>
          </div>
        </div>

        {/* Breathing guide / Mindful quote */}
        <div
          className={`mt-6 max-w-xs p-3 rounded-xl border text-xs leading-relaxed transition-all ${
            isLight
              ? 'bg-neutral-50 border-neutral-200 text-neutral-700'
              : isEink
              ? 'bg-neutral-200 border-neutral-400 text-neutral-900 font-medium'
              : 'bg-[#141414] border-neutral-800 text-neutral-300'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5 mb-1.5 opacity-60">
            <Wind className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest font-semibold">Présence</span>
          </div>
          <p className="italic">"{FOCUS_THOUGHTS[quoteIndex]}"</p>
        </div>
      </div>

      {/* Bottom emergency break option with intentional friction */}
      <div className="w-full max-w-xs flex flex-col items-center gap-2 pt-2">
        {!showCancelConfirm ? (
          <button
            onClick={() => setShowCancelConfirm(true)}
            id="btn-trigger-early-unlock"
            className={`text-xs underline underline-offset-4 transition-colors cursor-pointer ${
              isLight ? 'text-neutral-400 hover:text-neutral-700' : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            Déverrouiller en cas d'urgence
          </button>
        ) : (
          <div
            className={`w-full p-3.5 rounded-xl border flex flex-col items-center gap-2.5 animate-in fade-in ${
              isLight ? 'bg-red-50/80 border-red-200' : 'bg-red-950/20 border-red-900/40'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
              <AlertTriangle className="w-4 h-4" />
              <span>Interrompre la concentration ?</span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-snug">
              Pour éviter les clics impulsifs, maintenez le bouton enfoncé pendant 3 secondes :
            </p>

            <button
              onMouseDown={startHolding}
              onMouseUp={stopHolding}
              onMouseLeave={stopHolding}
              onTouchStart={startHolding}
              onTouchEnd={stopHolding}
              id="btn-hold-to-cancel-focus"
              className="relative overflow-hidden w-full py-2.5 px-3 rounded-lg bg-red-600/20 border border-red-500/40 text-red-300 font-medium text-xs select-none active:scale-95 transition cursor-pointer"
            >
              {/* Filling progress bar */}
              <div
                className="absolute inset-0 bg-red-600/60 transition-all pointer-events-none"
                style={{ width: `${holdProgress}%` }}
              />
              <span className="relative z-10">
                {holdProgress > 0 ? `Maintenez... ${Math.round(holdProgress)}%` : 'Maintenir 3s pour déverrouiller'}
              </span>
            </button>

            <button
              onClick={() => setShowCancelConfirm(false)}
              className="text-[11px] text-neutral-400 hover:text-neutral-200 mt-1 cursor-pointer"
            >
              Garder la concentration active
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
