// App.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { firestore } from './services/firebase';

import HomePage from './components/HomePage';
import GuestHomePage from './components/GuestModePage';
import NotificationsPage from './components/NotificationsPage';
import TrackingPage from './components/TrackingPage';
import ProfilePage from './components/ProfilePage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import IncidentReportPage from './components/IncidentReportPage';
import SMSEmergencyPage from './components/SMSEmergencyPage';
import TrackResponder from './components/TrackResponder';
import OnboardingScreen from './components/OnboardingScreen';
import { TabType } from './types';

// ✅ Native OS notifications
import * as Notifications from 'expo-notifications';
import {
  ensureNotificationPermission,
  setupAndroidChannel,
  showNativeNotification,
} from './services/nativeNotifications';

// ✅ Real remote push tokens
import { registerPushTokenForUser } from './services/pushTokens';

// ─────────────────────────────────────────────────────────
// 📱 RESPONSIVE HELPERS
// ─────────────────────────────────────────────────────────
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const isTablet = SCREEN_W >= 768;

const responsiveSize = (base: number, small: number, large: number) => {
  if (SCREEN_W < 375) return small;
  if (SCREEN_W > 414) return large;
  return base;
};

const responsiveSizeWithTablet = (
  base: number,
  small: number,
  large: number,
  tablet: number,
) => {
  if (isTablet) return tablet;
  return responsiveSize(base, small, large);
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('Home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showReportPage, setShowReportPage] = useState(false);
  const [showSMSPage, setShowSMSPage] = useState(false);
  const [showRegisterPage, setShowRegisterPage] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ NEW: Profile photo shared with HomePage header
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // ✅ NEW: Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  // ✅ TrackResponder state
  const [showTrackResponder, setShowTrackResponder] = useState(false);
  const [trackResponderIncidentId, setTrackResponderIncidentId] = useState<string | undefined>(undefined);

  // ✅ Unread notification count for the bottom nav badge
  const [unreadCount, setUnreadCount] = useState(0);

  // ✅ Track which notifications we've already auto-opened
  const autoOpenedNotificationsRef = useRef<Set<string>>(new Set());
  const initialNotifLoadDoneRef = useRef(false);

  // ─────────────────────────────────────────────────────────
  // ✅ Helper: reset all overlay states
  // ─────────────────────────────────────────────────────────
  const resetOverlayStates = () => {
    setShowReportPage(false);
    setShowSMSPage(false);
    setShowRegisterPage(false);
    setShowTrackResponder(false);
    setTrackResponderIncidentId(undefined);
  };

  // ─────────────────────────────────────────────────────────
  // Session check
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const checkSession = async () => {
      try {
        const storedUserData = await AsyncStorage.getItem('userData');
        const isGuest = await AsyncStorage.getItem('isGuest');
        const onboarded = await AsyncStorage.getItem('hasOnboarded');

        if (storedUserData) {
          setUserData(JSON.parse(storedUserData));
          setIsAuthenticated(true);
          setIsGuestMode(false);
          setHasOnboarded(onboarded === 'true');
        } else if (isGuest === 'true') {
          setIsAuthenticated(true);
          setIsGuestMode(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error checking session:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, []);

  // ─────────────────────────────────────────────────────────
  // ✅ Load profile photo (shared with HomePage header)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const loadPhoto = async () => {
      try {
        const uid = userData?.uid || userData?.userId;
        if (!uid) {
          setProfilePhoto(null);
          return;
        }
        const saved = await AsyncStorage.getItem(`profilePhotoUrl_${uid}`);
        setProfilePhoto(saved);
      } catch (err) {
        console.warn('Failed to load profile photo:', err);
      }
    };

    loadPhoto();
  }, [userData?.uid, userData?.userId, activeTab]);

  // ─────────────────────────────────────────────────────────
  // ✅ Native OS notifications setup
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await setupAndroidChannel();
      await ensureNotificationPermission();
    })();
  }, []);

  // ─────────────────────────────────────────────────────────
  // ✅ Register Expo push token
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || isGuestMode || !userData?.uid) return;
    (async () => {
      await registerPushTokenForUser(userData.uid);
    })();
  }, [isAuthenticated, isGuestMode, userData?.uid]);

  // ─────────────────────────────────────────────────────────
  // ✅ Unread notifications badge
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || isGuestMode || !userData?.uid) {
      setUnreadCount(0);
      return;
    }

    const notifRef = collection(firestore, 'user_notifications');
    const q = query(notifRef, where('userId', '==', userData.uid));

    const unsub = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.forEach((doc) => {
        if (doc.data().read === false || doc.data().read == null) {
          count++;
        }
      });
      setUnreadCount(count);
    });

    return () => unsub();
  }, [isAuthenticated, isGuestMode, userData?.uid]);

  // ─────────────────────────────────────────────────────────
  // ✅ AUTO-OPEN TrackResponder + fire local notification
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || isGuestMode) return;
    if (!userData?.uid) return;

    const userId = userData.uid;
    const notifRef = collection(firestore, 'user_notifications');
    const q = query(notifRef, where('userId', '==', userId));

    const unsub = onSnapshot(q, (snap) => {
      if (!initialNotifLoadDoneRef.current) {
        snap.forEach((d) => {
          autoOpenedNotificationsRef.current.add(d.id);
        });
        initialNotifLoadDoneRef.current = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;

        const docId = change.doc.id;
        if (autoOpenedNotificationsRef.current.has(docId)) return;
        autoOpenedNotificationsRef.current.add(docId);

        const data = change.doc.data() || {};
        const notifType = (data.type || '').toString().toLowerCase();
        const reportId = data.reportId?.toString();
        const isUnread = data.read === false || data.read == null;

        const notifTitle = (data.title || 'NagaReady').toString();
        const notifMessage = (data.message || '').toString();

        if (isUnread && notifMessage) {
          console.log('📲 Firing local native notification:', notifTitle);
          showNativeNotification({
            title: notifTitle,
            body: notifMessage,
            data: {
              reportId: reportId ?? '',
              type: notifType,
              notificationDocId: docId,
            },
          });
        }

        const shouldAutoOpen =
          isUnread &&
          !!reportId &&
          (notifType === 'dispatch' ||
            notifType === 'emergency' ||
            notifType === 'alert');

        if (!shouldAutoOpen) return;

        console.log('🚀 Auto-opening TrackResponder for incident:', reportId);

        setTrackResponderIncidentId(reportId);
        setShowTrackResponder(true);
      });
    });

    return () => unsub();
  }, [isAuthenticated, isGuestMode, userData?.uid]);

  // ─────────────────────────────────────────────────────────
  // ✅ Native notification tap
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        try {
          const payload = response.notification.request.content.data || {};
          const reportId = payload.reportId?.toString();
          const notifType = (payload.type || '').toString().toLowerCase();

          if (
            reportId &&
            (notifType === 'dispatch' ||
              notifType === 'emergency' ||
              notifType === 'alert')
          ) {
            setTrackResponderIncidentId(reportId);
            setShowTrackResponder(true);
          } else {
            setActiveTab('Notifications');
          }
        } catch (e) {
          console.warn('Notification tap error:', e);
        }
      }
    );

    return () => sub.remove();
  }, []);

  // ─────────────────────────────────────────────────────────
  // Auth handlers
  // ─────────────────────────────────────────────────────────
  const handleLogin = async (data: any) => {
    setUserData(data);
    setIsAuthenticated(true);
    setIsGuestMode(false);
    resetOverlayStates();
    await AsyncStorage.setItem('userData', JSON.stringify(data));
    await AsyncStorage.removeItem('isGuest');
  };

  const handleGuestContinue = async () => {
    setIsAuthenticated(true);
    setIsGuestMode(true);
    resetOverlayStates();
    await AsyncStorage.setItem('isGuest', 'true');
    await AsyncStorage.removeItem('userData');
  };

  const handleRegisterFromGuest = async () => {
    setShowRegisterPage(true);
  };

  const handleGuestLogout = async () => {
    await AsyncStorage.removeItem('isGuest');
    await AsyncStorage.removeItem('userData');
    setIsAuthenticated(false);
    setIsGuestMode(false);
    setUserData(null);
    setActiveTab('Home');
    resetOverlayStates();
  };

  const handleRegisterSuccess = async (data: any) => {
    setUserData(data);
    setIsAuthenticated(true);
    setIsGuestMode(false);
    resetOverlayStates();
    await AsyncStorage.setItem('userData', JSON.stringify(data));
    await AsyncStorage.removeItem('isGuest');

    setShowOnboarding(true);
  };

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    setHasOnboarded(true);
    await AsyncStorage.setItem('hasOnboarded', 'true');
  };

  const handleRegisterBack = () => {
    setShowRegisterPage(false);
  };

  const handleOpenReport = () => {
    if (isGuestMode) return;
    setShowReportPage(true);
  };

  const handleCloseReport = () => {
    setShowReportPage(false);
  };

  const handleSubmitReport = (reportData: any) => {
    console.log('Report submitted:', reportData);
    setShowReportPage(false);
  };

  const handleOpenSMS = () => {
    if (isGuestMode) return;
    setShowSMSPage(true);
  };

  const handleCloseSMS = () => {
    setShowSMSPage(false);
  };

  const handleTabChangeFromSMS = (tab: TabType) => {
    setActiveTab(tab);
    setShowSMSPage(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userData');
    await AsyncStorage.removeItem('isGuest');
    setIsAuthenticated(false);
    setIsGuestMode(false);
    setUserData(null);
    setActiveTab('Home');
    resetOverlayStates();
    autoOpenedNotificationsRef.current.clear();
    initialNotifLoadDoneRef.current = false;
  };

  const handleNavigateToTab = (tab: string) => {
    setActiveTab(tab as TabType);
    if (showTrackResponder) {
      setShowTrackResponder(false);
      setTrackResponderIncidentId(undefined);
    }
  };

  const handleTabChangeFromReport = (tab: TabType) => {
    setActiveTab(tab);
    setShowReportPage(false);
  };

  const handleNavigateToTracking = (incidentId: string) => {
    setTrackResponderIncidentId(incidentId);
    setShowTrackResponder(true);
  };

  const handleCloseTrackResponder = () => {
    setShowTrackResponder(false);
    setTrackResponderIncidentId(undefined);
  };

  // ─────────────────────────────────────────────────────────
  // Render guards
  // ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#0A0A0A" />
        <ActivityIndicator size="large" color="#FF4444" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#0A0A0A" />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </View>
    );
  }

  if (showRegisterPage) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#0A0A0A" />
        <RegisterPage
          onBack={handleRegisterBack}
          onRegisterSuccess={handleRegisterSuccess}
        />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#0A0A0A" />
        <LoginPage
          onLogin={handleLogin}
          onGuestContinue={handleGuestContinue}
          onRegister={() => setShowRegisterPage(true)}
        />
      </View>
    );
  }

  if (isGuestMode) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#180707" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#180707" />
        <SafeAreaView style={styles.safeArea}>
          <GuestHomePage
            onRegisterNow={handleRegisterFromGuest}
            onContinueAsGuest={() => {}}
            onLogout={handleGuestLogout}
          />
        </SafeAreaView>
      </View>
    );
  }

  if (showTrackResponder && !isGuestMode) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#B30000" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#B30000" />
        <TrackResponder
          incidentId={trackResponderIncidentId}
          onClose={handleCloseTrackResponder}
          onNavigateToTab={handleNavigateToTab}
        />
      </View>
    );
  }

  if (showReportPage && !isGuestMode) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#180707" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#180707" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.contentContainer}>
            <IncidentReportPage
              onClose={handleCloseReport}
              onSubmit={handleSubmitReport}
              onAuthRequired={handleCloseReport}
            />
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromReport('Home')}
            >
              <Ionicons
                name="home"
                size={responsiveSizeWithTablet(27, 23, 31, 31)}
                color="#94A3B8"
              />
              <Text style={styles.navLabel}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromReport('Notifications')}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name="notifications"
                  size={responsiveSizeWithTablet(27, 23, 31, 31)}
                  color="#94A3B8"
                />
                {unreadCount > 0 && (
                  <View style={styles.navBadge}>
                    <Text style={styles.navBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.navLabel}>Notif</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromReport('Tracking')}
            >
              <MaterialIcons
                name="track-changes"
                size={responsiveSizeWithTablet(27, 23, 31, 31)}
                color="#94A3B8"
              />
              <Text style={styles.navLabel}>Track</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromReport('Profile')}
            >
              <Ionicons
                name="person"
                size={responsiveSizeWithTablet(27, 23, 31, 31)}
                color="#94A3B8"
              />
              <Text style={styles.navLabel}>Profile</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (showSMSPage && !isGuestMode) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#180707" translucent={false} />
        <ExpoStatusBar style="light" backgroundColor="#180707" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.contentContainer}>
            <SMSEmergencyPage
              onClose={handleCloseSMS}
              onSendSMS={(type, message) => {
                console.log(`SMS sent: [${type}] ${message}`);
              }}
            />
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromSMS('Home')}
            >
              <Ionicons
                name="home"
                size={responsiveSizeWithTablet(27, 23, 31, 31)}
                color="#94A3B8"
              />
              <Text style={styles.navLabel}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromSMS('Notifications')}
            >
              <View style={styles.iconContainer}>
                <Ionicons
                  name="notifications"
                  size={responsiveSizeWithTablet(27, 23, 31, 31)}
                  color="#94A3B8"
                />
                {unreadCount > 0 && (
                  <View style={styles.navBadge}>
                    <Text style={styles.navBadgeText}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.navLabel}>Notif</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromSMS('Tracking')}
            >
              <MaterialIcons
                name="track-changes"
                size={responsiveSizeWithTablet(27, 23, 31, 31)}
                color="#94A3B8"
              />
              <Text style={styles.navLabel}>Track</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navItem}
              onPress={() => handleTabChangeFromSMS('Profile')}
            >
              <Ionicons
                name="person"
                size={responsiveSizeWithTablet(27, 23, 31, 31)}
                color="#94A3B8"
              />
              <Text style={styles.navLabel}>Profile</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'Home':
        return <HomePage
          onNavigateToTracking={() => setActiveTab('Tracking')}
          onOpenReport={handleOpenReport}
          onOpenSMS={handleOpenSMS}
          profilePhoto={profilePhoto}
        />;
      case 'Notifications':
        return <NotificationsPage onNavigateToTracking={handleNavigateToTracking} />;
      case 'Tracking':
        return <TrackingPage onNavigateToTab={handleNavigateToTab} />;
      case 'Profile':
        return <ProfilePage
          userData={userData}
          onLogout={handleLogout}
          onPhotoUpdated={(url: string) => setProfilePhoto(url)}
        />;
      default:
        return <HomePage
          onNavigateToTracking={() => setActiveTab('Tracking')}
          onOpenReport={handleOpenReport}
          onOpenSMS={handleOpenSMS}
          profilePhoto={profilePhoto}
        />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#180707" translucent={false} />
      <ExpoStatusBar style="light" backgroundColor="#180707" />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.contentContainer}>
          {renderContent()}
        </View>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('Home')}>
            <Ionicons
              name="home"
              size={responsiveSizeWithTablet(27, 23, 31, 31)}
              color={activeTab === 'Home' ? '#FF4444' : '#94A3B8'}
            />
            <Text style={[
              styles.navLabel,
              activeTab === 'Home' && styles.navLabelActive
            ]}>Home</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('Notifications')}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="notifications"
                size={responsiveSizeWithTablet(27, 23, 31, 31)}
                color={activeTab === 'Notifications' ? '#FF4444' : '#94A3B8'}
              />
              {unreadCount > 0 && (
                <View style={styles.navBadge}>
                  <Text style={styles.navBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[
              styles.navLabel,
              activeTab === 'Notifications' && styles.navLabelActive
            ]}>Notif</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('Tracking')}>
            <MaterialIcons
              name="track-changes"
              size={responsiveSizeWithTablet(27, 23, 31, 31)}
              color={activeTab === 'Tracking' ? '#FF4444' : '#94A3B8'}
            />
            <Text style={[
              styles.navLabel,
              activeTab === 'Tracking' && styles.navLabelActive
            ]}>Track</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('Profile')}>
            <Ionicons
              name="person"
              size={responsiveSizeWithTablet(27, 23, 31, 31)}
              color={activeTab === 'Profile' ? '#FF4444' : '#94A3B8'}
            />
            <Text style={[
              styles.navLabel,
              activeTab === 'Profile' && styles.navLabelActive
            ]}>Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// 📱 RESPONSIVE NAVBAR SIZING
