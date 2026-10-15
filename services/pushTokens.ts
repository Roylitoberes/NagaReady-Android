// services/pushTokens.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { firestore } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const isExpoGo = Constants.appOwnership === 'expo';

export async function getExpoPushToken(): Promise<string | null> {
  if (isExpoGo) {
    console.log('ℹ️ Skipping push token (Expo Go)');
    return null;
  }

  if (!Device.isDevice) {
    console.log('ℹ️ Skipping push token (simulator/emulator)');
    return null;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('ℹ️ Push notification permission not granted');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'NagaReady Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF4444',
        sound: 'default',
      });
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('⚠️ No EAS project ID — cannot get push token');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log('✅ Expo push token:', tokenData.data);
    return tokenData.data;
  } catch (e) {
    console.warn('❌ getExpoPushToken error:', e);
    return null;
  }
}

export async function registerPushTokenForUser(userId: string): Promise<void> {
  if (!userId) return;

  const token = await getExpoPushToken();
  if (!token) return;

  try {
    await setDoc(
      doc(firestore, 'user_push_tokens', userId),
      {
        userId,
        token,
        platform: Platform.OS,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    console.log('✅ Push token saved to Firestore for user:', userId);
  } catch (e) {
    console.warn('❌ Could not save push token:', e);
  }
}