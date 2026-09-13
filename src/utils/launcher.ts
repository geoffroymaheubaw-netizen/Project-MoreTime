import { AppLauncherItem } from '../types';

/**
 * Checks if a string is a native custom URI scheme (e.g., chatgpt://, claude://, mobilenotes://, calshow:)
 */
export function isCustomScheme(url: string): boolean {
  return /^[a-zA-Z0-9_-]+:/.test(url) && !url.startsWith('http://') && !url.startsWith('https://');
}

/**
 * Triggers launch of an app via deep link or web fallback with mobile handling
 */
export function launchAppUrl(targetUrl: string, fallbackWebUrl?: string): void {
  if (isCustomScheme(targetUrl)) {
    // Custom URI schemes must be assigned via window.location.href or hidden anchor click
    // window.open(scheme, '_blank') fails or creates empty blank tabs on iOS/Android
    try {
      const anchor = document.createElement('a');
      anchor.href = targetUrl;
      // Do NOT set target="_blank" for custom URI schemes
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (e) {
      window.location.href = targetUrl;
    }

    // Optional fallback to web if app is not installed and user is still on page after a delay
    if (fallbackWebUrl) {
      const timeout = setTimeout(() => {
        // If document is still visible and focused, app likely isn't installed
        if (document.visibilityState === 'visible') {
          console.info('Custom scheme may not be installed, fallback ready');
        }
      }, 2000);

      window.addEventListener(
        'pagehide',
        () => {
          clearTimeout(timeout);
        },
        { once: true }
      );
    }
  } else {
    // Standard web URL
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  }
}
