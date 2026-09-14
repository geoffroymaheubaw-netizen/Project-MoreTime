import express from 'express';
import path from 'path';
import fs from 'fs';
import webpush from 'web-push';
import { createServer as createViteServer } from 'vite';

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
    const generated = webpush.generateVAPIDKeys();
    vapidPublicKey = generated.publicKey;
    vapidPrivateKey = generated.privateKey;
    try {
      fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), 'utf-8');
      console.log('Generated new persistent VAPID keys in vapid-keys.json');
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

// Background scheduler checking every 30 seconds
setInterval(async () => {
  if (subscribers.size === 0) return;

  const now = new Date();
  let hasChanges = false;

  for (const [id, sub] of subscribers.entries()) {
    const { settings } = sub;
    if (!settings.enabled) continue;

    const evaluation = evaluateSubscriberCurfew(settings, now);
    if (!evaluation.isCurfewActive) continue;

    const { cycleKey, minutesElapsed } = evaluation;

    // If user already pressed "J'arrête mon téléphone" on site for this cycle, skip
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
}, 30000);

// -----------------------------------------------------------------------------
// Express App & API Endpoints
// -----------------------------------------------------------------------------
async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Return VAPID Public Key for client subscription
  app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({
      publicKey: vapidPublicKey,
      status: 'active',
    });
  });

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
  app.post('/api/push/confirm-night', (req, res) => {
    const { subscription, cycleKey } = req.body;
    let targetCycle = cycleKey;

    if (!targetCycle) {
      const now = new Date();
      targetCycle = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    if (subscription && subscription.endpoint) {
      const id = getSubscriptionId(subscription);
      const sub = subscribers.get(id);
      if (sub) {
        sub.settings.userConfirmedNightCycle = targetCycle;
        sub.updatedAt = Date.now();
        saveSubscribersToDisk();
      }
    } else {
      // Mark for all if called without subscription ID
      for (const sub of subscribers.values()) {
        sub.settings.userConfirmedNightCycle = targetCycle;
        sub.updatedAt = Date.now();
      }
      saveSubscribersToDisk();
    }

    res.json({ success: true, confirmedCycle: targetCycle });
  });

  // 6. Push status info
  app.get('/api/push/status', (req, res) => {
    res.json({
      vapidConfigured: Boolean(vapidPublicKey && vapidPrivateKey),
      subscribersCount: subscribers.size,
      serverTime: new Date().toISOString(),
    });
  });

  // Health route
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
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
