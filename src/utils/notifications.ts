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
 * Pure JavaScript Base64URL-to-Uint8Array decoder
 * Decodes URL-safe Base64 and returns an exact-length Uint8Array whose underlying
 * ArrayBuffer has byteLength matching exactly the decoded key (65 bytes for P-256 EC key).
 * Prevents WebKit DOMException ("The string did not match the expected pattern").
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = base64String.trim().replace(/[^A-Za-z0-9\-_]/g, '');
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');

  // Try standard atob first if available
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    try {
      const rawData = window.atob(base64);
      const output = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        output[i] = rawData.charCodeAt(i);
      }
      return output;
    } catch {
      // fallback to manual lookup table
    }
  }

  // Pure JavaScript lookup decoder
  const lookup = new Uint8Array(256);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alphabet.length; i++) {
    lookup[alphabet.charCodeAt(i)] = i;
  }

  const output: number[] = [];
  for (let i = 0; i < base64.length; i += 4) {
    const c0 = lookup[base64.charCodeAt(i)] || 0;
    const c1 = lookup[base64.charCodeAt(i + 1)] || 0;
    const c2 = base64.charAt(i + 2) !== '=' ? lookup[base64.charCodeAt(i + 2)] || 0 : -1;
    const c3 = base64.charAt(i + 3) !== '=' ? lookup[base64.charCodeAt(i + 3)] || 0 : -1;

    output.push((c0 << 2) | (c1 >> 4));
    if (c2 !== -1) {
      output.push(((c1 & 15) << 4) | (c2 >> 2));
    }
    if (c3 !== -1) {
      output.push(((c2 & 3) << 6) | c3);
    }
  }

  const result = new Uint8Array(output.length);
  result.set(output);
  return result;
}

/**
 * VAPID public key corresponding strictly to server-side keys
 */
export const APP_VAPID_PUBLIC_KEY =
  'BOqosgxB-i2KnBDmDa3xdqAxkdfXwvidgeNMN09dRALQDvFu4wKMBf_6wORvxsupU-8K8Rzp0CBzGQ28LJjSFs4';

/**
 * Retrieves VAPID public key from backend server with safe text parsing and instant fallback
 */
export async function getVapidPublicKey(): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('/api/push/vapid-public-key', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (res.ok) {
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data && typeof data.publicKey === 'string') {
          const sanitized = data.publicKey.trim().replace(/[^A-Za-z0-9\-_]/g, '');
          if (sanitized.length > 20) {
            return sanitized;
          }
        }
      } catch {
        // text was not json
      }
    }
  } catch (err) {
    console.warn('Network query for VAPID key completed with warning, using embedded application key:', err);
  }
  return APP_VAPID_PUBLIC_KEY;
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
 * Detects whether the app is on iOS, whether it's running as a PWA (standalone),
 * and general Push notification capabilities.
 */
