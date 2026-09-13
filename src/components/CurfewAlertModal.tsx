import React from 'react';
import { Moon, Smartphone, Power, Clock, Check } from 'lucide-react';
import { ThemeMode } from '../types';
import { playMinimalClick, playBedtimeChime, triggerBedtimeHaptic } from '../utils/audio';

interface CurfewAlertModalProps {
  isOpen: boolean;
  timeStr: string;
  message: string;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
  theme: ThemeMode;
  soundEnabled: boolean;
}

export const CurfewAlertModal: React.FC<CurfewAlertModalProps> = ({
  isOpen,
  timeStr,
  message,
  onDismiss,
  onSnooze,
  theme,
  soundEnabled,
}) => {
  if (!isOpen) return null;

  const isLight = theme === 'light';
  const isEink = theme === 'eink';

  const handleTurnOff = () => {
    playBedtimeChime(soundEnabled);
    triggerBedtimeHaptic(true);
    onDismiss();
  };

  const handleSnooze = () => {
    playMinimalClick(soundEnabled);
    onSnooze(15);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      id="modal-curfew-alert"
    >
      <div
        className={`w-full max-w-sm rounded-3xl p-6 border flex flex-col items-center text-center shadow-2xl relative ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-900'
            : isEink
            ? 'bg-[#dedcd4] border-neutral-900 text-neutral-950'
            : 'bg-[#121213] border-neutral-800 text-neutral-100'
        }`}
      >
        {/* Soft pulsing moon icon */}
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all ${
            isLight
              ? 'bg-amber-100 text-amber-600'
              : isEink
              ? 'bg-neutral-300 text-neutral-900'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}
        >
          <Moon className="w-8 h-8 animate-pulse" />
        </div>

        <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-500 mb-1">
          Rappel Déconnexion ({timeStr})
        </span>

        <h3 className="text-xl font-semibold tracking-tight mb-2">
          Il est l'heure de lâcher votre téléphone
        </h3>

        <p
          className={`text-xs mb-6 max-w-xs leading-relaxed ${
            isLight ? 'text-neutral-600' : isEink ? 'text-neutral-700' : 'text-neutral-300'
          }`}
        >
          {message ||
            "Vous avez atteint votre heure de déconnexion. Accordez à vos yeux et à votre esprit un repos bien mérité."}
        </p>

        {/* Action buttons */}
        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={handleTurnOff}
            id="btn-curfew-turn-off"
            className={`w-full py-3.5 px-4 rounded-2xl font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
              isLight
                ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                : isEink
                ? 'bg-neutral-900 text-white font-bold'
                : 'bg-amber-500 text-black font-semibold hover:bg-amber-400'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>Je pose mon téléphone & j'éteins l'écran</span>
          </button>

          <button
            onClick={handleSnooze}
            id="btn-curfew-snooze"
            className={`w-full py-2.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isLight
                ? 'border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                : isEink
                ? 'border border-neutral-400 text-neutral-800'
                : 'border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Rappeler dans 15 minutes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
