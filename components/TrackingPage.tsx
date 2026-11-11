// components/TrackingPage.tsx

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Animated,
  PanResponder,
  Modal,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { incidentService } from '../services/incidentService';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackResponder from './TrackResponder';
import { firestore } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const { width, height } = Dimensions.get('window');
const REMOVED_REPORTS_KEY = '@removed_reports';

// Design tokens (shared with NotificationsPage)
const COLORS = {
  bg: '#140808',
  surface: '#1C0D0D',
  surfaceRaised: '#271212',
  textPrimary: '#F8F4F4',
  textSecondary: 'rgba(248, 244, 244, 0.68)',
  textMuted: 'rgba(248, 244, 244, 0.42)',
  accent: '#FF4444',
};

interface EmergencyEvent {
  id: string;
  type: string;
  location: string;
  status: 'submitted' | 'dispatched' | 'enroute' | 'arrived' | 'resolved';
  timestamp: Date;
  eta?: string;
  responder: string;
  description?: string;
  photoUrl?: string | null;
  hasPhoto?: boolean;
  statusIcon?: string;
  statusColor?: string;
  statusLabel?: string;
  userId?: string;
  queueStatus?: 'review' | 'verified' | 'dispatched' | 'resolved' | 'duplicate';
  forwardedStatus?: string;
  reportStatus?: string;
  // PERSIST: persisted progress override
  persistedStatus?: 'submitted' | 'dispatched' | 'enroute' | 'arrived' | 'resolved';
  persistedStatusLabel?: string;
  persistedArrivedTime?: string;
  persistedResolvedTime?: string;
  persistedEnRouteTime?: string;
  // final report submitted flag
  finalReportSubmitted?: boolean;
  // casualties support
  casualties?: {
    injured: number;
    fatalities: number;
    trapped: number;
  };
  reporter?: any;
}

interface TrackingPageProps {
  onNavigateToTab?: (tab: string) => void;
}

// PERSIST: rank helper
const STATUS_RANK: Record<string, number> = {
  submitted: 0,
  dispatched: 1,
  enroute: 2,
  arrived: 3,
  resolved: 4,
};

const rankOf = (s?: string) =>
  s && s in STATUS_RANK ? STATUS_RANK[s] : -1;

