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
 * Registers the lightweight Service Worker for mobile/PWA notification delivery
 */
export function registerNotificationServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('Notification Service Worker active:', reg.scope);
        })
        .catch((err) => {
          console.warn('Service Worker registration skipped:', err);
        });
    } catch {
      // ignore
    }
  }
}

/**
 * Utility to convert base64 URL safe VAPID key to Uint8Array for PushManager
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Retrieves VAPID public key from backend server
 */
export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key');
    if (!res.ok) return null;
    const data = await res.json();
    return data.publicKey || null;
  } catch (err) {
    console.warn('Failed to fetch VAPID public key:', err);
    return null;
  }
}

/**
 * Checks if current device/browser supports Background Web Push
 */
export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Gets the current active PushSubscription on the client if any
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) return null;
    return await reg.pushManager.getSubscription();
  } catch (err) {
    console.warn('Could not get push subscription:', err);
    return null;
  }
}

/**
 * Subscribes the device to Web Push notifications to receive reminders even when closed
 */
export async function subscribeToWebPush(
  settings?: DisconnectReminderSettings
): Promise<{ success: boolean; subscription?: PushSubscription; error?: string }> {
  if (!isPushNotificationSupported()) {
    return {
      success: false,
      error: 'Les notifications Push ne sont pas prises en charge par ce navigateur.',
    };
  }

  try {
    // 1. Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'Autorisation des notifications refusée par le navigateur.',
      };
    }

    // 2. Fetch server VAPID key
    const publicKey = await getVapidPublicKey();
    if (!publicKey) {
      return {
        success: false,
        error: 'Impossible de contacter le serveur de notifications.',
      };
    }

    // 3. Register or get Service Worker
    const registration = await navigator.serviceWorker.ready;
    if (!registration.pushManager) {
      return {
        success: false,
        error: 'Le gestionnaire de push du navigateur est indisponible.',
      };
    }

    // 4. Check existing or create subscription
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    }

    // 5. Sync with server
    if (subscription) {
      await syncSubscriptionWithServer(subscription, settings);
    }

    return { success: true, subscription };
  } catch (err: any) {
    console.error('Error subscribing to Web Push:', err);
    return {
      success: false,
      error: err?.message || 'Erreur lors de l’inscription au service Push.',
    };
  }
}

/**
 * Syncs the current push subscription and curfew schedule with the server
 */
export async function syncSubscriptionWithServer(
  subscription: PushSubscription,
  settings?: DisconnectReminderSettings
): Promise<boolean> {
  try {
    const timezoneOffset = new Date().getTimezoneOffset();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        settings: settings
          ? {
              enabled: settings.enabled,
              time: settings.time,
              weekdayTime: settings.weekdayTime,
              weekendTime: settings.weekendTime,
              scheduleMode: settings.scheduleMode,
              dayTimes: settings.dayTimes,
              days: settings.days,
              repeatIntervalMinutes: settings.repeatIntervalMinutes,
              customMessage: settings.customMessage,
              timezoneOffset,
            }
          : {
              enabled: true,
              timezoneOffset,
            },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to sync push subscription with server:', err);
    return false;
  }
}

/**
 * Unsubscribes from Web Push
 */
export async function unsubscribeFromWebPush(): Promise<boolean> {
  try {
    const subscription = await getPushSubscription();
    if (subscription) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      }).catch(() => {});
      await subscription.unsubscribe();
    }
    return true;
  } catch (err) {
    console.warn('Failed to unsubscribe from push:', err);
    return false;
  }
}

/**
 * Triggers a real background test push via the server.
 * Can include a delay (e.g. 5-10s) so the user can lock their phone screen or close the tab!
 */