export function detectMobilePushEnvironment(): {
  isIOS: boolean;
  isStandalone: boolean;
  isPushSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  canPushWhileClosed: boolean;
  guidanceText?: string;
} {
  if (typeof window === 'undefined') {
    return {
      isIOS: false,
      isStandalone: false,
      isPushSupported: false,
      permission: 'unsupported',
      canPushWhileClosed: false,
    };
  }

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as any).standalone) ||
    document.referrer.includes('android-app://');
  const isPushSupported = isPushNotificationSupported();
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';

  // On iOS, Apple strictly requires the app to be installed to the Home Screen (standalone)
  // before PushManager is allowed to receive pushes while closed.
  let canPushWhileClosed = isPushSupported;
  let guidanceText: string | undefined;

  if (isIOS) {
    if (!isStandalone) {
      canPushWhileClosed = false;
      guidanceText = "Sur iPhone : appuyez sur Partager puis « Sur l'écran d'accueil » pour activer les notifications quand Safari est fermé.";
    } else if (permission !== 'granted') {
      guidanceText = "Autorisez les notifications pour recevoir les alertes de déconnexion sur votre écran verrouillé.";
    }
  } else if (!isPushSupported) {
    guidanceText = "Ce navigateur mobile ne supporte pas l'API Push standard.";
  }

  return {
    isIOS,
    isStandalone,
    isPushSupported,
    permission,
    canPushWhileClosed,
    guidanceText,
  };
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
    // 1. Request browser permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'Autorisation des notifications refusée par le navigateur.',
      };
    }

    // 2. Fetch server VAPID key (with robust fallback)
    const publicKey = await getVapidPublicKey();

    // 3. Register or get Service Worker
    let registration: ServiceWorkerRegistration;
    try {
      if ('serviceWorker' in navigator) {
        const existing = await navigator.serviceWorker.getRegistration();
        if (existing && existing.active) {
          registration = existing;
        } else {
          registration = await navigator.serviceWorker.register('/sw.js');
          const readyPromise = navigator.serviceWorker.ready;
          const timeoutPromise = new Promise<ServiceWorkerRegistration>((resolve) =>
            setTimeout(() => resolve(registration), 3000)
          );
          registration = await Promise.race([readyPromise, timeoutPromise]);
        }
      } else {
        return {
          success: false,
          error: 'Le navigateur ne prend pas en charge les Service Workers.',
        };
      }
    } catch {
      registration = await navigator.serviceWorker.ready;
    }

    if (!registration || !registration.pushManager) {
      return {
        success: false,
        error: 'Le gestionnaire de push du navigateur est indisponible.',
      };
    }

    // 4. Check existing or create subscription
    let subscription: PushSubscription | null = null;
    try {
      subscription = await registration.pushManager.getSubscription();
    } catch (getErr) {
      console.warn('Could not read existing push subscription:', getErr);
    }

    const cleanKeyString = publicKey.trim().replace(/[^A-Za-z0-9\-_]/g, '');
    const convertedVapidKey = urlBase64ToUint8Array(cleanKeyString);

    // If subscription exists, verify if applicationServerKey matches current server key
    if (subscription) {
      try {
        const existingKeyRaw = subscription.options?.applicationServerKey;
        let matches = false;
        if (existingKeyRaw) {
          const existingArray = new Uint8Array(existingKeyRaw);
          if (existingArray.length === convertedVapidKey.length) {
            matches = existingArray.every((b, i) => b === convertedVapidKey[i]);
          }
        }
        if (!matches) {
          console.log('[Web Push] Existing subscription key differs from current server key, renewing...');
          await subscription.unsubscribe().catch(() => {});
          subscription = null;
        }
      } catch (checkErr) {
        console.warn('Could not compare subscription key, clearing stale subscription:', checkErr);
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
      }
    }

    if (!subscription) {
      // Multiple attempts with supported key representations to accommodate WebKit / Safari & Chromium:
      // 1. Uint8Array with exact 65-byte underlying ArrayBuffer
      // 2. Exact ArrayBuffer (convertedVapidKey.buffer)
      let subscribeError: any = null;

      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        });
      } catch (err1: any) {
        subscribeError = err1;
        console.warn('Subscription attempt 1 (Uint8Array) failed:', err1?.message);

        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey.buffer as ArrayBuffer,
          });
        } catch (err2: any) {
          subscribeError = err2;
          console.warn('Subscription attempt 2 (ArrayBuffer) failed:', err2?.message);
        }
      }

      if (!subscription && subscribeError) {
        throw subscribeError;
      }
    }

    // 5. Sync with server
    if (subscription) {
      await syncSubscriptionWithServer(subscription, settings);
    }

    return { success: true, subscription };
  } catch (err: any) {
    console.error('Error subscribing to Web Push:', err);
    let msg = err?.message || 'Erreur lors de l’inscription au service Push.';
    const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
    const lower = msg.toLowerCase();

    if (
      isInIframe &&
      (lower.includes('permission') ||
        lower.includes('denied') ||
        lower.includes('not allowed') ||
        lower.includes('pushmanager') ||
        lower.includes('pattern'))
    ) {
      msg = "Les notifications sont restreintes dans l'aperçu intégré. Ouvrez l'application dans un nouvel onglet ou sur votre téléphone pour les activer.";
    } else if (lower.includes('pattern') || lower.includes('invalidcharacter')) {
      msg = "Sur iPhone, ajoutez l'application à votre écran d'accueil (Partager > Sur l'écran d'accueil) pour recevoir les notifications lorsque l'écran est éteint.";
    }
    return {
      success: false,
      error: msg,
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
  const timezoneOffset = new Date().getTimezoneOffset();
  const payload = JSON.stringify({
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
  });

  // Attempt up to 2 times with a slight delay
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (res.ok) return true;
    } catch (err) {
      if (attempt === 2) {
        console.warn('Failed to sync push subscription with server after retries:', err);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  return false;
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

    const subJson = sub.toJSON();
    if (!subJson || !subJson.endpoint) {
      return {
        success: false,
        message: 'Abonnement aux notifications incomplet sur cet appareil.',
      };
    }

    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subJson,
        delaySeconds,
        message:
          delaySeconds > 0
            ? `🌙 Test réussi ! Notification reçue avec le téléphone verrouillé ou l'écran éteint.`
            : `🌙 Test réussi ! Les notifications d'arrière-plan fonctionnent sur votre téléphone même site fermé.`,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      return {
        success: false,
        message: `Erreur du serveur (${res.status}): ${errorText || res.statusText}`,
      };
    }

    let data: any = {};
    const responseText = await res.text().catch(() => '');
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { success: true, message: responseText };
    }

    return { success: Boolean(data.success), message: data.message };
  } catch (err: any) {
    console.error('Failed to trigger background test push:', err);
    let msg = err?.message || 'Erreur lors de l’envoi du test de notification.';
    const lower = msg.toLowerCase();
    if (lower.includes('pattern') || lower.includes('invalidcharacter')) {
      msg = "Sur iPhone, ajoutez l'application à votre écran d'accueil (Partager > Sur l'écran d'accueil) pour recevoir les notifications avec l'écran verrouillé.";
    }
    return {
      success: false,
      message: msg,
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
export async function requestPhoneNotificationPermission(
  settings?: DisconnectReminderSettings
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted' && isPushNotificationSupported()) {
      // Automatically register Web Push so the server can send reminders when the site is closed
      subscribeToWebPush(settings).catch((err) => {
        console.warn('Auto-subscribe to push after permission grant error:', err);
      });
    }
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

  // Also dispatch directly to Telegram subscribers if configured (works on Vercel & mobile)
  sendTelegramCurfewAlertDirect(message).catch((err) => {
    console.warn('Direct telegram alert error:', err);
  });

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

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Telegram Bot Notification Helpers (Client-First + Server Hybrid)
// -----------------------------------------------------------------------------
export interface TelegramSubscriberItem {
  chatId: string;
  name: string;
  username?: string;
  registeredAt: number;
}

export interface TelegramStatus {
  configured: boolean;
  botUsername: string | null;
  botFirstName: string | null;
  subscribersCount: number;
  subscribers: TelegramSubscriberItem[];
}

export interface LocalTelegramConfig {
  token: string;
  botUsername: string;
  botFirstName: string;
  subscribers: TelegramSubscriberItem[];
  lastUpdateId?: number;
}

const LOCAL_TELEGRAM_KEY = 'minimal_launcher_telegram_config';

/**
 * Get locally stored Telegram bot config
 */
export function getLocalTelegramConfig(): LocalTelegramConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_TELEGRAM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.token.trim()) {
      return {
        token: parsed.token.trim(),
        botUsername: parsed.botUsername || '',
        botFirstName: parsed.botFirstName || 'Bot Telegram',
        subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [],
        lastUpdateId: typeof parsed.lastUpdateId === 'number' ? parsed.lastUpdateId : 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save locally stored Telegram bot config
 */
export function saveLocalTelegramConfig(conf: LocalTelegramConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_TELEGRAM_KEY, JSON.stringify(conf));
  } catch (err) {
    console.warn('Could not save telegram config to localStorage:', err);
  }
}

/**
 * Check if a Telegram bot is configured and get registered accounts
 * Checks client localStorage first (works on Vercel/mobile), and falls back to server if available
 */
export async function fetchTelegramStatus(): Promise<TelegramStatus | null> {
  const local = getLocalTelegramConfig();

  // Try server in background/parallel (with a short 1200ms timeout)
  let serverStatus: TelegramStatus | null = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('/api/telegram/status', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      serverStatus = (await res.json()) as TelegramStatus;
    }
  } catch {
    // Expected on Vercel static deployments
  }

  // If local config exists (e.g. entered directly on phone on Vercel)
  if (local && local.token) {
    // Merge server subscribers if server had any
    const subscribersMap = new Map<string, TelegramSubscriberItem>();
    local.subscribers.forEach((s) => subscribersMap.set(s.chatId, s));
    if (serverStatus?.subscribers) {
      serverStatus.subscribers.forEach((s) => {
        if (!subscribersMap.has(s.chatId)) {
          subscribersMap.set(s.chatId, s);
        }
      });
    }

    const mergedSubs = Array.from(subscribersMap.values());
    if (mergedSubs.length !== local.subscribers.length) {
      local.subscribers = mergedSubs;
      saveLocalTelegramConfig(local);
    }

    return {
      configured: true,
      botUsername: local.botUsername || serverStatus?.botUsername || null,
      botFirstName: local.botFirstName || serverStatus?.botFirstName || 'Bot Telegram',
      subscribersCount: mergedSubs.length,
      subscribers: mergedSubs,
    };
  }

  // If only server is configured
  if (serverStatus && serverStatus.configured) {
    return serverStatus;
  }

  return {
    configured: false,
    botUsername: null,
    botFirstName: null,
    subscribersCount: 0,
    subscribers: [],
  };
}