export default function TrackingPage({ onNavigateToTab }: TrackingPageProps) {
  const [events, setEvents] = useState<EmergencyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EmergencyEvent | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'resolved'>('active');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showTrackingDetail, setShowTrackingDetail] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [selectedEventForMenu, setSelectedEventForMenu] = useState<EmergencyEvent | null>(null);
  const [removedReportIds, setRemovedReportIds] = useState<Set<string>>(new Set());
  const auth = getAuth();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const queueUnsubscribeRef = useRef<(() => void) | null>(null);
  const forwardedUnsubscribeRef = useRef<(() => void) | null>(null);
  const progressUnsubscribeRef = useRef<(() => void) | null>(null);
  // listen to final_reports
  const finalReportsUnsubscribeRef = useRef<(() => void) | null>(null);
  const processedQueueStatuses = useRef<Set<string>>(new Set());
  const processedForwardedStatuses = useRef<Set<string>>(new Set());

  // Animation values
  const slideAnim = useRef(new Animated.Value(width)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Helper to sort events newest-first (by timestamp)
  const sortNewestFirst = (list: EmergencyEvent[]): EmergencyEvent[] => {
    return [...list].sort((a, b) => {
      const aTime = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
      const bTime = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
      return bTime - aTime;
    });
  };

  useEffect(() => {
    loadRemovedReports();
  }, []);

  const loadRemovedReports = async () => {
    try {
      const stored = await AsyncStorage.getItem(REMOVED_REPORTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setRemovedReportIds(new Set(parsed));
      }
    } catch (error) {
      console.error('Error loading removed reports:', error);
    }
  };

  const saveRemovedReport = async (reportId: string) => {
    try {
      const newSet = new Set(removedReportIds);
      newSet.add(reportId);
      setRemovedReportIds(newSet);
      await AsyncStorage.setItem(REMOVED_REPORTS_KEY, JSON.stringify(Array.from(newSet)));
    } catch (error) {
      console.error('Error saving removed report:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let authUnsubscribe: (() => void) | null = null;

    const checkAuth = async () => {
      try {
        const cachedUserData = await AsyncStorage.getItem('userData');
        const sessionActive = await AsyncStorage.getItem('sessionActive');

        if (sessionActive === 'true' && cachedUserData) {
          const userData = JSON.parse(cachedUserData);
          setCurrentUserId(userData.uid);
          setIsAuthenticated(true);
          setCheckingAuth(false);
          console.log('✅ TrackingPage: Session restored from cache');
          startTrackingListener();
          return;
        }

        const currentUser = auth.currentUser;
        if (currentUser) {
          setCurrentUserId(currentUser.uid);
          setIsAuthenticated(true);
          setCheckingAuth(false);
          startTrackingListener();
          return;
        }

        authUnsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!isMounted) return;

          if (user) {
            setCurrentUserId(user.uid);
            setIsAuthenticated(true);
            setCheckingAuth(false);
            startTrackingListener();
          } else {
            const cachedData = await AsyncStorage.getItem('userData');
            if (cachedData) {
              const userData = JSON.parse(cachedData);
              setCurrentUserId(userData.uid);
              setIsAuthenticated(true);
              setCheckingAuth(false);
              startTrackingListener();
              console.log('✅ TrackingPage: Using cached session data as fallback');
            } else {
              setIsAuthenticated(false);
              setCurrentUserId(null);
              setCheckingAuth(false);
            }
          }
        });
      } catch (error) {
        console.error('TrackingPage Auth check error:', error);
        setIsAuthenticated(false);
        setCurrentUserId(null);
        setCheckingAuth(false);
      }
    };

    const startTrackingListener = () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      const unsubscribe = incidentService.listenForTrackingUpdates(
        (newEvents) => {
          if (isMounted) {
            let userEvents = newEvents.filter(event => {
              if (event.userId) {
                return event.userId === currentUserId;
              }
              return true;
            });

            userEvents = userEvents.filter(event => !removedReportIds.has(event.id));
            userEvents = sortNewestFirst(userEvents);

            console.log(`📋 Total events: ${newEvents.length}, User events: ${userEvents.length}`);
            setEvents(userEvents);
            setLoading(false);
            setRefreshing(false);
          }
        },
        (error) => {
          console.error('Tracking error:', error);
          if (isMounted) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      );

      unsubscribeRef.current = unsubscribe;
      startQueueListener();
      startForwardedListener();
      startProgressListener();
      startFinalReportsListener();
    };

    const startQueueListener = () => {
      if (queueUnsubscribeRef.current) {
        queueUnsubscribeRef.current();
      }

      try {
        const queueRef = collection(firestore, 'incident_queue');
        const q = query(queueRef);

        queueUnsubscribeRef.current = onSnapshot(q, (snapshot) => {
          const queueStatusMap: { [key: string]: string } = {};

          snapshot.forEach((doc) => {
            const data = doc.data();
            const incidentId = data.incidentId || doc.id;
            const status = data.status || 'review';
            queueStatusMap[incidentId] = status;

            const key = `${incidentId}-${status}`;
            if (!processedQueueStatuses.current.has(key)) {
              console.log(`📊 [TrackingPage] Queue status for ${incidentId}: ${status}`);
              processedQueueStatuses.current.add(key);
            }
          });

          setEvents(prevEvents => {
            const updated = prevEvents.map(event => {
              const queueStatus = queueStatusMap[event.id];
              if (queueStatus) {
                return {
                  ...event,
                  queueStatus: queueStatus as 'review' | 'verified' | 'dispatched' | 'resolved' | 'duplicate',
                };
              }
              return event;
            });
            return sortNewestFirst(updated);
          });
        }, (error) => {
          console.error('Error listening to queue updates:', error);
        });
      } catch (error) {
        console.error('Error starting queue listener:', error);
      }
    };

    const startForwardedListener = () => {
      if (forwardedUnsubscribeRef.current) {
        forwardedUnsubscribeRef.current();
      }

      try {
        const forwardedRef = collection(firestore, 'forwarded_incidents');
        const q = query(forwardedRef);

        forwardedUnsubscribeRef.current = onSnapshot(q, (snapshot) => {
          const forwardedStatusMap: { [key: string]: string } = {};

          snapshot.forEach((doc) => {
            const data = doc.data();
            const incidentId = data.id || doc.id;
            const status = data.status || 'Waiting';
            forwardedStatusMap[incidentId] = status;

            const key = `${incidentId}-${status}`;
            if (!processedForwardedStatuses.current.has(key)) {
              console.log(`📊 [TrackingPage] Forwarded status for ${incidentId}: ${status}`);
              processedForwardedStatuses.current.add(key);
            }
          });

          setEvents(prevEvents => {
            const updated = prevEvents.map(event => {
              const forwardedStatus = forwardedStatusMap[event.id];
              if (forwardedStatus) {
                return {
                  ...event,
                  forwardedStatus: forwardedStatus,
                };
              }
              return event;
            });
            return sortNewestFirst(updated);
          });
        }, (error) => {
          console.error('Error listening to forwarded updates:', error);
        });
      } catch (error) {
        console.error('Error starting forwarded listener:', error);
      }
    };

    const startProgressListener = () => {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current();
      }

      try {
        const progressRef = collection(firestore, 'incident_progress');
        const q = query(progressRef);

        progressUnsubscribeRef.current = onSnapshot(q, (snapshot) => {
          const progressMap: {
            [key: string]: {
              status?: string;
              statusLabel?: string;
              enRouteTime?: string;
              arrivedTime?: string;
              resolvedTime?: string;
            };
          } = {};

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const incidentId = data.incidentId || docSnap.id;
            progressMap[incidentId] = {
              status: data.status,
              statusLabel: data.statusLabel,
              enRouteTime: data.enRouteTime,
              arrivedTime: data.arrivedTime,
              resolvedTime: data.resolvedTime,
            };
          });

          setEvents(prevEvents => {
            const updated = prevEvents.map(event => {
              const p = progressMap[event.id];
              if (!p || !p.status) return event;

              const liveRank = rankOf(event.persistedStatus || event.status);
              const persistedRank = rankOf(p.status);
              if (persistedRank < liveRank) return event;

              return {
                ...event,
                persistedStatus: p.status as EmergencyEvent['persistedStatus'],
                persistedStatusLabel: p.statusLabel,
                persistedEnRouteTime: p.enRouteTime,
                persistedArrivedTime: p.arrivedTime,
                persistedResolvedTime: p.resolvedTime,
              };
            });
            return sortNewestFirst(updated);
          });
        }, (error) => {
          console.error('Error listening to progress updates:', error);
        });
      } catch (error) {
        console.error('Error starting progress listener:', error);
      }
    };

    // listen to final_reports — when responder submits their report,
    // force the event status to 'resolved'
    const startFinalReportsListener = () => {
      if (finalReportsUnsubscribeRef.current) {
        finalReportsUnsubscribeRef.current();
      }

      try {
        const finalRef = collection(firestore, 'final_reports');
        const q = query(finalRef);

        finalReportsUnsubscribeRef.current = onSnapshot(q, (snapshot) => {
          const resolvedMap: { [key: string]: boolean } = {};

          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const incidentId = data.incidentId || docSnap.id;
            resolvedMap[incidentId] = true;
          });

          setEvents(prevEvents => {
            const updated = prevEvents.map(event => {
              if (resolvedMap[event.id]) {
                // Force resolved + label
                return {
                  ...event,
                  finalReportSubmitted: true,
                  persistedStatus: 'resolved' as EmergencyEvent['persistedStatus'],
                  persistedStatusLabel: 'Resolved',
                };
              }
              return event;
            });
            return sortNewestFirst(updated);
          });
        }, (error) => {
          console.error('Error listening to final_reports:', error);
        });
      } catch (error) {
        console.error('Error starting final_reports listener:', error);
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
      if (authUnsubscribe) {
        authUnsubscribe();
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (queueUnsubscribeRef.current) {
        queueUnsubscribeRef.current();
      }
      if (forwardedUnsubscribeRef.current) {
        forwardedUnsubscribeRef.current();
      }
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current();
      }
      if (finalReportsUnsubscribeRef.current) {
        finalReportsUnsubscribeRef.current();
      }
    };
  }, [currentUserId, removedReportIds]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dx < 0;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          slideAnim.setValue(width + gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) {
          closeTrackingDetail();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 40,
            friction: 8,
          }).start();
        }
      },
    })
  ).current;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const reports = await incidentService.getUserReportsForTracking();
      const filteredReports = reports.filter(report => !removedReportIds.has(report.id));
      setEvents(sortNewestFirst(filteredReports as EmergencyEvent[]));
    } catch (error) {
      console.error('Error refreshing reports:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    const info = incidentService.getStatusInfo(status);
    return <Ionicons name={info.icon as any} size={20} color={info.color} />;
  };

  const getStatusText = (status: string) => {
    const info = incidentService.getStatusInfo(status);
    return info.label;
  };

  const getStatusColor = (status: string) => {
    const info = incidentService.getStatusInfo(status);
    return info.color;
  };

  const getStatusProgress = (status: string) => {
    switch (status) {
      case 'submitted':
        return '15%';
      case 'dispatched':
        return '30%';
      case 'enroute':
        return '60%';
      case 'arrived':
        return '90%';
      case 'resolved':
        return '100%';
      default:
        return '0%';
    }
  };

  const isReportStatusEnroute = (reportStatus: string): boolean => {
    return reportStatus === 'enroute';
  };

  const isReportStatusResolved = (reportStatus: string): boolean => {
    return reportStatus === 'resolved';
  };

  const isForwardedDispatched = (forwardedStatus: string): boolean => {
    return forwardedStatus === 'Dispatched';
  };

  const getDisplayStatus = (event: EmergencyEvent): 'submitted' | 'dispatched' | 'enroute' | 'arrived' | 'resolved' => {
    // final report submitted → always resolved
    if (event.finalReportSubmitted) return 'resolved';

    const queueStatus = event.queueStatus || 'review';
    const forwardedStatus = event.forwardedStatus || 'Waiting';
    const reportStatus = event.status || 'submitted';

    if (event.persistedStatus) {
      const persistedRank = rankOf(event.persistedStatus);
      let liveStatus: EmergencyEvent['status'] = 'submitted';
      if (isReportStatusEnroute(reportStatus)) liveStatus = 'enroute';
      else if (isForwardedDispatched(forwardedStatus)) liveStatus = 'dispatched';
      else if (queueStatus === 'verified') liveStatus = 'submitted';
      else if (queueStatus === 'dispatched') liveStatus = 'dispatched';
      else if (queueStatus === 'resolved' || isReportStatusResolved(reportStatus)) liveStatus = 'resolved';
      else if (reportStatus) liveStatus = reportStatus;

      if (persistedRank >= rankOf(liveStatus)) {
        return event.persistedStatus;
      }
    }

    if (isReportStatusEnroute(reportStatus)) return 'enroute';
    if (isForwardedDispatched(forwardedStatus)) return 'dispatched';
    if (queueStatus === 'verified') return 'submitted';
    if (queueStatus === 'dispatched' && !isReportStatusEnroute(reportStatus)) return 'dispatched';
    if (queueStatus === 'resolved' || isReportStatusResolved(reportStatus)) return 'resolved';
    if (reportStatus === 'submitted' || reportStatus === 'dispatched' ||
        reportStatus === 'enroute' || reportStatus === 'arrived' || reportStatus === 'resolved') {
      return reportStatus;
    }
    return 'submitted';
  };

  const getDisplayStatusLabel = (event: EmergencyEvent) => {
    // final report submitted → always "Resolved"
    if (event.finalReportSubmitted) return 'Resolved';

    const displayStatus = getDisplayStatus(event);

    if (event.persistedStatusLabel && rankOf(event.persistedStatus) >= rankOf(displayStatus)) {
      return event.persistedStatusLabel;
    }

    const queueStatus = event.queueStatus || 'review';
    const forwardedStatus = event.forwardedStatus || 'Waiting';
    const reportStatus = event.status || 'submitted';

    if (isReportStatusEnroute(reportStatus) || displayStatus === 'enroute') return 'En Route';
    if (displayStatus === 'arrived') return 'Arrived';
    if (displayStatus === 'resolved') return 'Resolved';
    if (isForwardedDispatched(forwardedStatus)) return 'Dispatched';
    if (queueStatus === 'verified') return 'Verified';
    if (queueStatus === 'dispatched' && !isReportStatusEnroute(reportStatus)) return 'Dispatched';
    if (queueStatus === 'resolved' || isReportStatusResolved(reportStatus)) return 'Resolved';
    if (queueStatus === 'review') return 'For Review';

    return getStatusText(displayStatus);
  };

  const getDisplayStatusColor = (event: EmergencyEvent) => {
    // final report submitted → green
    if (event.finalReportSubmitted) return '#4CAF50';

    const displayStatus = getDisplayStatus(event);

    if (displayStatus === 'arrived') return '#00C853';
    if (displayStatus === 'resolved') return '#4CAF50';
    if (displayStatus === 'enroute') return '#2196F3';

    const queueStatus = event.queueStatus || 'review';
    const forwardedStatus = event.forwardedStatus || 'Waiting';
    const reportStatus = event.status || 'submitted';

    if (isReportStatusEnroute(reportStatus)) return '#2196F3';
    if (isForwardedDispatched(forwardedStatus)) return '#FF8C00';
    if (queueStatus === 'verified') return '#4CAF50';
    if (queueStatus === 'dispatched' && !isReportStatusEnroute(reportStatus)) return '#FF8C00';
    if (queueStatus === 'resolved' || isReportStatusResolved(reportStatus)) return '#4CAF50';
    if (queueStatus === 'review') return '#FF8C00';

    return getStatusColor(event.status);
  };

  const getDisplayProgress = (event: EmergencyEvent) => {
    const displayStatus = getDisplayStatus(event);

    switch (displayStatus) {
      case 'submitted':
        return '15%';
      case 'dispatched':
        return '30%';
      case 'enroute':
        return '60%';
      case 'arrived':
        return '90%';
      case 'resolved':
        return '100%';
      default:
        return '10%';
    }
  };

  const isActive = (event: EmergencyEvent) => {
    // final report submitted → not active
    if (event.finalReportSubmitted) return false;

    const displayStatus = getDisplayStatus(event);
    if (displayStatus === 'resolved') return false;

    const queueStatus = event.queueStatus || 'review';
    const forwardedStatus = event.forwardedStatus || 'Waiting';
    const reportStatus = event.status || 'submitted';

    if (queueStatus === 'resolved') return false;
    if (isReportStatusResolved(reportStatus)) return false;
    if (forwardedStatus === 'Resolved') return false;
    if (queueStatus === 'verified' || queueStatus === 'dispatched') return true;
    if (isForwardedDispatched(forwardedStatus)) return true;
    if (isReportStatusEnroute(reportStatus) || reportStatus === 'arrived') return true;

    return true;
  };

  const filteredEvents = events.filter(event => {
    const isEventActive = isActive(event);
    if (activeFilter === 'all') return true;
    if (activeFilter === 'active') return isEventActive;
    return !isEventActive;
  });

  const activeCount = events.filter(e => isActive(e)).length;

  const openTrackingDetail = (event: EmergencyEvent) => {
    setSelectedEvent(event);
    setShowTrackingDetail(true);

    slideAnim.setValue(width);
    fadeAnim.setValue(0);

    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 40,
        friction: 8,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeTrackingDetail = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: width,
        useNativeDriver: true,
        tension: 40,
        friction: 8,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowTrackingDetail(false);
      setSelectedEvent(null);
    });
  };

  const handlePermanentRemove = async (eventId: string) => {
    Alert.alert(
      'Remove Report',
      'This report will be permanently removed from your tracking list. The report will still be available in the system.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await saveRemovedReport(eventId);
            setEvents(prevEvents => prevEvents.filter(event => event.id !== eventId));
            setShowMenuModal(false);
            setSelectedEventForMenu(null);
          },
        },
      ]
    );
  };

  const openMenu = (event: EmergencyEvent) => {
    setSelectedEventForMenu(event);
    setShowMenuModal(true);
  };

  if (checkingAuth) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Emergency Tracking</Text>
          <Text style={styles.headerSubtitle}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Checking authentication...</Text>
        </View>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Emergency Tracking</Text>
          <Text style={styles.headerSubtitle}>Sign in required</Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="person-outline" size={34} color={COLORS.textSecondary} />
          </View>
          <Text style={styles.emptyStateTitle}>Sign in required</Text>
          <Text style={styles.emptyStateText}>
            Please sign in to view your emergency tracking.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Emergency Tracking</Text>
          <Text style={styles.headerSubtitle}>Loading...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading your reports...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Emergency Tracking</Text>
        <Text style={styles.headerSubtitle}>
          {activeCount} active {activeCount === 1 ? 'response' : 'responses'}
        </Text>
      </View>

      {/* Segmented filter */}
      <View style={styles.filterContainer}>
        <View style={styles.segmented}>
          <TouchableOpacity
            style={[styles.segment, activeFilter === 'all' && styles.segmentActive]}
            onPress={() => setActiveFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeFilter === 'all' && styles.segmentTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, activeFilter === 'active' && styles.segmentActive]}
            onPress={() => setActiveFilter('active')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeFilter === 'active' && styles.segmentTextActive]}>
              Active
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segment, activeFilter === 'resolved' && styles.segmentActive]}
            onPress={() => setActiveFilter('resolved')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeFilter === 'resolved' && styles.segmentTextActive]}>
              Resolved
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >
        {filteredEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="map-outline" size={34} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.emptyStateTitle}>No emergency responses</Text>
            <Text style={styles.emptyStateText}>
              {activeFilter === 'active'
                ? 'No active emergency responses at the moment.'
                : 'No resolved emergencies yet.'}
            </Text>
          </View>
        ) : (
          <>
            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{events.length}</Text>
                <Text style={styles.summaryLabel}>Total reports</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: '#FF8C00' }]}>
                  {activeCount}
                </Text>
                <Text style={styles.summaryLabel}>Active</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: '#4CAF50' }]}>
                  {events.length - activeCount}
                </Text>
                <Text style={styles.summaryLabel}>Resolved</Text>
              </View>
            </View>

            {filteredEvents.map((event) => {
              const displayStatus = getDisplayStatus(event);
              const displayStatusLabel = getDisplayStatusLabel(event);
              const displayStatusColor = getDisplayStatusColor(event);
              const progress = getDisplayProgress(event);
              const isEventActive = isActive(event);
              const queueStatus = event.queueStatus || 'review';
              const forwardedStatus = event.forwardedStatus || 'Waiting';
              const reportStatus = event.status || 'submitted';
              const isEnroute = displayStatus === 'enroute';
              const isArrived = displayStatus === 'arrived';
              const isResolved = displayStatus === 'resolved';
              const isDispatched = displayStatus === 'dispatched';

              return (
                <TouchableOpacity
                  key={event.id}
                  style={styles.eventCard}
                  onPress={() => openTrackingDetail(event)}
                  activeOpacity={0.75}
                >
                  <View style={styles.eventHeader}>
                    <View
                      style={[
                        styles.statusTile,
                        { backgroundColor: displayStatusColor + '26' },
                      ]}
                    >
                      {getStatusIcon(displayStatus)}
                    </View>

                    <View style={styles.eventTitleWrap}>
                      <Text style={styles.eventType} numberOfLines={1}>
                        {event.type}
                      </Text>
                      <View style={styles.locationRow}>
                        <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
                        <Text style={styles.eventLocation} numberOfLines={1}>
                          {event.location}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.headerRightContainer}>
                      <View style={[styles.statusBadge, { backgroundColor: displayStatusColor + '26' }]}>
                        <View style={[styles.statusDot, { backgroundColor: displayStatusColor }]} />
                        <Text style={[styles.statusText, { color: displayStatusColor }]}>
                          {displayStatusLabel}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.menuButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          openMenu(event);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {event.description && event.description.trim() !== '' && (
                    <View style={styles.eventDescriptionBox}>
                      <Ionicons name="document-text-outline" size={14} color={COLORS.textMuted} />
                      <Text style={styles.eventDescriptionText} numberOfLines={2}>
                        {event.description}
                      </Text>
                    </View>
                  )}

                  {event.casualties && (
                    (event.casualties.injured > 0 ||
                     event.casualties.fatalities > 0 ||
                     event.casualties.trapped > 0)
                  ) && (
                    <View style={styles.casualtiesRow}>
                      <View style={styles.casualtyChip}>
                        <Ionicons name="medical" size={12} color="#FF4444" />
                        <Text style={styles.casualtyChipText}>
                          {event.casualties.injured} injured
                        </Text>
                      </View>
                      <View style={styles.casualtyChip}>
                        <Ionicons name="alert-circle" size={12} color="#E57373" />
                        <Text style={styles.casualtyChipText}>
                          {event.casualties.fatalities} fatal
                        </Text>
                      </View>
                      <View style={styles.casualtyChip}>
                        <Ionicons name="people" size={12} color="#9CA3AF" />
                        <Text style={styles.casualtyChipText}>
                          {event.casualties.trapped} trapped
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.eventDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
                      <Text style={styles.detailText}>
                        {event.timestamp ? event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Invalid Date'}
                      </Text>
                    </View>

                    {queueStatus === 'verified' && !isEnroute && !isArrived && !isResolved && (
                      <View style={styles.detailItem}>
                        <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                        <Text style={[styles.detailText, { color: '#4CAF50' }]}>
                          Verified
                        </Text>
                      </View>
                    )}

                    {isDispatched && (
                      <View style={styles.detailItem}>
                        <Ionicons name="send" size={14} color="#FF8C00" />
                        <Text style={[styles.detailText, { color: '#FF8C00' }]}>
                          Dispatched
                        </Text>
                      </View>
                    )}

                    {isEnroute && (
                      <View style={styles.detailItem}>
                        <Ionicons name="navigate" size={14} color="#2196F3" />
                        <Text style={[styles.detailText, { color: '#2196F3' }]}>
                          En Route
                        </Text>
                      </View>
                    )}

                    {isArrived && (
                      <View style={styles.detailItem}>
                        <Ionicons name="flag" size={14} color="#00C853" />
                        <Text style={[styles.detailText, { color: '#00C853' }]}>
                          Arrived at scene
                        </Text>
                      </View>
                    )}

                    {isResolved && (
                      <View style={styles.detailItem}>
                        <Ionicons name="checkmark-done-circle" size={14} color="#4CAF50" />
                        <Text style={[styles.detailText, { color: '#4CAF50' }]}>
                          Resolved
                        </Text>
                      </View>
                    )}

                    {event.eta && isEventActive && (isEnroute || isArrived) && (
                      <View style={styles.detailItem}>
                        <Ionicons name="hourglass-outline" size={14} color={COLORS.textMuted} />
                        <Text style={styles.detailText}>ETA: {event.eta}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.footerRow}>
                    <View style={styles.responderInfo}>
                      <Ionicons name="people-outline" size={15} color={COLORS.textSecondary} />
                      <Text style={styles.responderText} numberOfLines={1}>
                        {event.responder}
                      </Text>
                    </View>

                    {event.hasPhoto && (
                      <View style={styles.photoIndicator}>
                        <Ionicons name="image-outline" size={14} color="#4CAF50" />
                        <Text style={styles.photoIndicatorText}>Photo attached</Text>
                      </View>
                    )}
                  </View>

                  {isEventActive && (
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: progress, backgroundColor: displayStatusColor }]} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={showMenuModal}
        onRequestClose={() => setShowMenuModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenuModal(false)}
        >
          <View style={styles.menuModalContainer}>
            <View style={styles.menuModalContent}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (selectedEventForMenu) {
                    setShowMenuModal(false);
                    openTrackingDetail(selectedEventForMenu);
                  }
                }}
              >
                <Ionicons name="eye-outline" size={20} color={COLORS.textPrimary} />
                <Text style={styles.menuItemText}>View details</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDelete]}
                onPress={() => {
                  if (selectedEventForMenu) {
                    handlePermanentRemove(selectedEventForMenu.id);
                  }
                }}
              >
                <Ionicons name="trash-outline" size={20} color={COLORS.accent} />
                <Text style={[styles.menuItemText, styles.menuItemDeleteText]}>Remove from tracking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setShowMenuModal(false)}
              >
                <Ionicons name="close-outline" size={20} color={COLORS.textMuted} />
                <Text style={[styles.menuItemText, { color: COLORS.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {showTrackingDetail && selectedEvent && (
        <Animated.View
          style={[
            styles.trackingOverlay,
            {
              transform: [{ translateX: slideAnim }],
              opacity: fadeAnim,
            }
          ]}
          {...panResponder.panHandlers}
        >
          <TrackResponder
            incidentId={selectedEvent.id}
            onClose={closeTrackingDetail}
            onNavigateToTab={(tab) => {
              closeTrackingDetail();
              if (onNavigateToTab) {
                onNavigateToTab(tab);
              }
            }}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 42,
    paddingBottom: 14,
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

  // Segmented filter
  filterContainer: {
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
    alignItems: 'center',
    justifyContent: 'center',
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

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
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

  // Summary
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 16,
    justifyContent: 'space-around',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },

  // Event card
  eventCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  eventTitleWrap: {
    flex: 1,
    paddingRight: 8,
  },
  eventType: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventLocation: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  menuButton: {
    padding: 4,
  },
  eventDescriptionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  eventDescriptionText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  casualtiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  casualtyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surfaceRaised,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  casualtyChipText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  eventDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  detailText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  responderInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  responderText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  photoIndicatorText: {
    fontSize: 12,
    color: '#4CAF50',
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 14,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },

  // Detail overlay
  trackingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0A0A0A',
    zIndex: 1000,
    elevation: 1000,
  },

  // Menu modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuModalContainer: {
    width: '85%',
    maxWidth: 340,
  },
  menuModalContent: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 20,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 14,
  },
  menuItemDelete: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  menuItemText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  menuItemDeleteText: {
    color: COLORS.accent,
  },
});