export async function sendBackgroundTestPush(
  delaySeconds = 0,
  settings?: DisconnectReminderSettings
): Promise<{ success: boolean; message?: string }> {
  try {
    let sub = await getPushSubscription();
    if (!sub) {
      const subscribeResult = await subscribeToWebPush(settings);
      if (!subscribeResult.success || !subscribeResult.subscription) {
        return {
          success: false,
          message: subscribeResult.error || 'Impossible d’activer les notifications Push.',
        };
      }
      sub = subscribeResult.subscription;
    }

    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        delaySeconds,
        message:
          delaySeconds > 0
            ? `🌙 Test réussi ! Notification reçue avec le téléphone verrouillé ou l'écran éteint.`
            : `🌙 Test réussi ! Les notifications d'arrière-plan fonctionnent sur votre téléphone même site fermé.`,
      }),
    });

    const data = await res.json();
    return { success: Boolean(data.success), message: data.message };
  } catch (err: any) {
    console.error('Failed to trigger background test push:', err);
    return {
      success: false,
      message: err?.message || 'Erreur lors de l’envoi du test de notification.',
    };
  }
}

/**
 * Informs server that user confirmed stopping phone usage for the night
 */
export async function confirmNightShutdownOnServer(cycleKey?: string): Promise<boolean> {
  try {
    const sub = await getPushSubscription();
    const res = await fetch('/api/push/confirm-night', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub ? sub.toJSON() : undefined,
        cycleKey,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}


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
      vibrate: options.vibrate || [250, 150, 250, 150, 350],
    };

    // 1. Try via active Service Worker with a 400ms timeout race (never hangs)
    if ('serviceWorker' in navigator) {
      try {
        const swPromise = navigator.serviceWorker.getRegistration();
        const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 400));
        const registration = await Promise.race([swPromise, timeoutPromise]);
        if (registration && 'showNotification' in registration) {
          await registration.showNotification(title, notificationOptions as NotificationOptions);
          return true;
        }
      } catch (swErr) {
        console.warn('SW notification fallback to standard Notification:', swErr);
      }
    }

    // 2. Standard Notification constructor fallback
    const notif = new Notification(title, notificationOptions as NotificationOptions);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
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
 * Computes the unique cycle date key for the curfew session (YYYY-MM-DD).
 * If the curfew is an evening schedule (>= 12:00) and current time is past midnight (< 06:00 AM),
 * it correctly belongs to yesterday evening's cycle.
 */
export function getCurfewCycleKey(date: Date = new Date(), targetTimeStr?: string): string {
  const d = new Date(date);
  const [targetH] = (targetTimeStr || '21:30').split(':').map(Number);
  if (targetH >= 12 && d.getHours() < 6) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks whether the current time falls into the active curfew window.
 * The window is considered active as soon as the scheduled time is reached or has passed,
 * and remains active for up to 10 hours or until morning, unless confirmed stopped by user.
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
  const todayIndex = now.getDay();
  const todaySchedule = getScheduledTimeForDay(settings, todayIndex);
  const currentHour = now.getHours();

  // 1. Check if we are in early morning (< 06:00) continuation of yesterday's evening curfew
  if (currentHour < 6) {
    const yesterdayIndex = (todayIndex + 6) % 7;
    const yesterdaySchedule = getScheduledTimeForDay(settings, yesterdayIndex);
    if (yesterdaySchedule.enabled) {
      const [yH, yM] = yesterdaySchedule.time.split(':').map(Number);
      if (yH >= 12) {
        const yDate = new Date(now);
        yDate.setDate(yDate.getDate() - 1);
        yDate.setHours(yH, yM, 0, 0);

        const diffYMs = now.getTime() - yDate.getTime();
        const yMinutesElapsed = Math.floor(diffYMs / 60000);
        // Active from yesterday evening until 06:00 AM next morning (max 10 hours)
        if (diffYMs >= 0 && diffYMs <= 10 * 3600 * 1000) {
          const cycleKey = getCurfewCycleKey(now, yesterdaySchedule.time);
          return {
            isWindowActive: settings.enabled,
            cycleKey,
            targetTimeStr: yesterdaySchedule.time,
            minutesElapsed: yMinutesElapsed,
          };
        }
      }
    }
  }

  // 2. Today's schedule
  const cycleKey = getCurfewCycleKey(now, todaySchedule.time);
  if (!settings.enabled || !todaySchedule.enabled) {
    return {
      isWindowActive: false,
      cycleKey,
      targetTimeStr: todaySchedule.time,
      minutesElapsed: 0,
    };
  }

  const [tH, tM] = todaySchedule.time.split(':').map(Number);
  const targetDate = new Date(now);
  targetDate.setHours(tH, tM, 0, 0);

  const diffMs = now.getTime() - targetDate.getTime();
  const minutesElapsed = Math.floor(diffMs / 60000);

  // Active as soon as the scheduled time is reached/passed (diffMs >= 0)
  // and stays active for up to 10 hours unless confirmed stopped by user.
  const isAfterScheduledTime = diffMs >= 0;
  const isWithinActiveWindow = isAfterScheduledTime && diffMs <= 10 * 3600 * 1000;

  return {
    isWindowActive: isWithinActiveWindow,
    cycleKey,
    targetTimeStr: todaySchedule.time,
    minutesElapsed: Math.max(0, minutesElapsed),
  };
}

