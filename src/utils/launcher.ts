import { AppLauncherItem } from '../types';

/**
 * Checks if a string is a native custom URI scheme or Android intent
 */
export function isCustomScheme(url: string): boolean {
  return (
    /^[a-zA-Z0-9_-]+:/.test(url) &&
    !url.startsWith('http://') &&
    !url.startsWith('https://')
  );
}

/**
 * Detects mobile platform
 */
export function getMobilePlatform(): 'android' | 'ios' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

/**
 * Resolves the primary deep link for a given application based on device OS
 */
export function getPrimaryDeepLink(app: AppLauncherItem): string | undefined {
  const platform = getMobilePlatform();

  if (app.id === 'google-notebook') {
    if (platform === 'android') {
      // Android intent directly targeting Google NotebookLM app package
      return 'intent://notebooklm.google.com/#Intent;scheme=https;package=com.google.android.apps.labs.language.tailwind;S.browser_fallback_url=https%3A%2F%2Fnotebooklm.google.com;end';
    }
    // On iOS, direct navigation to notebooklm.google.com triggers the iOS Universal Link for the installed NotebookLM app
    return 'https://notebooklm.google.com/';
  }

  if (app.id === 'claude-ai') {
    if (platform === 'android') {
      // Android Chrome intent explicitly invoking com.anthropic.claude
      return 'intent://claude.ai/new#Intent;scheme=claude;package=com.anthropic.claude;S.browser_fallback_url=https%3A%2F%2Fclaude.ai;end';
    }
    // iOS and general: Claude requires host claude.ai/new
    return 'claude://claude.ai/new';
  }

  if (app.id === 'chat-gpt') {
    if (platform === 'android') {
      return 'intent://#Intent;scheme=chatgpt;package=com.openai.chatgpt;S.browser_fallback_url=https%3A%2F%2Fchatgpt.com;end';
    }
    return 'chatgpt://';
  }

  if (app.id === 'zentube') {
    if (platform === 'android') {
      return 'intent://zentube.app/#Intent;scheme=https;package=com.intenca.zentube;S.browser_fallback_url=https%3A%2F%2Fzentube.app%2F;end';
    }
    return 'zentube://';
  }

  if (app.id === 'weather') {
    if (platform === 'ios') {
      // Official Apple Weather app scheme on iPhone / iPad
      return 'weather://';
    }
    if (platform === 'android') {
      // Android intent to open Google Weather or device weather provider with fallback
      return 'intent://www.google.com/search?q=meteo#Intent;scheme=https;package=com.google.android.googlequicksearchbox;S.browser_fallback_url=https%3A%2F%2Fmeteofrance.com;end';
    }
    return 'weather://';
  }

  return app.deepLink;
}

/**
 * Resolves an alternative deep link if the primary one doesn't trigger on a specific browser
 */
export function getAlternativeDeepLink(app: AppLauncherItem): string | undefined {
  const platform = getMobilePlatform();

  if (app.id === 'weather') {
    if (platform === 'android') {
      // Direct custom weather scheme common on Samsung and other Android vendors
      return 'weather://';
    }
    return 'https://meteofrance.com/';
  }

  if (app.id === 'google-notebook') {
    if (platform === 'android') {
      // Direct launcher action intent for NotebookLM
      return 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.google.android.apps.labs.language.tailwind;end';
    }
    // Alternate fallback (e.g. Google Keep in case user meant Google Keep Notes)
    return 'googlekeep://';
  }

  if (app.id === 'claude-ai') {
    if (platform === 'android') {
      // Alternative for Android (direct custom scheme)
      return 'claude://claude.ai/new';
    }
    // Alternative for iOS
    return 'claude://claude.ai/';
  }

  if (app.id === 'chat-gpt') {
    if (platform === 'android') {
      return 'chatgpt://';
    }
    return 'com.openai.chat://';
  }

  return undefined;
}

/**
 * Triggers launch of an app via deep link or web fallback
 */
export function launchAppUrl(targetUrl: string, fallbackWebUrl?: string, isAppTarget: boolean = false): void {
  const isScheme = isCustomScheme(targetUrl);
  // If it's a custom scheme OR if it's explicitly designated as an app target (e.g. Universal Link like NotebookLM on iOS)
  if (isScheme || isAppTarget || targetUrl.includes('notebooklm.google.com')) {
    // 1. Direct window navigation (safest and triggers native app handlers on iOS and Android)
    try {
      window.location.href = targetUrl;
    } catch (e) {
      console.warn('Direct location.href launch error:', e);
    }

    // 2. Also click a hidden anchor as secondary trigger
    try {
      const anchor = document.createElement('a');
      anchor.href = targetUrl;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (e) {
      // Ignore
    }

    // Optional fallback to web if app is not installed and user is still on page after a delay
    if (fallbackWebUrl && fallbackWebUrl !== targetUrl) {
      const timeout = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          console.info('App may not be installed, web link is available');
        }
      }, 2500);

      window.addEventListener(
        'pagehide',
        () => clearTimeout(timeout),
        { once: true }
      );
    }
  } else {
    // Standard web URL in new tab
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }
}
