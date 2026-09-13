import React, { useState, useEffect } from 'react';
import {
  AppLauncherItem,
  UserStats,
  UserPreferences,
  ThemeMode,
  FocusSession,
} from './types';
import {
  loadStats,
  saveStats,
  loadPreferences,
  savePreferences,
  toggleDayCompletion,
  loadFocusSession,
  saveFocusSession,
  recordCompletedFocusSession,
} from './utils/storage';
import { playMinimalClick, triggerHaptic } from './utils/audio';
import { launchAppUrl, getPrimaryDeepLink } from './utils/launcher';
import { ClockHeader } from './components/ClockHeader';
import { AppGrid } from './components/AppGrid';
import { StreakPage } from './components/StreakPage';
import { MindfulModal } from './components/MindfulModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { FocusSetupModal } from './components/FocusSetupModal';
import { FocusModeScreen } from './components/FocusModeScreen';
import { Smartphone, Monitor } from 'lucide-react';

export default function App() {
  const [stats, setStats] = useState<UserStats>(loadStats);
  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);
  const [currentView, setCurrentView] = useState<'home' | 'streak'>('home');
  const [pendingApp, setPendingApp] = useState<AppLauncherItem | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFocusSetupOpen, setIsFocusSetupOpen] = useState(false);
  const [activeFocusSession, setActiveFocusSession] = useState<FocusSession | null>(loadFocusSession);
  const [desktopPhoneFrame, setDesktopPhoneFrame] = useState(true);

  // Sync theme changes to html body background
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (preferences.theme === 'eink') {
      root.className = 'h-full bg-[#d5d3cb] text-[#1a1a1a]';
      body.className = 'h-full bg-[#d5d3cb] text-[#1a1a1a] antialiased select-none';
    } else if (preferences.theme === 'light') {
      root.className = 'h-full bg-[#f6f6f7] text-[#121212]';
      body.className = 'h-full bg-[#f6f6f7] text-[#121212] antialiased select-none';
    } else {
      // OLED / Default dark
      root.className = 'h-full bg-[#0a0a0a] text-[#ededed]';
      body.className = 'h-full bg-[#0a0a0a] text-[#ededed] antialiased select-none';
    }
  }, [preferences.theme]);

  const handleUpdatePreferences = (newPrefs: UserPreferences) => {
    setPreferences(newPrefs);
    savePreferences(newPrefs);
  };

  const handleResetData = () => {
    localStorage.removeItem('minimal_launcher_stats_v1');
    const fresh = loadStats();
    setStats(fresh);
    setIsSettingsOpen(false);
  };

  const handleSelectApp = (app: AppLauncherItem) => {
    playMinimalClick(preferences.soundEnabled);
    triggerHaptic(preferences.hapticsEnabled);

    if (preferences.intentionalPause) {
      setPendingApp(app);
    } else {
      // Directly launch with priority to device-specific deep link
      const urlToOpen = getPrimaryDeepLink(app) || app.deepLink || app.url;
      launchAppUrl(urlToOpen, app.url);
    }
  };

  const handleDirectLaunch = (url: string, fallbackUrl?: string) => {
    setPendingApp(null);
    launchAppUrl(url, fallbackUrl);
  };

  const handleToggleDay = (screenHours?: number, reflection?: string) => {
    const today = new Date().toISOString().split('T')[0];
    const updated = toggleDayCompletion(today, screenHours, reflection);
    setStats(updated);
  };

  const handleStartFocus = (durationMinutes: number) => {
    const now = Date.now();
    const newSession: FocusSession = {
      isActive: true,
      durationMinutes,
      startTime: now,
      endTime: now + durationMinutes * 60 * 1000,
    };
    saveFocusSession(newSession);
    setActiveFocusSession(newSession);
    setIsFocusSetupOpen(false);
    setCurrentView('home');
  };

  const handleCompleteFocus = (durationMinutes: number) => {
    saveFocusSession(null);
    setActiveFocusSession(null);
    const updated = recordCompletedFocusSession(durationMinutes);
    setStats(updated);
  };

  const handleCancelFocus = () => {
    saveFocusSession(null);
    setActiveFocusSession(null);
  };

  const isLight = preferences.theme === 'light';
  const isEink = preferences.theme === 'eink';

  const themeBg = isLight
    ? 'bg-[#f6f6f7]'
    : isEink
    ? 'bg-[#d5d3cb]'
    : 'bg-[#0a0a0a]';

  const containerBg = isLight
    ? 'bg-white/70'
    : isEink
    ? 'bg-[#dedcd4]'
    : 'bg-[#0f0f10]';

  const borderColor = isLight
    ? 'border-neutral-200'
    : isEink
    ? 'border-neutral-400'
    : 'border-neutral-800';

  return (
    <main
      className={`min-h-full w-full flex flex-col items-center justify-center p-0 sm:p-4 md:p-6 transition-colors duration-200 ${themeBg}`}
    >
      {/* Desktop view frame switcher toggle */}
      <div className="hidden sm:flex fixed top-3 right-4 z-40 items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border backdrop-blur-md bg-black/40 border-neutral-800 text-neutral-400 shadow-sm">
        <button
          onClick={() => setDesktopPhoneFrame(true)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition ${
            desktopPhoneFrame ? 'bg-neutral-700 text-white' : 'hover:text-neutral-200'
          }`}
          title="Format Téléphone Mobile"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Mobile</span>
        </button>
        <button
          onClick={() => setDesktopPhoneFrame(false)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition ${
            !desktopPhoneFrame ? 'bg-neutral-700 text-white' : 'hover:text-neutral-200'
          }`}
          title="Plein Écran"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Large</span>
        </button>
      </div>

      {/* Main Mobile Launcher Chassis */}
      <div
        className={`w-full transition-all duration-300 flex flex-col ${
          desktopPhoneFrame
            ? 'max-w-[420px] min-h-screen sm:min-h-[780px] sm:max-h-[92vh] sm:rounded-[36px] sm:border-4 sm:shadow-2xl overflow-y-auto sm:my-auto'
            : 'max-w-xl min-h-screen sm:rounded-2xl sm:border p-4'
        } ${containerBg} ${borderColor} relative`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 16px)',
          paddingBottom: 'env(safe-area-inset-bottom, 24px)',
        }}
      >
        {/* Subtle mobile notch speaker indicator on desktop */}
        {desktopPhoneFrame && (
          <div className="hidden sm:flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-20 h-3.5 rounded-full bg-neutral-900/60 border border-neutral-800/40 flex items-center justify-center">
              <div className="w-8 h-1 rounded-full bg-neutral-700/60" />
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between px-4 sm:px-6 py-2">
          {activeFocusSession && activeFocusSession.isActive ? (
            /* Focus Mode Screen: Completely blocks access during countdown, then displays visual & auditory completion alert */
            <FocusModeScreen
              session={activeFocusSession}
              onComplete={handleCompleteFocus}
              onCancel={handleCancelFocus}
              theme={preferences.theme}
              soundEnabled={preferences.soundEnabled}
            />
          ) : currentView === 'home' ? (
            <div className="flex-1 flex flex-col justify-between">
              {/* Header with Digital Clock & Mindful quote */}
              <ClockHeader
                currentStreak={stats.currentStreak}
                totalDays={stats.totalDaysSuccessful}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenStreak={() => {
                  playMinimalClick(preferences.soundEnabled);
                  setCurrentView('streak');
                }}
                theme={preferences.theme}
              />

              {/* Central App Launcher Grid (The 5 requested apps + Focus button + Streak button) */}
              <AppGrid
                onSelectApp={handleSelectApp}
                onOpenStreakPage={() => {
                  playMinimalClick(preferences.soundEnabled);
                  setCurrentView('streak');
                }}
                onOpenFocusSetup={() => {
                  playMinimalClick(preferences.soundEnabled);
                  setIsFocusSetupOpen(true);
                }}
                theme={preferences.theme}
                currentStreak={stats.currentStreak}
              />

              {/* Bottom PWA home-screen installer & subtle footer */}
              <footer className="mt-6 flex flex-col items-center">
                <PWAInstallBanner theme={preferences.theme} />
                <div className="mt-3 text-[10px] tracking-widest uppercase opacity-40 font-mono">
                  Focus • Moins d'écran, plus de vie
                </div>
              </footer>
            </div>
          ) : (
            /* Dedicated Screen Time Reduction Streak & Days Page */
            <StreakPage
              stats={stats}
              onBack={() => setCurrentView('home')}
              onToggleToday={handleToggleDay}
              theme={preferences.theme}
              soundEnabled={preferences.soundEnabled}
            />
          )}
        </div>

        {/* Focus Mode Setup Modal */}
        <FocusSetupModal
          isOpen={isFocusSetupOpen}
          onClose={() => setIsFocusSetupOpen(false)}
          onStartFocus={handleStartFocus}
          theme={preferences.theme}
          soundEnabled={preferences.soundEnabled}
        />

        {/* Intentional Mindful Pause Modal */}
        <MindfulModal
          app={pendingApp}
          onClose={() => setPendingApp(null)}
          onLaunch={handleDirectLaunch}
          theme={preferences.theme}
          soundEnabled={preferences.soundEnabled}
        />

        {/* Settings and Customization Drawer */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          prefs={preferences}
          onUpdatePrefs={handleUpdatePreferences}
          onResetData={handleResetData}
        />
      </div>
    </main>
  );
}
