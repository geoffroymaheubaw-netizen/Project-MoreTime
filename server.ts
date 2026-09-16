import express from 'express';
import path from 'path';
import fs from 'fs';
import webpush from 'web-push';
import { createServer as createViteServer } from 'vite';
import {
  isTelegramConfigured,
  getBotInfo,
  getTelegramSubscribers,
  pollTelegramUpdates,
  sendTelegramMessage,
  sendTestTelegramAlert,
  setBotToken,
  removeBotToken,
} from './server/telegram.js';

const PORT = 3000;
const HOST = '0.0.0.0';

// -----------------------------------------------------------------------------
// VAPID Keys Setup for Background Web Push
// -----------------------------------------------------------------------------
const VAPID_FILE = path.join(process.cwd(), 'vapid-keys.json');
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';

if (!vapidPublicKey || !vapidPrivateKey) {
  try {
    if (fs.existsSync(VAPID_FILE)) {
      const content = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
      vapidPublicKey = content.publicKey;
      vapidPrivateKey = content.privateKey;
    }
  } catch (err) {
    console.warn('Could not read vapid-keys.json, generating fresh keys:', err);
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    vapidPublicKey =
      'BOqosgxB-i2KnBDmDa3xdqAxkdfXwvidgeNMN09dRALQDvFu4wKMBf_6wORvxsupU-8K8Rzp0CBzGQ28LJjSFs4';
    vapidPrivateKey = 'c9Q8xnm8dI4GiLoIW1tSLG5DMOssWo85Alt-BIW6wo8';
    try {
      fs.writeFileSync(
        VAPID_FILE,
        JSON.stringify({ publicKey: vapidPublicKey, privateKey: vapidPrivateKey }, null, 2),
        'utf-8'
      );
      console.log('Saved default persistent VAPID keys in vapid-keys.json');
    } catch (err) {
      console.warn('Could not save vapid-keys.json:', err);
    }
  }
}

const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@minimal-launcher.app';

try {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  console.log('Web Push VAPID details successfully configured');
} catch (err) {
  console.error('Failed to configure Web Push VAPID details:', err);
}

// -----------------------------------------------------------------------------
// Push Subscription Storage & Types
// -----------------------------------------------------------------------------
interface SubscriberSettings {
  enabled: boolean;
  time?: string;
  weekdayTime?: string;
  weekendTime?: string;
  scheduleMode?: 'unified' | 'weekdays_weekend' | 'custom_days';
  dayTimes?: Record<number, { enabled: boolean; time: string }>;
  days: number[];
  repeatIntervalMinutes?: number;
  customMessage?: string;
  timezoneOffset: number; // in minutes (e.g. -120)
  userConfirmedNightCycle?: string | null;
  lastPushTimestamp?: number;
  lastPushCycle?: string;
}

interface StoredSubscriber {
  id: string;
  subscription: webpush.PushSubscription;
  settings: SubscriberSettings;
  createdAt: number;
  updatedAt: number;
}

const SUBSCRIPTIONS_FILE = path.join(process.cwd(), 'push-subscriptions.json');
let subscribers: Map<string, StoredSubscriber> = new Map();

function loadSubscribersFromDisk() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const data: StoredSubscriber[] = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'));
      subscribers = new Map(data.map((sub) => [sub.id, sub]));
      console.log(`Loaded ${subscribers.size} push subscriptions from disk`);
    }
  } catch (err) {
    console.warn('Could not read push-subscriptions.json:', err);
  }
}

function saveSubscribersToDisk() {
  try {
    const data = Array.from(subscribers.values());
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save push-subscriptions.json:', err);
  }
}

loadSubscribersFromDisk();

function getSubscriptionId(sub: webpush.PushSubscription): string {
  return Buffer.from(sub.endpoint).toString('base64').slice(-32);
}