// ─────────────────────────────────────────────────────────
const NAVBAR_PADDING_TOP = isTablet
  ? 4
  : responsiveSize(4, 3, 5);

const NAVBAR_PADDING_BOTTOM = isTablet
  ? 34
  : Platform.OS === 'ios'
    ? responsiveSize(60, 48, 68)
    : responsiveSize(34, 26, 42);

const NAVBAR_MIN_HEIGHT = isTablet
  ? 84
  : Platform.OS === 'ios'
    ? responsiveSize(115, 98, 128)
    : responsiveSize(88, 74, 100);

const NAVBAR_ICON_SIZE = isTablet
  ? 31
  : responsiveSize(27, 23, 31);

const NAVBAR_LABEL_SIZE = isTablet
  ? 14
  : Platform.OS === 'ios'
    ? responsiveSize(13, 11, 14)
    : responsiveSize(12, 11, 13);

const CONTENT_MARGIN_BOTTOM =
  NAVBAR_MIN_HEIGHT + (isTablet ? 16 : responsiveSize(20, 14, 24));

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#180707' },
  centerContainer: { justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFFFFF', marginTop: 12, fontSize: 14 },
  safeArea: { flex: 1, backgroundColor: '#180707' },

  contentContainer: {
    flex: 1,
    marginBottom: CONTENT_MARGIN_BOTTOM,
  },

  bottomNav: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    backgroundColor: '#180707',
    paddingTop: NAVBAR_PADDING_TOP,
    paddingBottom: NAVBAR_PADDING_BOTTOM,
    minHeight: NAVBAR_MIN_HEIGHT,
  },

  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: responsiveSize(6, 4, 6),
  },

  iconContainer: { position: 'relative' },

  navBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#180707',
  },

  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },

  navLabel: {
    fontSize: NAVBAR_LABEL_SIZE,
    color: '#94A3B8',
    marginTop: responsiveSize(6, 5, 7),
    fontWeight: '600',
    textAlign: 'center',
  },

  navLabelActive: { color: '#FF4444', fontWeight: '700' },
});