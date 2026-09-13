import React, { useState } from 'react';
import {
  X,
  Moon,
  Bell,
  Clock,
  Calendar,
  Volume2,
  Smartphone,
  Check,
  AlertCircle,
  Sparkles,
  Sun,
  Coffee,
  CalendarDays,
  Sliders,
} from 'lucide-react';
import {
  DisconnectReminderSettings,
  DisconnectScheduleMode,
  DaySpecificSchedule,
  ThemeMode,
} from '../types';
import { playMinimalClick } from '../utils/audio';
import {
  DAYS_OF_WEEK,
  DISCONNECT_MESSAGES,
  getNotificationPermissionStatus,
  requestPhoneNotificationPermission,
  triggerDisconnectAlert,
  getScheduledTimeForDay,
  getScheduledTimeForToday,
} from '../utils/notifications';

interface DisconnectReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DisconnectReminderSettings;
  onSave: (newSettings: DisconnectReminderSettings) => void;
  theme: ThemeMode;
  soundEnabled: boolean;
}

export const DisconnectReminderModal: React.FC<DisconnectReminderModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
  theme,
  soundEnabled,
}) => {
  // Ensure default fallback structure
  const getNormalizedSettings = (s: DisconnectReminderSettings): DisconnectReminderSettings => ({
    ...s,
    scheduleMode: s.scheduleMode || 'weekdays_weekend',
    weekdayTime: s.weekdayTime || '21:30',
    weekendTime: s.weekendTime || '23:00',
    dayTimes: s.dayTimes || {
      1: { enabled: true, time: '21:30' },
      2: { enabled: true, time: '21:30' },
      3: { enabled: true, time: '21:30' },
      4: { enabled: true, time: '21:30' },
      5: { enabled: true, time: '22:30' },
      6: { enabled: true, time: '23:00' },
      0: { enabled: true, time: '22:00' },
    },
  });

  const [localSettings, setLocalSettings] = useState<DisconnectReminderSettings>(() =>
    getNormalizedSettings(settings)
  );
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | 'unsupported'>(
    getNotificationPermissionStatus()
  );
  const [testSent, setTestSent] = useState(false);

  // Sync state on open
  React.useEffect(() => {
    if (isOpen) {
      setLocalSettings(getNormalizedSettings(settings));
      setPermissionStatus(getNotificationPermissionStatus());
      setTestSent(false);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const isLight = theme === 'light';
  const isEink = theme === 'eink';
  const activeMode: DisconnectScheduleMode = localSettings.scheduleMode || 'weekdays_weekend';
  const todayDayIndex = new Date().getDay();
  const todaySchedule = getScheduledTimeForToday(localSettings);

  const updateSettings = (updated: DisconnectReminderSettings) => {
    setLocalSettings(updated);
    onSave(updated);
  };

  const handleToggleEnable = () => {
    playMinimalClick(soundEnabled);
    const updated = { ...localSettings, enabled: !localSettings.enabled };
    updateSettings(updated);

    // If enabling and notifications not yet granted, proactively ask
    if (updated.enabled && permissionStatus !== 'granted') {
      handleRequestPermission();
    }
  };

  const handleModeChange = (mode: DisconnectScheduleMode) => {
    playMinimalClick(soundEnabled);
    const updated = { ...localSettings, scheduleMode: mode };
    updateSettings(updated);
  };

  const handleUnifiedTimeChange = (newTime: string) => {
    const updated = { ...localSettings, time: newTime };
    updateSettings(updated);
  };

  const handleWeekdayTimeChange = (newTime: string) => {
    const updated = {
      ...localSettings,
      weekdayTime: newTime,
      // If dayTimes exists, keep weekdays synchronized
      dayTimes: {
        ...(localSettings.dayTimes || {}),
        1: { enabled: localSettings.dayTimes?.[1]?.enabled ?? true, time: newTime },
        2: { enabled: localSettings.dayTimes?.[2]?.enabled ?? true, time: newTime },
        3: { enabled: localSettings.dayTimes?.[3]?.enabled ?? true, time: newTime },
        4: { enabled: localSettings.dayTimes?.[4]?.enabled ?? true, time: newTime },
        5: { enabled: localSettings.dayTimes?.[5]?.enabled ?? true, time: newTime },
      },
    };
    updateSettings(updated);
  };

  const handleWeekendTimeChange = (newTime: string) => {
    const updated = {
      ...localSettings,
      weekendTime: newTime,
      dayTimes: {
        ...(localSettings.dayTimes || {}),
        6: { enabled: localSettings.dayTimes?.[6]?.enabled ?? true, time: newTime },
        0: { enabled: localSettings.dayTimes?.[0]?.enabled ?? true, time: newTime },
      },
    };
    updateSettings(updated);
  };

  const handleDaySpecificTimeChange = (dayId: number, newTime: string) => {
    const currentDayConfig = localSettings.dayTimes?.[dayId] || { enabled: true, time: '21:30' };
    const updated = {
      ...localSettings,
      dayTimes: {
        ...(localSettings.dayTimes || {}),
        [dayId]: {
          ...currentDayConfig,
          time: newTime,
        },
      },
    };
    updateSettings(updated);
  };

  const handleDaySpecificToggle = (dayId: number) => {
    playMinimalClick(soundEnabled);
    const currentDayConfig = localSettings.dayTimes?.[dayId] || { enabled: true, time: '21:30' };
    const updated = {
      ...localSettings,
      dayTimes: {
        ...(localSettings.dayTimes || {}),
        [dayId]: {
          ...currentDayConfig,
          enabled: !currentDayConfig.enabled,
        },
      },
      // Also update general days array
      days: currentDayConfig.enabled
        ? localSettings.days.filter((d) => d !== dayId)
        : [...localSettings.days, dayId],
    };
    updateSettings(updated);
  };

  const handleToggleDay = (dayId: number) => {
    playMinimalClick(soundEnabled);
    let newDays: number[];
    if (localSettings.days.includes(dayId)) {
      if (localSettings.days.length <= 1) return; // Keep at least 1 day
      newDays = localSettings.days.filter((d) => d !== dayId);
    } else {
      newDays = [...localSettings.days, dayId];
    }
    const updated = { ...localSettings, days: newDays };
    updateSettings(updated);
  };

  const handleSelectPresetDays = (type: 'all' | 'weekdays' | 'weekend') => {
    playMinimalClick(soundEnabled);
    let newDays: number[];
    if (type === 'all') {
      newDays = [1, 2, 3, 4, 5, 6, 0];
    } else if (type === 'weekdays') {
      newDays = [1, 2, 3, 4, 5];
    } else {
      newDays = [6, 0];
    }
    const updated = { ...localSettings, days: newDays };
    updateSettings(updated);
  };

  const handleRepeatChange = (interval: number) => {
    playMinimalClick(soundEnabled);
    const updated = { ...localSettings, repeatIntervalMinutes: interval };
    updateSettings(updated);
  };

  const handleRequestPermission = async () => {
    playMinimalClick(soundEnabled);
    const granted = await requestPhoneNotificationPermission();
    setPermissionStatus(granted ? 'granted' : 'denied');
  };

  const handleSendTestNotification = async () => {
    playMinimalClick(soundEnabled);
    setTestSent(true);

    // If not granted yet, ask first
    if (permissionStatus !== 'granted') {
      const granted = await requestPhoneNotificationPermission();
      setPermissionStatus(granted ? 'granted' : 'denied');
      if (!granted) {
        await triggerDisconnectAlert(
          localSettings.customMessage || DISCONNECT_MESSAGES[0],
          localSettings.soundAlert,
          localSettings.vibrateAlert
        );
        setTimeout(() => setTestSent(false), 3000);
        return;
      }
    }

    await triggerDisconnectAlert(
      localSettings.customMessage || DISCONNECT_MESSAGES[0],
      localSettings.soundAlert,
      localSettings.vibrateAlert
    );

    setTimeout(() => setTestSent(false), 3000);
  };

  const WEEKDAY_TIMES = ['20:30', '21:00', '21:30', '22:00'];
  const WEEKEND_TIMES = ['22:00', '22:30', '23:00', '23:30', '00:00'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      id="modal-disconnect-reminders"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-3xl p-5 border flex flex-col gap-4 text-left shadow-2xl relative ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-900'
            : isEink
            ? 'bg-[#dedcd4] border-neutral-900 text-neutral-950'
            : 'bg-[#121213] border-neutral-800 text-neutral-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800/40">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/10 text-amber-400'
              }`}
            >
              <Moon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Rappels Déconnexion</h3>
              <p className="text-[11px] text-neutral-400">Heures adaptées selon le jour de la semaine</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              isLight ? 'hover:bg-neutral-100 text-neutral-500' : 'hover:bg-neutral-800 text-neutral-400'
            }`}
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master activation switch */}
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between transition-colors ${
            localSettings.enabled
              ? isLight
                ? 'bg-amber-50/70 border-amber-200'
                : 'bg-amber-500/10 border-amber-500/30'
              : isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-900/40 border-neutral-800'
          }`}
        >
          <div className="pr-3">
            <span className="text-xs font-semibold block">Activer les notifications du soir</span>
            <span className="text-[11px] text-neutral-400 block mt-0.5">
              Envoie une notification sur votre téléphone pour poser l'appareil.
            </span>
          </div>
          <button
            onClick={handleToggleEnable}
            id="btn-toggle-disconnect-reminder"
            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
              localSettings.enabled ? 'bg-amber-500' : 'bg-neutral-700'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                localSettings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Mode Selector Tabs (Semaine vs Week-end / Par jour / Même heure) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5" />
            <span>Mode d'horaires</span>
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-neutral-800/40 border border-neutral-800 text-xs">
            <button
              onClick={() => handleModeChange('weekdays_weekend')}
              className={`py-1.5 px-2 rounded-lg font-medium text-center transition-all cursor-pointer ${
                activeMode === 'weekdays_weekend'
                  ? 'bg-amber-500 text-black shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Semaine / WE
            </button>
            <button
              onClick={() => handleModeChange('custom_days')}
              className={`py-1.5 px-2 rounded-lg font-medium text-center transition-all cursor-pointer ${
                activeMode === 'custom_days'
                  ? 'bg-amber-500 text-black shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Chaque jour
            </button>
            <button
              onClick={() => handleModeChange('unified')}
              className={`py-1.5 px-2 rounded-lg font-medium text-center transition-all cursor-pointer ${
                activeMode === 'unified'
                  ? 'bg-amber-500 text-black shadow-xs font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Même heure
            </button>
          </div>
        </div>

        {/* Overview banner of the current day schedule */}
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
            todaySchedule.enabled
              ? 'bg-amber-500/5 border-amber-500/20 text-amber-300'
              : 'bg-neutral-900/50 border-neutral-800 text-neutral-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Aujourd'hui :{' '}
              <strong className="font-semibold text-white">
                {todaySchedule.enabled ? todaySchedule.time : 'Pas de rappel'}
              </strong>
            </span>
          </div>
          <span className="text-[10px] text-neutral-400 uppercase tracking-wider">
            {DAYS_OF_WEEK.find((d) => d.id === todayDayIndex)?.label}
          </span>
        </div>

        {/* 1. CONFIGURATION MODE: SEMAINE & WEEK-END */}
        {activeMode === 'weekdays_weekend' && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-150">
            {/* Weekdays (Lun - Ven) */}
            <div
              className={`p-3.5 rounded-2xl border flex flex-col gap-2.5 ${
                isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900/50 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-semibold">En semaine (Lundi – Vendredi)</span>
                </div>
                <span className="text-[11px] text-amber-400 font-mono font-medium">
                  {localSettings.weekdayTime || '21:30'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={localSettings.weekdayTime || '21:30'}
                  onChange={(e) => handleWeekdayTimeChange(e.target.value)}
                  className={`text-2xl font-mono font-medium px-3.5 py-1.5 rounded-xl border text-center outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-900'
                      : 'bg-neutral-900 border-neutral-700 text-white'
                  }`}
                />
                <span className="text-[11px] text-neutral-400 leading-tight">
                  Plus tôt pour favoriser le sommeil avant une journée active.
                </span>
              </div>

              {/* Quick time pills for weekdays */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {WEEKDAY_TIMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleWeekdayTimeChange(t)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                      localSettings.weekdayTime === t
                        ? 'bg-amber-500 text-black font-semibold'
                        : isLight
                        ? 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                        : 'bg-neutral-800 text-neutral-300 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Weekend (Sam - Dim) */}
            <div
              className={`p-3.5 rounded-2xl border flex flex-col gap-2.5 ${
                isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900/50 border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold">Fin de semaine (Samedi & Dimanche)</span>
                </div>
                <span className="text-[11px] text-amber-400 font-mono font-medium">
                  {localSettings.weekendTime || '23:00'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={localSettings.weekendTime || '23:00'}
                  onChange={(e) => handleWeekendTimeChange(e.target.value)}
                  className={`text-2xl font-mono font-medium px-3.5 py-1.5 rounded-xl border text-center outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLight
                      ? 'bg-white border-neutral-300 text-neutral-900'
                      : 'bg-neutral-900 border-neutral-700 text-white'
                  }`}
                />
                <span className="text-[11px] text-neutral-400 leading-tight">
                  Plus tard le week-end pour profiter de vos soirées détendues.
                </span>
              </div>

              {/* Quick time pills for weekend */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {WEEKEND_TIMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleWeekendTimeChange(t)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                      localSettings.weekendTime === t
                        ? 'bg-amber-500 text-black font-semibold'
                        : isLight
                        ? 'bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100'
                        : 'bg-neutral-800 text-neutral-300 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Active days toggles (which days of week to send) */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Jours avec rappels</span>
                </label>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    onClick={() => handleSelectPresetDays('all')}
                    className="px-1.5 py-0.5 rounded text-neutral-400 hover:text-amber-400 transition cursor-pointer"
                  >
                    Tous
                  </button>
                  <span className="text-neutral-600">•</span>
                  <button
                    onClick={() => handleSelectPresetDays('weekdays')}
                    className="px-1.5 py-0.5 rounded text-neutral-400 hover:text-amber-400 transition cursor-pointer"
                  >
                    Semaine
                  </button>
                  <span className="text-neutral-600">•</span>
                  <button
                    onClick={() => handleSelectPresetDays('weekend')}
                    className="px-1.5 py-0.5 rounded text-neutral-400 hover:text-amber-400 transition cursor-pointer"
                  >
                    Week-end
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = localSettings.days.includes(day.id);
                  const isToday = day.id === todayDayIndex;
                  return (
                    <button
                      key={day.id}
                      onClick={() => handleToggleDay(day.id)}
                      className={`py-2 rounded-xl text-xs font-medium flex flex-col items-center justify-center transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-amber-500 text-black font-bold shadow-xs'
                          : isLight
                          ? 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                          : 'bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800'
                      }`}
                      title={day.label}
                    >
                      <span className="text-[11px]">{day.short}</span>
                      {isToday && (
                        <div
                          className={`w-1 h-1 rounded-full mt-0.5 ${
                            isSelected ? 'bg-black' : 'bg-amber-400'
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 2. CONFIGURATION MODE: CHAQUE JOUR (Custom schedule for all 7 days) */}
        {activeMode === 'custom_days' && (
          <div className="flex flex-col gap-2.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Heure spécifique par jour</span>
              </label>
              <span className="text-[10px] text-neutral-500">7 jours configurables</span>
            </div>

            <div className="flex flex-col gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const dayConfig = localSettings.dayTimes?.[day.id] || {
                  enabled: true,
                  time: day.isWeekend ? '23:00' : '21:30',
                };
                const isToday = day.id === todayDayIndex;

                return (
                  <div
                    key={day.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition-colors ${
                      dayConfig.enabled
                        ? isLight
                          ? 'bg-white border-neutral-200'
                          : 'bg-neutral-900/60 border-neutral-800'
                        : isLight
                        ? 'bg-neutral-100/60 border-neutral-200 opacity-60'
                        : 'bg-neutral-950/40 border-neutral-900 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDaySpecificToggle(day.id)}
                        className={`w-5 h-5 rounded-md flex items-center justify-center text-xs transition-colors cursor-pointer ${
                          dayConfig.enabled
                            ? 'bg-amber-500 text-black font-bold'
                            : 'bg-neutral-800 text-neutral-500 border border-neutral-700'
                        }`}
                        title={dayConfig.enabled ? 'Désactiver ce jour' : 'Activer ce jour'}
                      >
                        {dayConfig.enabled && <Check className="w-3.5 h-3.5" />}
                      </button>

                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-semibold ${
                              dayConfig.enabled ? 'text-neutral-200' : 'text-neutral-500'
                            }`}
                          >
                            {day.label}
                          </span>
                          {isToday && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-400 font-medium">
                              Aujourd'hui
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-neutral-500">
                          {day.isWeekend ? 'Fin de semaine' : 'Semaine'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={dayConfig.time}
                        disabled={!dayConfig.enabled}
                        onChange={(e) => handleDaySpecificTimeChange(day.id, e.target.value)}
                        className={`text-xs font-mono font-semibold px-2 py-1 rounded-lg border text-center outline-none focus:ring-1 focus:ring-amber-500 ${
                          dayConfig.enabled
                            ? isLight
                              ? 'bg-white border-neutral-300 text-neutral-900'
                              : 'bg-neutral-800 border-neutral-700 text-white'
                            : 'bg-transparent border-transparent text-neutral-600'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. CONFIGURATION MODE: MEME HEURE (Unified) */}
        {activeMode === 'unified' && (
          <div className="flex flex-col gap-3 animate-in fade-in duration-150">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Heure unique pour tous les jours</span>
              </label>

              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={localSettings.time || '21:30'}
                  onChange={(e) => handleUnifiedTimeChange(e.target.value)}
                  className={`text-2xl font-mono font-medium px-4 py-2.5 rounded-xl border text-center outline-none focus:ring-1 focus:ring-amber-500 ${
                    isLight
                      ? 'bg-neutral-50 border-neutral-300 text-neutral-900'
                      : 'bg-neutral-900 border-neutral-700 text-white'
                  }`}
                />
                <span className="text-xs text-neutral-400 leading-tight">
                  Cette heure s'appliquera chaque jour où les rappels sont activés.
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-1">
                {['20:30', '21:00', '21:30', '22:00', '22:30', '23:00'].map((timeOption) => (
                  <button
                    key={timeOption}
                    onClick={() => handleUnifiedTimeChange(timeOption)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                      localSettings.time === timeOption
                        ? 'bg-amber-500 text-black font-semibold shadow-xs'
                        : isLight
                        ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        : 'bg-neutral-800/80 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {timeOption}
                  </button>
                ))}
              </div>
            </div>

            {/* Days selector */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Quels jours ?</span>
                </label>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    onClick={() => handleSelectPresetDays('all')}
                    className="px-1.5 py-0.5 rounded text-neutral-400 hover:text-amber-400 transition"
                  >
                    Tous
                  </button>
                  <span className="text-neutral-600">•</span>
                  <button
                    onClick={() => handleSelectPresetDays('weekdays')}
                    className="px-1.5 py-0.5 rounded text-neutral-400 hover:text-amber-400 transition"
                  >
                    Semaine
                  </button>
                  <span className="text-neutral-600">•</span>
                  <button
                    onClick={() => handleSelectPresetDays('weekend')}
                    className="px-1.5 py-0.5 rounded text-neutral-400 hover:text-amber-400 transition"
                  >
                    Week-end
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = localSettings.days.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      onClick={() => handleToggleDay(day.id)}
                      className={`py-2 rounded-xl text-xs font-medium flex flex-col items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500 text-black font-bold shadow-xs'
                          : isLight
                          ? 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                          : 'bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800'
                      }`}
                      title={day.label}
                    >
                      <span className="text-[11px]">{day.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 7-day schedule summary pill row */}
        <div className="p-2.5 rounded-xl border border-neutral-800 bg-neutral-900/30 flex flex-col gap-1.5">
          <span className="text-[10px] text-neutral-400 font-semibold uppercase tracking-wider">
            Récapitulatif de votre semaine :
          </span>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAYS_OF_WEEK.map((d) => {
              const schedule = getScheduledTimeForDay(localSettings, d.id);
              const isToday = d.id === todayDayIndex;
              return (
                <div
                  key={d.id}
                  className={`py-1 px-0.5 rounded-lg text-[10px] flex flex-col items-center ${
                    isToday
                      ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40'
                      : schedule.enabled
                      ? 'text-neutral-300'
                      : 'text-neutral-600'
                  }`}
                >
                  <span className="text-[9px] uppercase">{d.short}</span>
                  <span className="font-mono text-[10px]">
                    {schedule.enabled ? schedule.time : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Repetition options */}
        <div className="flex flex-col gap-1.5 pt-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
            Répétition si l'écran reste allumé
          </label>
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {[
              { val: 0, label: 'Une fois' },
              { val: 15, label: 'Toutes les 15m' },
              { val: 30, label: 'Toutes les 30m' },
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => handleRepeatChange(item.val)}
                className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                  localSettings.repeatIntervalMinutes === item.val
                    ? 'border-amber-500 bg-amber-500/10 text-amber-400 font-medium'
                    : isLight
                    ? 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message Selector */}
        <div className="flex flex-col gap-1.5 pt-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
            <span>Message bienveillant</span>
          </label>
          <textarea
            value={localSettings.customMessage}
            onChange={(e) => {
              const updated = { ...localSettings, customMessage: e.target.value };
              updateSettings(updated);
            }}
            rows={2}
            className={`w-full text-xs p-2.5 rounded-xl border resize-none outline-none focus:ring-1 focus:ring-amber-500 ${
              isLight
                ? 'bg-neutral-50 border-neutral-300 text-neutral-800'
                : isEink
                ? 'bg-neutral-200 border-neutral-600 text-neutral-900'
                : 'bg-neutral-900 border-neutral-700 text-neutral-200'
            }`}
          />
          <div className="flex flex-wrap gap-1 mt-0.5">
            {DISCONNECT_MESSAGES.map((msg, i) => (
              <button
                key={i}
                onClick={() => {
                  playMinimalClick(soundEnabled);
                  const updated = { ...localSettings, customMessage: msg };
                  updateSettings(updated);
                }}
                className="text-[10px] text-neutral-400 hover:text-amber-400 underline underline-offset-2 transition mr-2 cursor-pointer"
              >
                Modèle #{i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Notification permissions status box */}
        <div
          className={`p-3 rounded-xl border text-xs flex flex-col gap-2 ${
            permissionStatus === 'granted'
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
              : permissionStatus === 'denied'
              ? 'border-red-500/30 bg-red-500/5 text-red-400'
              : 'border-neutral-800 bg-neutral-900/50 text-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {permissionStatus === 'granted' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              )}
              <span className="font-medium text-[11px]">
                {permissionStatus === 'granted'
                  ? 'Notifications autorisées sur ce téléphone'
                  : permissionStatus === 'denied'
                  ? 'Notifications bloquées dans le navigateur'
                  : 'Autorisation notification requise'}
              </span>
            </div>

            {permissionStatus !== 'granted' && (
              <button
                onClick={handleRequestPermission}
                id="btn-request-notification-permission"
                className="px-2 py-1 rounded-lg bg-amber-500 text-black font-semibold text-[10px] cursor-pointer hover:bg-amber-400 transition"
              >
                Autoriser
              </button>
            )}
          </div>
        </div>

        {/* Test Notification Action */}
        <div className="pt-2 border-t border-neutral-800/40 flex flex-col gap-2">
          <button
            onClick={handleSendTestNotification}
            id="btn-test-notification"
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
              testSent
                ? 'bg-emerald-600 text-white'
                : isLight
                ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                : isEink
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700'
            }`}
          >
            {testSent ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Notification envoyée sur votre téléphone !</span>
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                <span>Tester la notification sur mon téléphone</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 text-xs text-neutral-400 hover:text-neutral-200 text-center transition cursor-pointer"
          >
            Enregistrer et fermer
          </button>
        </div>
      </div>
    </div>
  );
};