/**
 * Poll Telegram to link new users who pressed /start
 * Works directly from browser via Telegram API (CORS enabled) so it runs on Vercel!
 */
export async function syncTelegramSubscribers(): Promise<TelegramStatus | null> {
  const local = getLocalTelegramConfig();

  // 1. Client-side sync via direct Telegram API
  if (local && local.token) {
    try {
      const offset = (local.lastUpdateId || 0) + 1;
      const res = await fetch(
        `https://api.telegram.org/bot${local.token}/getUpdates?offset=${offset}&timeout=2`
      );
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        const subscribersMap = new Map<string, TelegramSubscriberItem>();
        local.subscribers.forEach((s) => subscribersMap.set(s.chatId, s));

        let maxUpdateId = local.lastUpdateId || 0;
        let newFound = 0;

        for (const update of data.result) {
          if (update.update_id > maxUpdateId) {
            maxUpdateId = update.update_id;
          }

          const msg = update.message || update.callback_query?.message;
          const from = update.message?.from || update.callback_query?.from;
          const chat = msg?.chat;

          if (chat && chat.id) {
            const chatId = String(chat.id);
            if (!subscribersMap.has(chatId)) {
              const name = from?.first_name || chat.first_name || 'Utilisateur';
              const username = from?.username || chat.username;
              subscribersMap.set(chatId, {
                chatId,
                name,
                username,
                registeredAt: Date.now(),
              });
              newFound++;

              // Send welcome confirmation message directly to the user's phone on Telegram
              fetch(`https://api.telegram.org/bot${local.token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `👋 Bonjour <b>${name}</b> !\n\n✅ <b>Votre téléphone est connecté à Minimal Launcher.</b>\n\nVous recevrez vos alertes de couvre-feu et rappels de déconnexion ici même.`,
                  parse_mode: 'HTML',
                }),
              }).catch(() => {});
            }
          }
        }

        local.subscribers = Array.from(subscribersMap.values());
        local.lastUpdateId = maxUpdateId;
        saveLocalTelegramConfig(local);
      }
    } catch (clientErr) {
      console.warn('Client-side Telegram sync warning:', clientErr);
    }
  }

  // 2. Also ping server sync if server is available
  try {
    await fetch('/api/telegram/sync', { method: 'POST' });
  } catch {
    // Expected on Vercel
  }

  return fetchTelegramStatus();
}

/**
 * Manually add a Telegram subscriber by Chat ID (e.g. if known)
 */
export function addManualTelegramSubscriber(
  chatId: string,
  name: string = 'Utilisateur'
): boolean {
  const local = getLocalTelegramConfig();
  if (!local) return false;
  const cleanId = chatId.trim();
  if (!cleanId) return false;

  const exists = local.subscribers.some((s) => s.chatId === cleanId);
  if (!exists) {
    local.subscribers.push({
      chatId: cleanId,
      name,
      registeredAt: Date.now(),
    });
    saveLocalTelegramConfig(local);
  }
  return true;
}

/**
 * Send an immediate test notification via Telegram Bot
 * Directly calls Telegram Bot API if configured on client, with server fallback
 */
export async function testTelegramAlert(
  chatId?: string
): Promise<{ success: boolean; message: string }> {
  const local = getLocalTelegramConfig();

  // If configured on client (e.g. Vercel deployment)
  if (local && local.token) {
    const targetChatId = chatId || local.subscribers[0]?.chatId;
    if (!targetChatId) {
      // Try to poll updates once to see if user started bot
      await syncTelegramSubscribers();
      const updatedLocal = getLocalTelegramConfig();
      const updatedChatId = updatedLocal?.subscribers[0]?.chatId;

      if (!updatedChatId) {
        return {
          success: false,
          message:
            "Aucun compte Telegram lié pour l'instant. Ouvrez votre bot sur Telegram et appuyez sur « Démarrer » (/start) d'abord !",
        };
      }
      return testTelegramAlert(updatedChatId);
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${local.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: `🌙 <b>Test Couvre-Feu Minimal</b>\n\nVotre alerte de déconnexion fonctionne parfaitement sur votre téléphone ! Vous recevrez vos rappels ici même à l'heure programmée.`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ J'arrête mon téléphone", callback_data: 'confirm_night_test' }],
            ],
          },
        }),
      });

      const data = await res.json();
      if (data.ok) {
        return {
          success: true,
          message: 'Notification Telegram envoyée avec succès sur votre téléphone !',
        };
      } else {
        return {
          success: false,
          message: data.description || "Erreur lors de l'envoi via Telegram.",
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || 'Erreur réseau vers Telegram.',
      };
    }
  }

  // Fallback to server if available
  try {
    const res = await fetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    });
    const data = await res.json();
    return data;
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erreur réseau vers le serveur' };
  }
}

