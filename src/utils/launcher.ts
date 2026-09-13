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

  return app.deepLink;
}

/**
 * Resolves an alternative deep link if the primary one doesn't trigger on a specific browser
 */
export function getAlternativeDeepLink(app: AppLauncherItem): string | undefined {
  const platform = getMobilePlatform();

  if (app.id === 'claude-ai') {
    if (platform === 'android') {
      // Alternative for Android (e.g. Firefox, Samsung Browser, or direct scheme)
      return 'claude://claude.ai/new';
    }
    // Alternative for iOS (e.g. claude://claude.ai/ or claude://chat)
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
export function launchAppUrl(targetUrl: string, fallbackWebUrl?: string): void {
  if (isCustomScheme(targetUrl)) {
    // 1. Direct window navigation (safest and most recognized across iOS Safari and Android Chrome)
    try {
      window.location.href = targetUrl;
    } catch (e) {
      console.warn('Direct location.href launch error:', e);
    }

    // 2. Also click a hidden anchor as secondary trigger for browsers that restrict location.href
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
    if (fallbackWebUrl) {
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
