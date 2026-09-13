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
 * Evaluates whether the disconnect reminder should trigger at this moment
 */
export function evaluateDisconnectTrigger(
  settings: DisconnectReminderSettings,
  lastTriggerKey: string | null
): { shouldTrigger: boolean; minuteKey: string; reason?: string; scheduledTime?: string } {
  const now = new Date();
  const currentHH = String(now.getHours()).padStart(2, '0');
  const currentMM = String(now.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHH}:${currentMM}`;
  const minuteKey = `${now.toISOString().split('T')[0]}_${currentTimeStr}`;

  if (!settings.enabled) {
    return { shouldTrigger: false, minuteKey };
  }

  const todaySchedule = getScheduledTimeForToday(settings);

  // Check if today is active
  if (!todaySchedule.enabled) {
    return { shouldTrigger: false, minuteKey };
  }

  // Already triggered in this exact minute
  if (lastTriggerKey === minuteKey) {
    return { shouldTrigger: false, minuteKey };
  }

  const [targetH, targetM] = todaySchedule.time.split(':').map(Number);
  const targetMinutes = targetH * 60 + targetM;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Exactly at scheduled time
  if (currentMinutes === targetMinutes) {
    return { shouldTrigger: true, minuteKey, reason: 'exact_time', scheduledTime: todaySchedule.time };
  }

  // If repeating interval is set (e.g. 15, 30, 60 minutes) and current time is past the curfew (within a 3.5-hour evening window)
  if (settings.repeatIntervalMinutes && settings.repeatIntervalMinutes > 0) {
    const elapsedMinutes = currentMinutes - targetMinutes;
    if (elapsedMinutes > 0 && elapsedMinutes <= 210) {
      if (elapsedMinutes % settings.repeatIntervalMinutes === 0) {
        return { shouldTrigger: true, minuteKey, reason: 'repeat_interval', scheduledTime: todaySchedule.time };
      }
    }
  }

  return { shouldTrigger: false, minuteKey };
}
