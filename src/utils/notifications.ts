import { DisconnectReminderSettings } from '../types';
import { playBedtimeChime, triggerBedtimeHaptic } from './audio';

export const DAYS_OF_WEEK = [
  { id: 1, short: 'Lun', label: 'Lundi', isWeekend: false },
  { id: 2, short: 'Mar', label: 'Mardi', isWeekend: false },
  { id: 3, short: 'Mer', label: 'Mercredi', isWeekend: false },
  { id: 4, short: 'Jeu', label: 'Jeudi', isWeekend: false },
  { id: 5, short: 'Ven', label: 'Vendredi', isWeekend: false },
  { id: 6, short: 'Sam', label: 'Samedi', isWeekend: true },
  { id: 0, short: 'Dim', label: 'Dimanche', isWeekend: true },
];

export const DISCONNECT_MESSAGES = [
  "Il est l'heure de lâcher votre téléphone. Offrez à vos yeux et votre esprit un repos bien mérité.",
  "Déconnexion conseillée : posez votre écran et savourez une soirée sereine sans notifications.",
  "Sobriété numérique : place au calme, à la lecture ou au sommeil. Éteignez l'écran.",
  "Moins d'écran, plus de vie : déconnectez maintenant pour recharger votre propre énergie.",
];

/**
 * Checks if browser notifications are supported and returns status
 */
export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Requests phone/browser permission for web push notifications
 */
export async function requestPhoneNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.warn('Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Sends a native notification to the phone shade / lockscreen
 */
export async function sendPhoneNotification(
  title: string,
  options: {
    body: string;
    icon?: string;
    tag?: string;
    vibrate?: number[];
  }
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    const notificationOptions = {
      body: options.body,
      icon: options.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: options.tag || 'disconnect-curfew',
      renotify: true,
      requireInteraction: true,
      silent: false,
    } as NotificationOptions;

    // Prefer Service Worker registration on mobile if available
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, notificationOptions);
          return true;
        }
      } catch (swError) {
        // Fallback to standard Notification constructor
      }
    }

    // Standard constructor fallback
    new Notification(title, notificationOptions);
    return true;
  } catch (err) {
    console.warn('Could not display system notification:', err);
    return false;
  }
}

/**
 * Executes a full disconnect alert: system notification, soothing bedtime chime and vibration
 */
export async function triggerDisconnectAlert(
  message: string,
  soundEnabled = true,
  vibrateEnabled = true
): Promise<boolean> {
  if (soundEnabled) {
    playBedtimeChime(true);
  }
  if (vibrateEnabled) {
    triggerBedtimeHaptic(true);
  }

  return sendPhoneNotification('🌙 Lâchez votre téléphone', {
    body: message,
    tag: 'curfew-disconnect-alert',
  });
}

/**
 * Resolves the configured disconnect time and active status for a specific day of week
 * @param settings DisconnectReminderSettings
 * @param dayIndex 0 (Dimanche) to 6 (Samedi)
 */
export function getScheduledTimeForDay(
  settings: DisconnectReminderSettings,
  dayIndex: number
): { enabled: boolean; time: string } {
  const mode = settings.scheduleMode || 'weekdays_weekend';

  if (mode === 'custom_days' && settings.dayTimes && settings.dayTimes[dayIndex]) {
    const config = settings.dayTimes[dayIndex];
    return {
      enabled: config.enabled,
      time: config.time || settings.time || '21:30',
    };
  }

  if (mode === 'weekdays_weekend') {
    const isWeekend = dayIndex === 0 || dayIndex === 6; // Samedi ou Dimanche
    const isDayActive = settings.days.includes(dayIndex);
    const targetTime = isWeekend
      ? settings.weekendTime || '23:00'
      : settings.weekdayTime || '21:30';
    return {
      enabled: isDayActive,
      time: targetTime,
    };
  }

  // mode === 'unified'
  return {
    enabled: settings.days.includes(dayIndex),
    time: settings.time || '21:30',
  };
}

/**
 * Resolves the scheduled time and status for today
 */
export function getScheduledTimeForToday(
  settings: DisconnectReminderSettings
): { enabled: boolean; time: string; dayIndex: number } {
  const dayIndex = new Date().getDay();
  const schedule = getScheduledTimeForDay(settings, dayIndex);
  return {
    ...schedule,
    dayIndex,
  };
}

/**
 * Computes the unique date key for the evening/night curfew cycle (YYYY-MM-DD).
 * Any time between 00:00 and 04:59 AM belongs to the cycle started the previous evening.
 */