export interface DisconnectEvaluation {
  shouldTrigger: boolean;
  cycleKey: string;
  reason?: 'exact_time' | 'time_passed' | 'repeat_interval';
  scheduledTime?: string;
  minutesElapsed?: number;
  intervalMinutes: number;
  triggerTimestamp: number;
  isConfirmedForNight?: boolean;
}

/**
 * Evaluates whether the disconnect reminder should trigger at this moment:
 * 1. If the scheduled time has arrived or is already passed, and no notification has been
 *    sent yet for this cycle -> TRIGGERS IMMEDIATELY.
 * 2. If an initial notification was already sent, it repeats every X minutes (e.g. 5 min, 30 min)
 *    based on elapsed time from lastTriggerTimestamp until the user confirms on the site.
 */
export function evaluateDisconnectTrigger(
  settings: DisconnectReminderSettings,
  lastTriggerTimestamp: number | null,
  lastTriggerCycle: string | null,
  confirmedCycleKey: string | null,
  now: Date = new Date()
): DisconnectEvaluation {
  const windowStatus = getCurfewWindowStatus(settings, now);
  const cycleKey = windowStatus.cycleKey;
  const intervalMinutes =
    settings.repeatIntervalMinutes && settings.repeatIntervalMinutes > 0
      ? settings.repeatIntervalMinutes
      : 10;

  if (!settings.enabled || !windowStatus.isWindowActive) {
    return {
      shouldTrigger: false,
      cycleKey,
      intervalMinutes,
      triggerTimestamp: now.getTime(),
    };
  }

  // IF THE USER ALREADY PRESSED THE BUTTON ON THE SITE TO CONFIRM PHONE SHUTDOWN:
  // STOP SENDING ALL NOTIFICATIONS FOR THIS CYCLE!
  if (confirmedCycleKey === cycleKey) {
    return {
      shouldTrigger: false,
      cycleKey,
      intervalMinutes,
      triggerTimestamp: now.getTime(),
      isConfirmedForNight: true,
      scheduledTime: windowStatus.targetTimeStr,
    };
  }

  const hasTriggeredInCurrentCycle =
    lastTriggerCycle === cycleKey &&
    lastTriggerTimestamp !== null &&
    lastTriggerTimestamp > 0;

  // Case 1: Initial trigger when scheduled time has arrived or is passed
  if (!hasTriggeredInCurrentCycle) {
    const reason = windowStatus.minutesElapsed === 0 ? 'exact_time' : 'time_passed';
    return {
      shouldTrigger: true,
      cycleKey,
      reason,
      scheduledTime: windowStatus.targetTimeStr,
      minutesElapsed: windowStatus.minutesElapsed,
      intervalMinutes,
      triggerTimestamp: now.getTime(),
    };
  }

  // Case 2: Repetition in the requested interval (e.g. every 5 min, 30 min)
  const elapsedSinceLastTriggerMs = now.getTime() - lastTriggerTimestamp!;
  const intervalMs = intervalMinutes * 60 * 1000;

  if (elapsedSinceLastTriggerMs >= intervalMs) {
    return {
      shouldTrigger: true,
      cycleKey,
      reason: 'repeat_interval',
      scheduledTime: windowStatus.targetTimeStr,
      minutesElapsed: windowStatus.minutesElapsed,
      intervalMinutes,
      triggerTimestamp: now.getTime(),
    };
  }

  return {
    shouldTrigger: false,
    cycleKey,
    intervalMinutes,
    triggerTimestamp: now.getTime(),
    scheduledTime: windowStatus.targetTimeStr,
    minutesElapsed: windowStatus.minutesElapsed,
  };
}