// -----------------------------------------------------------------------------
// Global Curfew Settings Storage (shared for Telegram & Web Push)
// -----------------------------------------------------------------------------
const CURFEW_FILE = path.join(process.cwd(), 'curfew-settings.json');
let globalCurfewSettings: SubscriberSettings = {
  enabled: true,
  time: '21:30',
  weekdayTime: '21:30',
  weekendTime: '23:00',
  scheduleMode: 'weekdays_weekend',
  days: [1, 2, 3, 4, 5, 6, 0],
  repeatIntervalMinutes: 10,
  customMessage: "Il est l'heure de déconnecter et de reposer votre esprit.",
  timezoneOffset: 0,
  userConfirmedNightCycle: null,
  lastPushTimestamp: 0,
  lastPushCycle: '',
};

function loadCurfewSettings() {
  try {
    if (fs.existsSync(CURFEW_FILE)) {
      const data = JSON.parse(fs.readFileSync(CURFEW_FILE, 'utf-8'));
      globalCurfewSettings = { ...globalCurfewSettings, ...data };
      console.log('[Curfew] Loaded global curfew settings from disk');
    }
  } catch (err) {
    console.warn('Could not read curfew-settings.json:', err);
  }
}

function saveCurfewSettings() {
  try {
    fs.writeFileSync(CURFEW_FILE, JSON.stringify(globalCurfewSettings, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save curfew-settings.json:', err);
  }
}

loadCurfewSettings();

// -----------------------------------------------------------------------------
// Curfew Evaluation Logic on Server (runs even when phone/browser is closed)
// -----------------------------------------------------------------------------
function resolveScheduledTimeForUser(
  settings: SubscriberSettings,
  userDayIndex: number
): { enabled: boolean; time: string } {
  const mode = settings.scheduleMode || 'weekdays_weekend';

  if (mode === 'custom_days' && settings.dayTimes && settings.dayTimes[userDayIndex]) {
    return {
      enabled: settings.dayTimes[userDayIndex].enabled,
      time: settings.dayTimes[userDayIndex].time || settings.time || '21:30',
    };
  }

  if (mode === 'weekdays_weekend') {
    const isWeekend = userDayIndex === 0 || userDayIndex === 6;
    const isDayActive = settings.days.includes(userDayIndex);
    const targetTime = isWeekend
      ? settings.weekendTime || '23:00'
      : settings.weekdayTime || '21:30';
    return {
      enabled: isDayActive,
      time: targetTime,
    };
  }

  return {
    enabled: settings.days.includes(userDayIndex),
    time: settings.time || '21:30',
  };
}

function computeCycleKey(userDate: Date, targetTimeStr: string): string {
  const d = new Date(userDate);
  const [h] = (targetTimeStr || '21:30').split(':').map(Number);
  if (h >= 12 && d.getUTCHours() < 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function sendWebPushToSubscriber(
  sub: StoredSubscriber,
  title: string,
  body: string,
  cycleKey?: string
): Promise<boolean> {
  const payload = JSON.stringify({
    title,
    body,
    tag: 'curfew-disconnect',
    url: '/',
    cycleKey,
    timestamp: Date.now(),
  });

  try {
    await webpush.sendNotification(sub.subscription, payload, {
      TTL: 3600, // 1 hour TTL
      urgency: 'high',
    });
    console.log(`[Push] Delivered push notification to ${sub.id.slice(0, 8)}: "${title}"`);
    return true;
  } catch (error: any) {
    console.warn(`[Push Error] for ${sub.id.slice(0, 8)}:`, error?.statusCode || error?.message);
    // If subscription is expired or unregistered on device (404/410), delete it
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      subscribers.delete(sub.id);
      saveSubscribersToDisk();
      console.log(`Cleaned up expired subscription ${sub.id.slice(0, 8)}`);
    }
    return false;
  }
}

function evaluateSubscriberCurfew(
  settings: SubscriberSettings,
  now: Date
): {
  isCurfewActive: boolean;
  cycleKey: string;
  scheduledTime: string;
  minutesElapsed: number;
} {
  // Convert UTC server time to user's local time using their reported timezoneOffset (in minutes)
  const userLocalMs = now.getTime() - settings.timezoneOffset * 60000;
  const userLocalDate = new Date(userLocalMs);

  const todayIndex = userLocalDate.getUTCDay();
  const currentHour = userLocalDate.getUTCHours();

  // 1. Check early morning (< 06:00) continuation of yesterday's evening curfew
  if (currentHour < 6) {
    const yesterdayIndex = (todayIndex + 6) % 7;
    const yesterdaySchedule = resolveScheduledTimeForUser(settings, yesterdayIndex);
    if (yesterdaySchedule.enabled) {
      const [yH, yM] = yesterdaySchedule.time.split(':').map(Number);
      if (yH >= 12) {
        const yDate = new Date(userLocalDate);
        yDate.setUTCDate(yDate.getUTCDate() - 1);
        yDate.setUTCHours(yH, yM, 0, 0);

        const diffYMs = userLocalMs - yDate.getTime();
        const yMinutesElapsed = Math.floor(diffYMs / 60000);
        // Active from yesterday evening until 06:00 AM next morning (max 10 hours)
        if (diffYMs >= 0 && diffYMs <= 10 * 3600 * 1000) {
          const cycleKey = computeCycleKey(userLocalDate, yesterdaySchedule.time);
          return {
            isCurfewActive: settings.enabled,
            cycleKey,
            scheduledTime: yesterdaySchedule.time,
            minutesElapsed: yMinutesElapsed,
          };
        }
      }
    }
  }

  // 2. Today's schedule
  const todaySchedule = resolveScheduledTimeForUser(settings, todayIndex);
  const cycleKey = computeCycleKey(userLocalDate, todaySchedule.time);

  if (!settings.enabled || !todaySchedule.enabled) {
    return {
      isCurfewActive: false,
      cycleKey,
      scheduledTime: todaySchedule.time,
      minutesElapsed: 0,
    };
  }

  const [tH, tM] = todaySchedule.time.split(':').map(Number);
  const targetDate = new Date(userLocalDate);
  targetDate.setUTCHours(tH, tM, 0, 0);

  const diffMs = userLocalMs - targetDate.getTime();
  const minutesElapsed = Math.floor(diffMs / 60000);
  const isCurfewActive = diffMs >= 0 && diffMs <= 10 * 3600 * 1000;

  return {
    isCurfewActive,
    cycleKey,
    scheduledTime: todaySchedule.time,
    minutesElapsed,
  };
}

// Background scheduler checking every 20 seconds
setInterval(async () => {
  const now = new Date();

  // 1. Poll Telegram updates (new subscribers or button clicks)
  if (isTelegramConfigured()) {
    await pollTelegramUpdates((confirmedCycleKey) => {
      const cycle =
        confirmedCycleKey ||
        globalCurfewSettings.lastPushCycle ||
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      globalCurfewSettings.userConfirmedNightCycle = cycle;
      saveCurfewSettings();
      for (const sub of subscribers.values()) {
        sub.settings.userConfirmedNightCycle = cycle;
        sub.updatedAt = Date.now();
      }
      saveSubscribersToDisk();
      console.log(`[Telegram Curfew] Night cycle ${cycle} confirmed via Telegram button`);
    });
  }

  // 2. Evaluate Telegram Curfew notifications
  const telegramSubscribers = getTelegramSubscribers();
  if (isTelegramConfigured() && telegramSubscribers.length > 0 && globalCurfewSettings.enabled) {
    const tgEvaluation = evaluateSubscriberCurfew(globalCurfewSettings, now);
    if (tgEvaluation.isCurfewActive) {
      const { cycleKey, minutesElapsed } = tgEvaluation;
      if (globalCurfewSettings.userConfirmedNightCycle !== cycleKey) {
        const hasTriggeredInCycle =
          globalCurfewSettings.lastPushCycle === cycleKey &&
          typeof globalCurfewSettings.lastPushTimestamp === 'number' &&
          globalCurfewSettings.lastPushTimestamp > 0;

        const intervalMinutes = globalCurfewSettings.repeatIntervalMinutes || 10;
        const intervalMs = intervalMinutes * 60 * 1000;

        let shouldSendTelegram = false;
        let tgText = '';

        if (!hasTriggeredInCycle) {
          shouldSendTelegram = true;
          tgText =
            `🌙 <b>Il est l'heure de déconnecter</b>\n\n` +
            (globalCurfewSettings.customMessage || "Il est l'heure de lâcher votre téléphone et de reposer votre esprit.") +
            (minutesElapsed > 0 ? `\n\n<i>Couvre-feu dépassé de ${minutesElapsed} min.</i>` : '') +
            `\n\nAppuyez sur le bouton ci-dessous lorsque vous posez votre téléphone :`;
        } else {
          const elapsed = Date.now() - (globalCurfewSettings.lastPushTimestamp || 0);
          if (elapsed >= intervalMs) {
            shouldSendTelegram = true;
            tgText =
              `🌙 <b>Rappel de déconnexion (+${minutesElapsed}m)</b>\n\n` +
              `Votre écran est toujours allumé. Posez votre téléphone pour une nuit réparatrice !\n\n` +
              `Appuyez sur le bouton ci-dessous pour couper les rappels cette nuit :`;
          }
        }

        if (shouldSendTelegram) {
          console.log(`[Telegram] Sending curfew reminder to ${telegramSubscribers.length} subscribers`);
          for (const tgSub of telegramSubscribers) {
            await sendTelegramMessage(tgSub.chatId, tgText, {
              withStopButton: true,
              cycleKey,
            });
          }
          globalCurfewSettings.lastPushTimestamp = Date.now();
          globalCurfewSettings.lastPushCycle = cycleKey;
          saveCurfewSettings();
        }
      }
    }
  }

  // 3. Evaluate Web Push subscribers
  if (subscribers.size > 0) {
    let hasChanges = false;
    for (const [id, sub] of subscribers.entries()) {
      const { settings } = sub;
      if (!settings.enabled) continue;

      const evaluation = evaluateSubscriberCurfew(settings, now);
      if (!evaluation.isCurfewActive) continue;

      const { cycleKey, minutesElapsed } = evaluation;

      // If user already pressed "J'arrête mon téléphone" on site or Telegram for this cycle, skip
      if (settings.userConfirmedNightCycle === cycleKey) {
        continue;
      }

      const hasTriggeredInCycle =
        settings.lastPushCycle === cycleKey &&
        typeof settings.lastPushTimestamp === 'number' &&
        settings.lastPushTimestamp > 0;

      const intervalMinutes =
        settings.repeatIntervalMinutes && settings.repeatIntervalMinutes > 0
          ? settings.repeatIntervalMinutes
          : 10;
      const intervalMs = intervalMinutes * 60 * 1000;

      let shouldSend = false;
      let pushTitle = '🌙 Lâchez votre téléphone';
      let pushBody = settings.customMessage || "Il est l'heure de déconnecter et de reposer votre esprit.";

      if (!hasTriggeredInCycle) {
        shouldSend = true;
        if (minutesElapsed > 0) {
          pushBody = `Couvre-feu dépassé (+${minutesElapsed}m) : posez votre écran et profitez d'une nuit paisible.`;
        }
      } else {
        const elapsedSinceLast = Date.now() - settings.lastPushTimestamp!;
        if (elapsedSinceLast >= intervalMs) {
          shouldSend = true;
          pushTitle = '🌙 Rappel de déconnexion';
          pushBody = `Rappel (+${minutesElapsed}m) : lâchez votre téléphone. Ouvrez Minimal et confirmez pour couper les rappels.`;
        }
      }

      if (shouldSend) {
        const sent = await sendWebPushToSubscriber(sub, pushTitle, pushBody, cycleKey);
        if (sent) {
          sub.settings.lastPushTimestamp = Date.now();
          sub.settings.lastPushCycle = cycleKey;
          sub.updatedAt = Date.now();
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      saveSubscribersToDisk();
    }
  }
}, 20000);

// -----------------------------------------------------------------------------
// Express App & API Endpoints
// -----------------------------------------------------------------------------
async function startServer() {
  const app = express();
  app.use(express.json());

  // Enable CORS for API routes so requests from iframes, previews, or PWA origins never get blocked
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 1. Return VAPID Public Key for client subscription
  const getVapidKeyHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      publicKey: vapidPublicKey,
      status: 'active',
    });
  };
  app.get('/api/push/vapid-public-key', getVapidKeyHandler);
  app.get('/api/push/public-key', getVapidKeyHandler);

  // 2. Subscribe endpoint
  app.post('/api/push/subscribe', (req, res) => {
    const { subscription, settings } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid PushSubscription object' });
    }

    const id = getSubscriptionId(subscription);
    const existing = subscribers.get(id);

    const updatedSubscriber: StoredSubscriber = {
      id,
      subscription,
      settings: {
        enabled: settings?.enabled ?? true,
        time: settings?.time || '21:30',
        weekdayTime: settings?.weekdayTime || '21:30',
        weekendTime: settings?.weekendTime || '23:00',
        scheduleMode: settings?.scheduleMode || 'weekdays_weekend',
        dayTimes: settings?.dayTimes,
        days: settings?.days || [1, 2, 3, 4, 5, 6, 0],
        repeatIntervalMinutes: settings?.repeatIntervalMinutes || 10,
        customMessage: settings?.customMessage,
        timezoneOffset: typeof settings?.timezoneOffset === 'number' ? settings.timezoneOffset : new Date().getTimezoneOffset(),
        userConfirmedNightCycle: existing?.settings.userConfirmedNightCycle || null,
        lastPushTimestamp: existing?.settings.lastPushTimestamp,
        lastPushCycle: existing?.settings.lastPushCycle,
      },
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    subscribers.set(id, updatedSubscriber);
    saveSubscribersToDisk();

    console.log(`[Push] Registered subscriber ${id.slice(0, 8)}. Total subscribers: ${subscribers.size}`);
    res.json({ success: true, id, subscribersCount: subscribers.size });
  });

  // 3. Unsubscribe endpoint
  app.post('/api/push/unsubscribe', (req, res) => {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    const id = getSubscriptionId(subscription);
    const deleted = subscribers.delete(id);
    if (deleted) {
      saveSubscribersToDisk();
      console.log(`[Push] Unsubscribed ${id.slice(0, 8)}`);
    }
    res.json({ success: true });
  });

  // 4. Test Push (allows immediate or delayed push to test phone closed/locked screen)
  app.post('/api/push/test', async (req, res) => {
    const { subscription, delaySeconds = 0, message } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription parameter' });
    }

    const title = '🌙 Test de notification (site fermé)';
    const body =
      message ||
      'Félicitations ! Les notifications fonctionnent sur votre téléphone même quand le site est fermé.';

    const id = getSubscriptionId(subscription);
    const subObj: StoredSubscriber = subscribers.get(id) || {
      id,
      subscription,
      settings: {
        enabled: true,
        days: [0, 1, 2, 3, 4, 5, 6],
        timezoneOffset: 0,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (delaySeconds > 0) {
      res.json({
        success: true,
        message: `Notification programmée dans ${delaySeconds} secondes. Vous pouvez maintenant fermer l'application ou verrouiller votre écran !`,
        delaySeconds,
      });

      setTimeout(async () => {
        await sendWebPushToSubscriber(subObj, title, body);
      }, delaySeconds * 1000);
    } else {
      const sent = await sendWebPushToSubscriber(subObj, title, body);
      res.json({ success: sent });
    }
  });

  // 5. Confirm night shutdown from notification action or in-app button
  const confirmNightHandler = (req: express.Request, res: express.Response) => {
    const { subscription, cycleKey } = req.body;
    let targetCycle = cycleKey;

    if (!targetCycle) {
      const now = new Date();
      targetCycle = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    // Update global curfew state
    globalCurfewSettings.userConfirmedNightCycle = targetCycle;
    saveCurfewSettings();

    // Update specific or all web push subscriptions
    if (subscription && subscription.endpoint) {
      const id = getSubscriptionId(subscription);
      const sub = subscribers.get(id);
      if (sub) {
        sub.settings.userConfirmedNightCycle = targetCycle;
        sub.updatedAt = Date.now();
        saveSubscribersToDisk();
      }
    } else {
      for (const sub of subscribers.values()) {
        sub.settings.userConfirmedNightCycle = targetCycle;
        sub.updatedAt = Date.now();
      }
      saveSubscribersToDisk();
    }

    console.log(`[Curfew] Night cycle ${targetCycle} confirmed by user`);
    res.json({ success: true, confirmedCycle: targetCycle });
  };

  app.post('/api/push/confirm-night', confirmNightHandler);
  app.post('/api/curfew/confirm-night', confirmNightHandler);

  // 6. Global Curfew Settings API
  app.get('/api/curfew/settings', (_req, res) => {
    res.json({ success: true, settings: globalCurfewSettings });
  });

  app.post('/api/curfew/settings', (req, res) => {
    const { settings } = req.body;
    if (settings) {
      globalCurfewSettings = {
        ...globalCurfewSettings,
        ...settings,
        timezoneOffset:
          typeof settings.timezoneOffset === 'number'
            ? settings.timezoneOffset
            : globalCurfewSettings.timezoneOffset,
      };
      saveCurfewSettings();

      // Synchronize with active push subscribers
      for (const sub of subscribers.values()) {
        sub.settings = { ...sub.settings, ...settings };
        sub.updatedAt = Date.now();
      }
      saveSubscribersToDisk();
      console.log('[Curfew] Updated global schedule settings');
    }
    res.json({ success: true, settings: globalCurfewSettings });
  });

  // 7. Telegram Bot API endpoints
  app.get('/api/telegram/status', async (_req, res) => {
    try {
      const botInfo = await getBotInfo();
      const subs = getTelegramSubscribers();
      res.json({
        configured: isTelegramConfigured(),
        botUsername: botInfo.username,
        botFirstName: botInfo.firstName,
        subscribersCount: subs.length,
        subscribers: subs.map((s) => ({
          chatId: s.chatId,
          name: s.name,
          username: s.username,
          registeredAt: s.registeredAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur statut Telegram' });
    }
  });

  app.post('/api/telegram/sync', async (_req, res) => {
    try {
      const result = await pollTelegramUpdates((confirmedCycleKey) => {
        const cycle =
          confirmedCycleKey ||
          globalCurfewSettings.lastPushCycle ||
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
        globalCurfewSettings.userConfirmedNightCycle = cycle;
        saveCurfewSettings();
        for (const sub of subscribers.values()) {
          sub.settings.userConfirmedNightCycle = cycle;
          sub.updatedAt = Date.now();
        }
        saveSubscribersToDisk();
      });
      const botInfo = await getBotInfo();
      const subs = getTelegramSubscribers();
      res.json({
        success: true,
        newSubscribers: result.newSubscribers,
        totalSubscribers: result.totalSubscribers,
        botUsername: botInfo.username,
        botFirstName: botInfo.firstName,
        subscribers: subs.map((s) => ({
          chatId: s.chatId,
          name: s.name,
          username: s.username,
          registeredAt: s.registeredAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Erreur synchronisation Telegram' });
    }
  });

  app.post('/api/telegram/test', async (req, res) => {
    try {
      const { chatId } = req.body;
      const result = await sendTestTelegramAlert(chatId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Erreur lors du test' });
    }
  });

  // Save / set bot token directly from UI
  app.post('/api/telegram/token', async (req, res) => {
    try {
      const { token } = req.body;
      const result = await setBotToken(token);
      if (result.success) {
        res.json({
          success: true,
          configured: true,
          botUsername: result.botUsername,
          botFirstName: result.botFirstName,
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Erreur serveur' });
    }
  });

  // Remove bot token from UI
  app.delete('/api/telegram/token', (_req, res) => {
    const success = removeBotToken();
    res.json({ success, configured: false });
  });

  // 8. Push status info
  app.get('/api/push/status', (_req, res) => {
    res.json({
      vapidConfigured: Boolean(vapidPublicKey && vapidPrivateKey),
      subscribersCount: subscribers.size,
      telegramConfigured: isTelegramConfigured(),
      serverTime: new Date().toISOString(),
    });
  });

  // Health route
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      telegramConfigured: isTelegramConfigured(),
      serverTime: new Date().toISOString(),
    });
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
