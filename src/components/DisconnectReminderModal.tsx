import React, { useState, useEffect } from 'react';
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
  Radio,
  Lock,
  Zap,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Send,
  ExternalLink,
  RefreshCw,
  MessageSquare,
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
  isPushNotificationSupported,
  getPushSubscription,
  subscribeToWebPush,
  sendBackgroundTestPush,
  detectMobilePushEnvironment,
  fetchTelegramStatus,
  syncTelegramSubscribers,
  testTelegramAlert,
  syncCurfewScheduleWithServer,
  TelegramStatus,
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
  const [isPushSupported] = useState<boolean>(() => isPushNotificationSupported());
  const [isPushSubscribed, setIsPushSubscribed] = useState<boolean>(false);
  const [isSubscribingPush, setIsSubscribingPush] = useState<boolean>(false);
  const [countdownTest, setCountdownTest] = useState<number | null>(null);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [mobileEnv, setMobileEnv] = useState(() => detectMobilePushEnvironment());
  const [showTroubleshooting, setShowTroubleshooting] = useState<boolean>(false);
  const [troubleshootTab, setTroubleshootTab] = useState<'ios' | 'android'>(() =>
    detectMobilePushEnvironment().isIOS ? 'ios' : 'android'
  );

  // Telegram integration state
  const [notificationChannelTab, setNotificationChannelTab] = useState<'telegram' | 'webpush'>('telegram');
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [isSyncingTelegram, setIsSyncingTelegram] = useState<boolean>(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false);
  const [telegramFeedback, setTelegramFeedback] = useState<string | null>(null);

  // Sync state on open
  React.useEffect(() => {
    if (isOpen) {
      setLocalSettings(getNormalizedSettings(settings));
      setPermissionStatus(getNotificationPermissionStatus());
      setMobileEnv(detectMobilePushEnvironment());
      setTestSent(false);
      setCountdownTest(null);
      setPushStatusMessage(null);
      setTelegramFeedback(null);

      // Check push subscription
      getPushSubscription().then((sub) => {
        setIsPushSubscribed(Boolean(sub));
      });

      // Fetch Telegram status
      fetchTelegramStatus().then((status) => {
        setTelegramStatus(status);
        if (!status?.configured) {
          // If telegram not configured yet, keep webpush accessible
        }
      });

      // Synchronize curfew schedule with server
      syncCurfewScheduleWithServer(settings);
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
    // Keep server-side background schedulers updated with exact schedule
    syncCurfewScheduleWithServer(updated);
  };

  const handleSyncTelegram = async () => {
    playMinimalClick(soundEnabled);
    setIsSyncingTelegram(true);
    setTelegramFeedback(null);
    try {
      const status = await syncTelegramSubscribers();
      setTelegramStatus(status);
      if (status && status.subscribersCount > 0) {
        setTelegramFeedback(
          `Compte Telegram connecté avec succès (${status.subscribers[0].name}) !`
        );
      } else {
        setTelegramFeedback(
          "Aucun message reçu. Avez-vous cliqué sur « Démarrer » (/start) dans le bot Telegram ?"
        );
      }
    } catch {
      setTelegramFeedback("Erreur lors de la synchronisation avec Telegram.");
    } finally {
      setIsSyncingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    playMinimalClick(soundEnabled);
    setIsTestingTelegram(true);
    setTelegramFeedback(null);
    try {
      const res = await testTelegramAlert();
      setTelegramFeedback(res.message);
    } catch (err: any) {
      setTelegramFeedback(err?.message || "Erreur lors du test Telegram.");
    } finally {
      setIsTestingTelegram(false);
    }
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

  const handleEnablePush = async () => {
    playMinimalClick(soundEnabled);
    setIsSubscribingPush(true);
    setPushStatusMessage(null);
    try {
      const res = await subscribeToWebPush(localSettings);
      if (res.success) {
        setIsPushSubscribed(true);
        setPermissionStatus('granted');
        setPushStatusMessage('Notifications d’arrière-plan activées avec succès !');
      } else {
        setPushStatusMessage(res.error || 'Erreur lors de l’activation.');
      }
    } catch {
      setPushStatusMessage('Erreur lors de l’activation des notifications.');
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleSendBackgroundPushTest = async (delaySeconds = 0) => {
    playMinimalClick(soundEnabled);
    setPushStatusMessage(null);

    let timer: NodeJS.Timeout | null = null;
    if (delaySeconds > 0) {
      setCountdownTest(delaySeconds);
      let count = delaySeconds;
      timer = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          if (timer) clearInterval(timer);
          setCountdownTest(null);
        } else {
          setCountdownTest(count);
        }
      }, 1000);
    }

    const res = await sendBackgroundTestPush(delaySeconds, localSettings);
    if (res.success) {
      setIsPushSubscribed(true);
      setPermissionStatus('granted');
      if (delaySeconds > 0) {
        setPushStatusMessage(
          `C'est parti ! Verrouillez votre écran ou fermez le navigateur : notification envoyée dans ${delaySeconds}s.`
        );
      } else {
        setPushStatusMessage('Notification envoyée sur votre appareil !');
      }
    } else {
      if (timer) clearInterval(timer);
      setCountdownTest(null);
      setPushStatusMessage(res.message || 'Erreur lors de l’envoi du test');
    }
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

        {/* Repetition options until confirmed on site */}
        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
              Fréquence des rappels (jusqu'à validation)
            </label>
            <span className="text-[10px] text-amber-500 font-mono">
              {localSettings.repeatIntervalMinutes ? `${localSettings.repeatIntervalMinutes} min` : '10 min'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-xs">
            {[
              { val: 5, label: '5 min' },
              { val: 10, label: '10 min' },
              { val: 15, label: '15 min' },
              { val: 30, label: '30 min' },
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => handleRepeatChange(item.val)}
                className={`py-1.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                  (localSettings.repeatIntervalMinutes || 10) === item.val
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

          {/* Explanation badge about stop confirmation button */}
          <div
            className={`mt-1.5 p-2.5 rounded-xl border text-[11px] leading-relaxed flex items-start gap-2 ${
              isLight
                ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                : isEink
                ? 'bg-[#e5e3db] border-neutral-800 text-neutral-900'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-300'
            }`}
          >
            <span className="shrink-0 text-base leading-none">📱</span>
            <div>
              <strong className="font-semibold block text-white">Arrêt uniquement sur confirmation</strong>
              Le site continuera d'envoyer des rappels tant que vous n'aurez pas ouvert le launcher et appuyé sur le bouton{' '}
              <span className="font-semibold text-amber-400">« J'arrête d'utiliser mon téléphone »</span>.
            </div>
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

        {/* Notification Channel Selection: Telegram vs Web Push */}
        <div className="flex flex-col gap-2 pt-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center justify-between">
            <span>Canal d'alerte</span>
            <span className="text-[10px] text-amber-500 lowercase font-normal">
              {notificationChannelTab === 'telegram' ? 'recommandé sur mobile' : 'via navigateur'}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-neutral-900 border border-neutral-800 text-xs">
            <button
              onClick={() => {
                playMinimalClick(soundEnabled);
                setNotificationChannelTab('telegram');
              }}
              id="tab-channel-telegram"
              className={`py-2 px-2.5 rounded-xl font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                notificationChannelTab === 'telegram'
                  ? 'bg-amber-500 text-neutral-950 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Bot Telegram</span>
            </button>
            <button
              onClick={() => {
                playMinimalClick(soundEnabled);
                setNotificationChannelTab('webpush');
              }}
              id="tab-channel-webpush"
              className={`py-2 px-2.5 rounded-xl font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                notificationChannelTab === 'webpush'
                  ? 'bg-amber-500 text-neutral-950 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Web Push (Navigateur)</span>
            </button>
          </div>
        </div>

        {/* TELEGRAM BOT CHANNEL UI */}
        {notificationChannelTab === 'telegram' && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-3 ${
              isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
                : isEink
                ? 'bg-neutral-200 border-neutral-600 text-neutral-900'
                : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-xs">Alertes par Bot Telegram</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  telegramStatus?.configured && telegramStatus.subscribersCount > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : telegramStatus?.configured
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                }`}
              >
                {telegramStatus?.configured && telegramStatus.subscribersCount > 0
                  ? '✓ Relié & Actif'
                  : telegramStatus?.configured
                  ? 'Action requise (/start)'
                  : 'À configurer'}
              </span>
            </div>

            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Les notifications Telegram contournent les restrictions de veille d'Apple et Google : votre téléphone sonne et s'allume{' '}
              <strong className="text-neutral-200">systématiquement</strong>, même écran verrouillé et navigateur fermé.
            </p>

            {/* BOT CONFIGURED STATE */}
            {telegramStatus?.configured ? (
              <div className="flex flex-col gap-2.5">
                <div className="p-2.5 rounded-xl bg-neutral-950/50 border border-neutral-800 text-[11px] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Bot connecté au serveur :</span>
                    <a
                      href={`https://t.me/${telegramStatus.botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-amber-400 hover:underline flex items-center gap-1"
                    >
                      @{telegramStatus.botUsername}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-neutral-800/60">
                    <span className="text-neutral-400">Destinataires enregistrés :</span>
                    <span className="font-semibold text-white">
                      {telegramStatus.subscribersCount > 0
                        ? `${telegramStatus.subscribersCount} appareil(s)`
                        : 'Aucun pour le moment'}
                    </span>
                  </div>

                  {telegramStatus.subscribers.length > 0 && (
                    <div className="pt-1 border-t border-neutral-800/60 flex flex-col gap-1">
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                        Comptes reliés :
                      </span>
                      {telegramStatus.subscribers.map((sub, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] bg-emerald-500/10 text-emerald-300 px-2 py-1 rounded-lg border border-emerald-500/20"
                        >
                          <div className="flex items-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{sub.name || 'Utilisateur'}</span>
                            {sub.username && (
                              <span className="text-emerald-400/70 text-[10px]">(@{sub.username})</span>
                            )}
                          </div>
                          <span className="text-[9px] text-emerald-400/60">ID: {sub.chatId}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* If no subscriber yet, prompt to click link and start */}
                {telegramStatus.subscribersCount === 0 ? (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col gap-2 text-[11px]">
                    <strong className="text-white font-medium">Reliez votre Telegram en 2 étapes :</strong>
                    <ol className="list-decimal list-inside space-y-1 text-neutral-300">
                      <li>
                        Touchez le bouton ci-dessous pour ouvrir votre bot :
                      </li>
                    </ol>

                    <a
                      href={`https://t.me/${telegramStatus.botUsername}?start=minimal`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition text-center"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Ouvrir @{telegramStatus.botUsername} sur Telegram</span>
                    </a>

                    <div className="text-neutral-300">
                      2. Dans Telegram, appuyez sur <strong className="text-white">« Démarrer »</strong> (ou envoyez <code className="text-amber-300">/start</code>).
                    </div>

                    <button
                      onClick={handleSyncTelegram}
                      disabled={isSyncingTelegram}
                      className="w-full py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTelegram ? 'animate-spin' : ''}`} />
                      <span>{isSyncingTelegram ? 'Recherche en cours...' : 'Vérifier la connexion avec Telegram'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleTestTelegram}
                      disabled={isTestingTelegram}
                      id="btn-test-telegram-alert"
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isTestingTelegram ? 'Envoi en cours...' : 'Envoyer un test sur Telegram'}</span>
                    </button>

                    <button
                      onClick={handleSyncTelegram}
                      disabled={isSyncingTelegram}
                      className="w-full py-1.5 text-xs text-neutral-400 hover:text-neutral-200 flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingTelegram ? 'animate-spin' : ''}`} />
                      <span>Actualiser les abonnés Telegram</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* BOT NOT CONFIGURED STEP-BY-STEP */
              <div className="flex flex-col gap-2.5">
                <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-300 flex flex-col gap-2">
                  <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Création de votre Bot Telegram (1 minute, 100% gratuit) :</span>
                  </div>

                  <ol className="list-decimal list-inside space-y-1.5 leading-relaxed text-neutral-300">
                    <li>
                      Sur votre téléphone, ouvrez l'application <strong>Telegram</strong> et cherchez{' '}
                      <strong className="text-white">@BotFather</strong>.
                    </li>
                    <li>
                      Envoyez-lui le message <code className="text-amber-400 font-mono">/newbot</code>.
                    </li>
                    <li>
                      Donnez-lui un nom (ex: <span className="text-white">Mon Rappel</span>), puis un identifiant finissant par <em>bot</em> (ex: <span className="text-white">geoffroy_rappel_bot</span>).
                    </li>
                    <li>
                      BotFather vous renvoie un message avec votre <strong>HTTP API token</strong> (ex: <code className="text-amber-300 font-mono">7123456789:AAH...</code>).
                    </li>
                    <li>
                      Dans Google AI Studio, ouvrez les <strong>Settings / Secrets</strong> de l'application et ajoutez :
                      <div className="mt-1 p-2 rounded-lg bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-amber-300 select-all">
                        TELEGRAM_BOT_TOKEN = votre_token_ici
                      </div>
                    </li>
                  </ol>

                  <button
                    onClick={() => {
                      playMinimalClick(soundEnabled);
                      fetchTelegramStatus().then(setTelegramStatus);
                    }}
                    className="mt-1 w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Vérifier si le token est détecté</span>
                  </button>
                </div>
              </div>
            )}

            {/* Telegram feedback message */}
            {telegramFeedback && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>{telegramFeedback}</span>
              </div>
            )}
          </div>
        )}

        {/* WEB PUSH CHANNEL UI */}
        {notificationChannelTab === 'webpush' && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-3 ${
              isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
                : isEink
                ? 'bg-neutral-200 border-neutral-600 text-neutral-900'
                : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-xs">Notifications site fermé (Web Push)</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  isPushSubscribed
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                }`}
              >
                {isPushSubscribed ? 'Synchronisé avec le serveur' : 'Action requise'}
              </span>
            </div>

            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Grâce au protocole Web Push et au Service Worker, votre téléphone reçoit vos alertes de couvre-feu
              même si le navigateur ou l'onglet est <strong className="text-neutral-200">totalement fermé</strong> ou que votre écran est verrouillé.
            </p>

            {/* Diagnostic indicators */}
            <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-neutral-950/40 border border-neutral-800/80 text-[11px]">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-neutral-500">Autorisation navigateur</span>
                <span className={`font-semibold ${permissionStatus === 'granted' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {permissionStatus === 'granted' ? '✓ Accordée' : permissionStatus === 'denied' ? '✕ Bloquée' : '⏳ En attente'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-neutral-500">Serveur d'arrière-plan</span>
                <span className={`font-semibold ${isPushSubscribed ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isPushSubscribed ? '✓ Connecté' : '○ Non relié'}
                </span>
              </div>
            </div>

            {/* iOS note for Safari */}
            {mobileEnv.isIOS && !mobileEnv.isStandalone && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 leading-relaxed flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white block font-medium">Important sur iPhone (iOS) :</strong>
                  Apple bloque les notifications en arrière-plan dans Safari. Pour les recevoir écran éteint : touchez le bouton Partager <span className="font-semibold text-white">« Sur l'écran d'accueil »</span>, puis ouvrez l'application depuis votre écran d'accueil.
                </div>
              </div>
            )}

            {/* Action to subscribe / link device */}
            {!isPushSubscribed ? (
              <button
                onClick={handleEnablePush}
                disabled={isSubscribingPush}
                id="btn-enable-web-push"
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>{isSubscribingPush ? 'Synchronisation en cours...' : 'Activer les notifications site fermé'}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-medium">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Votre appareil est synchronisé : alertes actives site fermé & écran verrouillé</span>
              </div>
            )}

            {/* Feedback message */}
            {pushStatusMessage && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-1.5 animate-in fade-in">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>{pushStatusMessage}</span>
              </div>
            )}

            {/* Collapsible Troubleshooting Guide */}
            <div className="pt-1 border-t border-neutral-800/40">
              <button
                onClick={() => {
                  playMinimalClick(soundEnabled);
                  setShowTroubleshooting((prev) => !prev);
                }}
                id="btn-toggle-troubleshooting"
                className="w-full py-1.5 flex items-center justify-between text-xs text-amber-400 hover:text-amber-300 transition cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>L'écran fermé ne s'allume pas ? Guide de dépannage</span>
                </div>
                {showTroubleshooting ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showTroubleshooting && (
                <div className="mt-2 p-3 rounded-xl bg-neutral-950/70 border border-neutral-800 text-[11px] text-neutral-300 flex flex-col gap-2.5 animate-in fade-in">
                  {/* Platform Tabs */}
                  <div className="flex rounded-lg bg-neutral-900 p-0.5 border border-neutral-800">
                    <button
                      onClick={() => setTroubleshootTab('ios')}
                      className={`flex-1 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                        troubleshootTab === 'ios'
                          ? 'bg-amber-500 text-neutral-950 font-semibold shadow-xs'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      iPhone (iOS / Apple)
                    </button>
                    <button
                      onClick={() => setTroubleshootTab('android')}
                      className={`flex-1 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                        troubleshootTab === 'android'
                          ? 'bg-amber-500 text-neutral-950 font-semibold shadow-xs'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      Android (Samsung, Xiaomi, Pixel)
                    </button>
                  </div>

                  {/* iPhone / iOS Guide */}
                  {troubleshootTab === 'ios' && (
                    <div className="flex flex-col gap-2 leading-relaxed">
                      <p className="text-amber-300 font-medium">
                        Sur iPhone, Apple impose des restrictions strictes pour préserver l'autonomie et la vie privée :
                      </p>
                      <ol className="list-decimal list-inside space-y-1.5 text-neutral-300">
                        <li>
                          <strong className="text-white">Obligation PWA :</strong> Vous devez impérativement appuyer sur le bouton Partager de Safari, puis choisir <span className="text-amber-400">« Sur l'écran d'accueil »</span>. Les notifications écran éteint sont désactivées dans un simple onglet Safari.
                        </li>
                        <li>
                          <strong className="text-white">Ouvrir depuis l'écran d'accueil :</strong> Lancez ensuite l'icône Minimal depuis votre écran d'accueil et réactivez les notifications.
                        </li>
                        <li>
                          <strong className="text-white">Mode Concentration / Repos :</strong> Si le mode « Ne pas déranger » ou « Repos » est activé le soir, iOS masque l'écran. Allez dans <em>Réglages iPhone &gt; Concentration &gt; Repos (ou Ne pas déranger)</em> et ajoutez Minimal aux applications autorisées.
                        </li>
                        <li>
                          <strong className="text-white">Réglages Notifications :</strong> Dans <em>Réglages &gt; Notifications &gt; Minimal</em>, assurez-vous que « Écran verrouillé », « Bannières » et « Sons » sont cochés.
                        </li>
                      </ol>
                    </div>
                  )}

                  {/* Android Guide */}
                  {troubleshootTab === 'android' && (
                    <div className="flex flex-col gap-2 leading-relaxed">
                      <p className="text-amber-300 font-medium">
                        Sur Android, les optimiseurs d'énergie coupent souvent les notifications écran éteint :
                      </p>
                      <ol className="list-decimal list-inside space-y-1.5 text-neutral-300">
                        <li>
                          <strong className="text-white">Batterie non restreinte :</strong> Allez dans <em>Paramètres Android &gt; Applications &gt; Chrome (ou Minimal) &gt; Batterie</em>, et sélectionnez <span className="text-amber-400">« Non restreinte »</span> pour empêcher Android d'endormir le service en veille.
                        </li>
                        <li>
                          <strong className="text-white">Écran de verrouillage :</strong> Dans <em>Paramètres &gt; Notifications &gt; Notifications écran verrouillé</em>, vérifiez que l'affichage du contenu est bien activé.
                        </li>
                        <li>
                          <strong className="text-white">Mode Coucher / Ne pas déranger :</strong> Si votre téléphone passe automatiquement en mode silencieux la nuit, autorisez Minimal ou Chrome dans les exceptions de Ne pas déranger.
                        </li>
                      </ol>
                    </div>
                  )}

                  <div className="p-2 rounded-lg bg-neutral-900/80 border border-neutral-800 text-[10px] text-neutral-400">
                    ⚠️ <strong className="text-neutral-200">Attention à l'environnement de test :</strong> Dans la fenêtre d'aperçu sur ordinateur (iframe), les notifications en arrière-plan sont bloquées par sécurité. Ouvrez le lien direct sur votre smartphone.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Test Notification Actions */}
        <div className="pt-2 border-t border-neutral-800/40 flex flex-col gap-2">
          {notificationChannelTab === 'telegram' ? (
            <button
              onClick={handleTestTelegram}
              disabled={isTestingTelegram || !telegramStatus?.configured || telegramStatus.subscribersCount === 0}
              id="btn-test-telegram-bottom"
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isTestingTelegram
                  ? 'bg-amber-500/50 text-neutral-900 cursor-wait'
                  : telegramStatus?.configured && telegramStatus.subscribersCount > 0
                  ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-xs'
                  : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isTestingTelegram
                  ? 'Envoi du test Telegram en cours...'
                  : !telegramStatus?.configured
                  ? 'Configurez le token Telegram d\'abord'
                  : telegramStatus.subscribersCount === 0
                  ? 'Ouvrez le bot et envoyez /start d\'abord'
                  : 'Tester l\'alerte Telegram sur mon téléphone'}
              </span>
            </button>
          ) : (
            <>
              {/* Delayed test button to verify screen locked / closed */}
              <button
                onClick={() => handleSendBackgroundPushTest(6)}
                disabled={countdownTest !== null}
                id="btn-test-locked-screen"
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  countdownTest !== null
                    ? 'bg-amber-500 text-neutral-950 font-semibold animate-pulse'
                    : isLight
                    ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                    : isEink
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-800 text-neutral-100 hover:bg-neutral-700'
                }`}
              >
                {countdownTest !== null ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-neutral-950" />
                    <span>Verrouillez votre écran ! Envoi dans {countdownTest}s...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Tester écran éteint / site fermé (délai 6s)</span>
                  </>
                )}
              </button>

              {/* Immediate test button */}
              <button
                onClick={() => handleSendBackgroundPushTest(0)}
                id="btn-test-instant"
                className="w-full py-2 px-3 rounded-xl text-xs text-neutral-400 hover:text-neutral-200 border border-neutral-800/80 hover:border-neutral-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5 text-neutral-400" />
                <span>Tester immédiatement sur ce téléphone</span>
              </button>
            </>
          )}

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
