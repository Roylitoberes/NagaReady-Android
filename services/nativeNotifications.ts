// services/nativeNotifications.ts
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// ✅ Detect Expo Go — native notifications are NOT supported there (SDK 53+)
const isExpoGo = Constants.appOwnership === 'expo';

// ✅ Global handler: how a notification behaves when it arrives
//    while the app is in the foreground
if (!isExpoGo) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (e) {
    console.warn('Could not set notification handler:', e);
  }
}

let permissionsRequested = false;

/**
 * Ask for notification permission (once per app session).
 * Returns true if granted.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  // ✅ Skip entirely in Expo Go
  if (isExpoGo) {
    console.log('ℹ️ Skipping notification permission (Expo Go)');
    return false;
  }

  try {
    if (permissionsRequested) {
      const current = await Notifications.getPermissionsAsync();
      return !!current.granted;
    }

    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      permissionsRequested = true;
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    permissionsRequested = true;
    return !!requested.granted;
  } catch (e) {
    console.warn('Notification permission error:', e);
    return false;
  }
}

/**
 * Android needs a notification channel before any notification appears.
 * Safe to call multiple times.
 */
export async function setupAndroidChannel(): Promise<void> {
  // ✅ Skip entirely in Expo Go
  if (isExpoGo) return;
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'NagaReady Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF4444',
      sound: 'default',
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  } catch (e) {
    console.warn('Channel setup error:', e);
  }
}

/**
 * Fire a native OS notification (pop-up on the phone, even if the
 * app is minimized / background).
 */
export async function showNativeNotification(params: {
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<void> {
  // ✅ Skip entirely in Expo Go — no native notifications there
  if (isExpoGo) {
    console.log(
      'ℹ️ [Expo Go] Would fire native notification:',
      params.title,
    );
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        data: params.data ?? {},
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        // @ts-ignore - Android-only field
        channelId: 'default',
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('showNativeNotification error:', e);
  }
}