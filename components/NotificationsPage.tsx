// components/NotificationsPage.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from '../services/firebase';
import { getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserNotification {
  id: string;
  userId: string;
  reportId: string;
  title: string;
  message: string;
  incidentType: string;
  read: boolean;
  createdAt: any;
  type: string;
}

interface NotificationsPageProps {
  onNavigateToTracking?: (incidentId: string) => void;
}

// Design tokens
const COLORS = {
  bg: '#140808',
  surface: '#1C0D0D',
  surfaceUnread: '#2A1313',
  textPrimary: '#F8F4F4',
  textSecondary: 'rgba(248, 244, 244, 0.68)',
  textMuted: 'rgba(248, 244, 244, 0.42)',
  accent: '#FF4444',
};

// Accent color + label per notification type (display only)
const TYPE_META: Record<string, { color: string; label: string }> = {
  verification: { color: '#34D399', label: 'Verified' },
  dispatch: { color: '#60A5FA', label: 'Dispatch' },
  emergency: { color: '#FF4444', label: 'Emergency' },
  alert: { color: '#FBBF24', label: 'Alert' },
  info: { color: '#A78BFA', label: 'Update' },
};

export default function NotificationsPage({ onNavigateToTracking }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID
  useEffect(() => {
    const getUserId = async () => {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;

        if (currentUser) {
          setUserId(currentUser.uid);
          return;
        }

        const cachedUserData = await AsyncStorage.getItem('userData');
        if (cachedUserData) {
          const parsed = JSON.parse(cachedUserData);
          if (parsed.uid) {
            setUserId(parsed.uid);
            return;
          }
        }

        const guestId = await AsyncStorage.getItem('guestId');
        if (guestId) {
          setUserId(guestId);
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error('Error getting user ID:', error);
        setLoading(false);
      }
    };

    getUserId();
  }, []);

  // Listen to user_notifications collection (no composite index needed)
  useEffect(() => {
    if (!userId) return;

    const notificationsRef = collection(firestore, 'user_notifications');
    const q = query(notificationsRef, where('userId', '==', userId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs: UserNotification[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          notifs.push({
            id: docSnap.id,
            userId: data.userId || '',
            reportId: data.reportId || '',
            title: data.title || 'Notification',
            message: data.message || '',
            incidentType: data.incidentType || 'Unknown',
            read: data.read || false,
            createdAt: data.createdAt,
            type: data.type || 'info',
          });
        });

        // Sort newest first in JS (avoids Firestore composite index)
        notifs.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime?.() || 0;
          const bTime = b.createdAt?.toDate?.()?.getTime?.() || 0;
          return bTime - aTime;
        });

        setNotifications(notifs);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to user_notifications:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  const getIconForType = (type: string) => {
    // Custom icon2.png for all notification types
    return (
      <Image
        source={require('../assets/icon2.png')}
        style={{ width: 24, height: 24 }}
        resizeMode="contain"
      />
    );
  };

  const getBackgroundForType = (type: string) => {
    switch (type) {
      case 'verification':
        return styles.verificationCard;
      case 'dispatch':
        return styles.dispatchCard;
      case 'emergency':
        return styles.emergencyCard;
      case 'alert':
        return styles.alertCard;
      default:
        return styles.infoCard;
    }
  };

  const getMetaForType = (type: string) => TYPE_META[type] || TYPE_META.info;

  const markAsRead = async (id: string) => {
    try {
      const notifRef = doc(firestore, 'user_notifications', id);
      await updateDoc(notifRef, { read: true });
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  // Handle notification card press: mark as read + navigate to tracking
  const handleNotificationPress = (notification: UserNotification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }

    if (onNavigateToTracking && notification.reportId) {
      onNavigateToTracking(notification.reportId);
    }
  };

  const deleteNotification = (id: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const notifRef = doc(firestore, 'user_notifications', id);
              await deleteDoc(notifRef);
            } catch (error) {
              console.error('Error deleting notification:', error);
            }
          },
        },
      ]
    );
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifs = notifications.filter((n) => !n.read);
      if (unreadNotifs.length === 0) return;

      const batch = writeBatch(firestore);
      unreadNotifs.forEach((notif) => {
        const notifRef = doc(firestore, 'user_notifications', notif.id);
        batch.update(notifRef, { read: true });
      });
      await batch.commit();
      Alert.alert('Success', 'All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const clearAll = () => {
    Alert.alert(
      'Clear All',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const batch = writeBatch(firestore);
              notifications.forEach((notif) => {
                const notifRef = doc(firestore, 'user_notifications', notif.id);
                batch.delete(notifRef);
              });
              await batch.commit();
            } catch (error) {
              console.error('Error clearing all:', error);
            }
          },
        },
      ]
    );
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return 'Just now';
    }
  };

  const filteredNotifications = notifications.filter((notif) =>
    filter === 'all' ? true : !notif.read
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Loading notifications...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>
            {unreadCount === 0
              ? 'You are all caught up'
              : `${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}`}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity
              onPress={markAllAsRead}
              style={styles.headerButton}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-done" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity onPress={clearAll} style={styles.headerButton} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Segmented filter */}
      <View style={styles.filterWrap}>
        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.segment, filter === 'all' && styles.segmentActive]}
            onPress={() => setFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, filter === 'all' && styles.segmentTextActive]}>
              All
            </Text>
            <Text style={[styles.segmentCount, filter === 'all' && styles.segmentCountActive]}>
              {notifications.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, filter === 'unread' && styles.segmentActive]}
            onPress={() => setFilter('unread')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, filter === 'unread' && styles.segmentTextActive]}>
              Unread
            </Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {filteredNotifications.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-outline" size={34} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.emptyStateTitle}>
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </Text>
            <Text style={styles.emptyStateText}>
              Updates about your reports and responders will show up here.
            </Text>
          </View>
        ) : (
          filteredNotifications.map((notification) => {
            const meta = getMetaForType(notification.type);
            const canTrack = !!onNavigateToTracking && !!notification.reportId;

            return (
              <TouchableOpacity
                key={notification.id}
                style={[
                  styles.notificationCard,
                  getBackgroundForType(notification.type),
                  !notification.read && styles.cardUnread,
                ]}
                onPress={() => handleNotificationPress(notification)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.notificationIcon,
                    { backgroundColor: `${meta.color}26` },
                  ]}
                >
                  {getIconForType(notification.type)}
                </View>

                <View style={styles.notificationContent}>
                  <View style={styles.notificationHeader}>
                    <View style={styles.titleRow}>
                      {!notification.read && <View style={styles.unreadDot} />}
                      <Text
                        style={[
                          styles.notificationTitle,
                          notification.read && styles.notificationTitleRead,
                        ]}
                        numberOfLines={2}
                      >
                        {notification.title}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => deleteNotification(notification.id)}
                      style={styles.deleteButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.notificationMessage}>{notification.message}</Text>

                  <View style={styles.metaRow}>
                    <View style={[styles.typePill, { backgroundColor: `${meta.color}1F` }]}>
                      <View style={[styles.typePillDot, { backgroundColor: meta.color }]} />
                      <Text style={[styles.typePillText, { color: meta.color }]}>
                        {meta.label}
                      </Text>
                    </View>
                    <Text style={styles.notificationTime}>
                      {formatTimestamp(notification.createdAt)}
                    </Text>
                  </View>

                  {canTrack && (
                    <View style={styles.trackRow}>
                      <Text style={styles.trackText}>Track responder</Text>
                      <Ionicons name="chevron-forward" size={14} color={COLORS.textSecondary} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,   // was 20
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Segmented filter
  filterWrap: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 9,
    borderRadius: 10,
  },
  segmentActive: {
    backgroundColor: COLORS.accent,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  segmentCount: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  segmentCountActive: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  badge: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingHorizontal: 6,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // List
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 18,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
  },
  cardUnread: {
    backgroundColor: COLORS.surfaceUnread,
  },
  // Kept so getBackgroundForType still maps each type to its own style;
  // the type color now lives in the icon tile and the pill.
  verificationCard: {},
  dispatchCard: {},
  emergencyCard: {},
  alertCard: {},
  infoCard: {},

  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginRight: 8,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
  },
  notificationTitleRead: {
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notificationTime: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 10,
  },
  trackText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 72,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});