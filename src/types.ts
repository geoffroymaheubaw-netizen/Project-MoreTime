export type ThemeMode = 'oled' | 'eink' | 'chalk' | 'light';

export interface AppLauncherItem {
  id: string;
  name: string;
  category: string;
  url: string;
  deepLink?: string;
  iconName: 'notebook' | 'claude' | 'chatgpt' | 'calendar' | 'apple-notes' | 'stats';
  description: string;
  intentPrompt?: string;
}

export interface DayLog {
  date: string; // YYYY-MM-DD
  completed: boolean;
  screenTimeHours?: number;
  reflection?: string;
  timestamp: number;
  focusMinutesCompleted?: number;
}

export interface FocusSession {
  isActive: boolean;
  durationMinutes: number;
  startTime: number;
  endTime: number;
}

export interface UserStats {
  currentStreak: number;
  longestStreak: number;
  totalDaysSuccessful: number;
  firstUsedDate: string;
  totalFocusMinutesCompleted?: number;
  logs: Record<string, DayLog>; // keyed by YYYY-MM-DD
}

export interface UserPreferences {
  theme: ThemeMode;
  intentionalPause: boolean; // 3-second mindful pause before opening apps
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  quoteOfDay: boolean;
  targetDailyScreenTimeHours: number;
}