/**
 * Send a disconnect alert to all registered Telegram subscribers directly from client (Vercel compatible)
 */
export async function sendTelegramCurfewAlertDirect(message: string): Promise<boolean> {
  const local = getLocalTelegramConfig();
  if (!local || !local.token || local.subscribers.length === 0) {
    return false;
  }

  let anySent = false;
  for (const sub of local.subscribers) {
    try {
      await fetch(`https://api.telegram.org/bot${local.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: sub.chatId,
          text: `🌙 <b>Rappel de déconnexion Minimal</b>\n\n${message}\n\n<i>Posez votre téléphone et préservez votre sommeil.</i>`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ J'arrête mon téléphone", callback_data: 'confirm_night' }],
            ],
          },
        }),
      });
      anySent = true;
    } catch (err) {
      console.warn(`Failed to send direct telegram alert to ${sub.chatId}:`, err);
    }
  }
  return anySent;
}

/**
 * Save Telegram bot token entered by user directly in the UI
 * Validates with Telegram API directly so it works on Vercel without a backend!
 */
export async function saveTelegramToken(
  rawToken: string
): Promise<{ success: boolean; botUsername?: string; botFirstName?: string; error?: string }> {
  const token = (rawToken || '').trim();
  if (!token) {
    return { success: false, error: 'Le token ne peut pas être vide' };
  }

  // Rough format validation (123456789:ABCdef...)
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    return {
      success: false,
      error: 'Format de token invalide. Il doit ressembler à : 123456789:AAFlkmx_...',
    };
  }

  // 1. Direct validation with Telegram API (CORS supported!)
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();

    if (!data.ok || !data.result) {
      return {
        success: false,
        error: data.description || 'Token rejeté par l’API Telegram. Vérifiez auprès de @BotFather.',
      };
    }

    const username = data.result.username || '';
    const firstName = data.result.first_name || 'Bot Telegram';

    // Save in client localStorage
    const existing = getLocalTelegramConfig();
    const newConfig: LocalTelegramConfig = {
      token,
      botUsername: username,
      botFirstName: firstName,
      subscribers: existing?.token === token ? existing.subscribers : (existing?.subscribers || []),
      lastUpdateId: existing?.token === token ? existing.lastUpdateId : 0,
    };

    // If bot matches Geoffroy's bot and no subscriber yet, pre-link Geoffroy's chat ID
    if (username.toLowerCase().includes('geoffroy') && newConfig.subscribers.length === 0) {
      newConfig.subscribers.push({
        chatId: '7712575789',
        name: 'Geoffroy',
        username: 'Gang_gang_bitchass_nigeria',
        registeredAt: Date.now(),
      });
    }

    saveLocalTelegramConfig(newConfig);

    // Auto-detect subscribers immediately if messages exist
    try {
      const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`);
      const updatesData = await updatesRes.json();
      if (updatesData.ok && Array.isArray(updatesData.result)) {
        const subsMap = new Map<string, TelegramSubscriberItem>();
        newConfig.subscribers.forEach((s) => subsMap.set(s.chatId, s));

        for (const u of updatesData.result) {
          const chat = u.message?.chat || u.callback_query?.message?.chat;
          const from = u.message?.from || u.callback_query?.from;
          if (chat && chat.id) {
            const chatId = String(chat.id);
            if (!subsMap.has(chatId)) {
              subsMap.set(chatId, {
                chatId,
                name: from?.first_name || chat.first_name || 'Utilisateur',
                username: from?.username || chat.username,
                registeredAt: Date.now(),
              });
            }
          }
        }
        newConfig.subscribers = Array.from(subsMap.values());
        saveLocalTelegramConfig(newConfig);
      }
    } catch {
      // Non-blocking
    }

    // 2. Best-effort server sync (in case a backend is running)
    fetch('/api/telegram/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).catch(() => {});

    return {
      success: true,
      botUsername: username,
      botFirstName: firstName,
    };
  } catch (directErr: any) {
    // If direct browser request was blocked (e.g. adblocker), try server fallback
    try {
      const res = await fetch('/api/telegram/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      return data;
    } catch {
      return {
        success: false,
        error: `Impossible de joindre Telegram: ${directErr?.message || 'Erreur réseau'}. Vérifiez votre connexion internet.`,
      };
    }
  }
}

/**
 * Remove Telegram bot token
 */
export async function deleteTelegramToken(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(LOCAL_TELEGRAM_KEY);
    } catch {
      // ignore
    }
  }
  try {
    await fetch('/api/telegram/token', { method: 'DELETE' });
  } catch {
    // ignore
  }
  return true;
}

/**
 * Syncs the curfew schedule with the server for Telegram and background dispatch
 */
export async function syncCurfewScheduleWithServer(
  settings: DisconnectReminderSettings
): Promise<boolean> {
  try {
    const timezoneOffset = new Date().getTimezoneOffset();
    const res = await fetch('/api/curfew/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
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
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