export function getCurfewCycleKey(date: Date = new Date()): string {
  const d = new Date(date);
  if (d.getHours() < 5) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks whether the current time falls into the active evening curfew window.
 */
export function getCurfewWindowStatus(
  settings: DisconnectReminderSettings,
  now: Date = new Date()
): {
  isWindowActive: boolean;
  cycleKey: string;
  targetTimeStr: string;
  minutesElapsed: number;
} {
  const cycleKey = getCurfewCycleKey(now);
  if (!settings.enabled) {
    return { isWindowActive: false, cycleKey, targetTimeStr: '21:30', minutesElapsed: 0 };
  }

  // Day of week when the cycle started
  const cycleDate = new Date(now);
  if (now.getHours() < 5) {
    cycleDate.setDate(cycleDate.getDate() - 1);
  }
  const cycleDayIndex = cycleDate.getDay();
  const schedule = getScheduledTimeForDay(settings, cycleDayIndex);

  if (!schedule.enabled) {
    return { isWindowActive: false, cycleKey, targetTimeStr: schedule.time, minutesElapsed: 0 };
  }

  const [targetH, targetM] = schedule.time.split(':').map(Number);
  const curfewDate = new Date(cycleDate);
  curfewDate.setHours(targetH, targetM, 0, 0);

  const diffMs = now.getTime() - curfewDate.getTime();
  const minutesElapsed = Math.floor(diffMs / 60000);

  // Active from scheduled time until 05:00 AM next morning (max 8 hours)
  const isAfterCurfew = now.getTime() >= curfewDate.getTime();
  const isBeforeMorning = now.getHours() >= targetH || now.getHours() < 5;
  const isWindowActive = isAfterCurfew && isBeforeMorning && minutesElapsed >= 0 && minutesElapsed <= 480;

  return {
    isWindowActive,
    cycleKey,
    targetTimeStr: schedule.time,
    minutesElapsed,
  };
}

/**
 * Evaluates whether the disconnect reminder should trigger at this moment.
 * Keeps repeating until the user goes to the site and confirms they stopped using the phone!
 */
export function evaluateDisconnectTrigger(
  settings: DisconnectReminderSettings,
  lastTriggerKey: string | null,
  confirmedCycleKey: string | null
): {
  shouldTrigger: boolean;
  minuteKey: string;
  reason?: string;
  scheduledTime?: string;
  minutesElapsed?: number;
  isConfirmedForNight?: boolean;
} {
  const now = new Date();
  const currentHH = String(now.getHours()).padStart(2, '0');
  const currentMM = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHH}:${currentMM}`;
  const minuteKey = `${now.toISOString().split('T')[0]}_${currentTimeStr}`;

  if (!settings.enabled) {
    return { shouldTrigger: false, minuteKey };
  }

  const windowStatus = getCurfewWindowStatus(settings, now);

  if (!windowStatus.isWindowActive) {
    return { shouldTrigger: false, minuteKey };
  }

  // IF THE USER ALREADY PRESSED THE BUTTON ON THE SITE TO CONFIRM PHONE SHUTDOWN:
  // STOP SENDING ALL NOTIFICATIONS FOR THIS NIGHT!
  if (confirmedCycleKey === windowStatus.cycleKey) {
    return {
      shouldTrigger: false,
      minuteKey,
      isConfirmedForNight: true,
      scheduledTime: windowStatus.targetTimeStr,
    };
  }

  // Already triggered in this exact minute
  if (lastTriggerKey === minuteKey) {
    return { shouldTrigger: false, minuteKey };
  }

  // Determine repeat interval in minutes (defaults to 10 minutes if 0, so reminders don't stop until confirmed)
  const interval =
    settings.repeatIntervalMinutes && settings.repeatIntervalMinutes > 0
      ? settings.repeatIntervalMinutes
      : 10;

  // Exact curfew start minute
  if (windowStatus.minutesElapsed === 0) {
    return {
      shouldTrigger: true,
      minuteKey,
      reason: 'exact_time',
      scheduledTime: windowStatus.targetTimeStr,
      minutesElapsed: 0,
    };
  }

  // Periodic reminder until user goes on the site and presses the confirmation button
  if (windowStatus.minutesElapsed > 0 && windowStatus.minutesElapsed % interval === 0) {
    return {
      shouldTrigger: true,
      minuteKey,
      reason: 'repeat_interval',
      scheduledTime: windowStatus.targetTimeStr,
      minutesElapsed: windowStatus.minutesElapsed,
    };
  }

  return { shouldTrigger: false, minuteKey };
}
