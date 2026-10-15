// components/GuestModePage.tsx
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  Animated,
  Dimensions,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import GuestIncidentReportPage from './GuestIncidentReportPage';
import GuestSMSEmergencyPage from './GuestSMSEmergencyPage';

// 👇 Logo asset (same as HomePage)
const LogoImage = require('../assets/adaptive-icon2.png');

const { width, height } = Dimensions.get('window');

const responsiveSize = (baseSize: number, smallSize: number, largeSize: number) => {
  if (width < 375) return smallSize;
  if (width > 414) return largeSize;
  return baseSize;
};

const responsiveSpacing = (base: number, small: number, large: number) => {
  if (width < 375) return small;
  if (width > 414) return large;
  return base;
};

// Props for the main Guest page
interface GuestModePageProps {
  onRegisterNow: () => void;
  onContinueAsGuest: () => void;
  onLogout?: () => void;
}

// Props for the success modal
interface GuestReportSuccessModalProps {
  visible: boolean;
  onRegisterNow: () => void;
  onContinueAsGuest: () => void;
}

// ===== SUCCESS MODAL COMPONENT =====
function GuestReportSuccessModal({
  visible,
  onRegisterNow,
  onContinueAsGuest,
}: GuestReportSuccessModalProps) {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onContinueAsGuest}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark" size={responsiveSize(50, 40, 60)} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.modalTitle}>Report Submitted Successfully!</Text>

          <Text style={styles.modalMessage}>
            Your emergency report has been received by the CDRRMO.
          </Text>

          <View style={styles.benefitsContainer}>
            <Text style={styles.benefitsTitle}>
              Register for a NAGA READY account to access additional features such as incident tracking, notifications, report history, and other emergency services.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={onRegisterNow}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={responsiveSize(20, 16, 24)} color="#FFFFFF" />
            <Text style={styles.registerButtonText}>Register Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={onContinueAsGuest}
            activeOpacity={0.8}
          >
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ===== MAIN GUEST PAGE COMPONENT =====
export default function GuestModePage({
  onRegisterNow,
  onContinueAsGuest,
  onLogout,
}: GuestModePageProps) {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showReportPage, setShowReportPage] = useState(false);
  const [showSMSPage, setShowSMSPage] = useState(false);

  // Dropdown state for GUEST badge
  const [showGuestMenu, setShowGuestMenu] = useState(false);

  // Animation values — mirrors HomePage
  const sosScale = useRef(new Animated.Value(1)).current;
  const smsScale = useRef(new Animated.Value(1)).current;

  const sosHover = useRef(new Animated.Value(0)).current;
  const smsHover = useRef(new Animated.Value(0)).current;

  const sosContinuousPop = useRef(new Animated.Value(1)).current;
  const sosPulse = useRef(new Animated.Value(1)).current;

  // Radar rings
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  // Shimmer sweeps
  const shimmerSOS = useRef(new Animated.Value(-1)).current;
  const shimmerSMS = useRef(new Animated.Value(-1)).current;

  React.useEffect(() => {
    // SOS icon continuous pop
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosContinuousPop, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(sosContinuousPop, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    // SOS glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(sosPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    // Radar rings
    const makeRing = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    makeRing(ring1, 0).start();
    makeRing(ring2, 900).start();

    // Shimmer sweeps
    const makeShimmer = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 1400, useNativeDriver: true }),
          Animated.timing(val, { toValue: -1, duration: 0, useNativeDriver: true }),
          Animated.delay(2600),
        ])
      );
    makeShimmer(shimmerSOS, 600).start();
    makeShimmer(shimmerSMS, 2200).start();
  }, []);

  const handlePressIn = (scale: Animated.Value, hover: Animated.Value) => {
    Animated.spring(scale, { toValue: 0.97, friction: 3, tension: 40, useNativeDriver: true }).start();
    Animated.spring(hover, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }).start();
  };

  const handlePressOut = (scale: Animated.Value, hover: Animated.Value) => {
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
    Animated.spring(hover, { toValue: 0, friction: 5, tension: 50, useNativeDriver: true }).start();
  };

  // SOS → opens Guest Incident Report Page
  const handleSOSPress = () => {
    sosContinuousPop.stopAnimation();
    Animated.sequence([
      Animated.timing(sosScale, { toValue: 0.95, duration: 50, useNativeDriver: true }),
      Animated.timing(sosScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setShowReportPage(true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(sosContinuousPop, { toValue: 1.15, duration: 800, useNativeDriver: true }),
          Animated.timing(sosContinuousPop, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    });
  };

  const handleSOSPressIn = () => {
    Animated.spring(sosScale, { toValue: 0.96, friction: 3, tension: 40, useNativeDriver: true }).start();
    Animated.spring(sosHover, { toValue: 1, friction: 5, tension: 50, useNativeDriver: true }).start();
  };

  const handleSOSPressOut = () => {
    Animated.spring(sosScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
    Animated.spring(sosHover, { toValue: 0, friction: 5, tension: 50, useNativeDriver: true }).start();
  };

  // SMS → opens the Guest SMS Emergency Page
  const handleSMSPress = () => {
    setShowSMSPage(true);
  };

  // Dropdown actions
  const handleLoginPress = () => {
    setShowGuestMenu(false);
    // Small delay so modal closes before navigation
    setTimeout(() => {
      if (onLogout) onLogout();
    }, 150);
  };

  const handleCreateAccountPress = () => {
    setShowGuestMenu(false);
    setTimeout(() => {
      onRegisterNow();
    }, 150);
  };

  // Interpolations
  const sosGlowOpacity = sosHover.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.6] });
  const smsIconScale = smsHover.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const smsGlowOpacity = smsHover.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });

  const ring1Scale = ring1.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] });
  const ring1Opacity = ring1.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
  const ring2Scale = ring2.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] });
  const ring2Opacity = ring2.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });

  const sosShimmerTranslate = shimmerSOS.interpolate({
    inputRange: [-1, 1],
    outputRange: [-width * 0.6, width * 0.9],
  });
  const smsShimmerTranslate = shimmerSMS.interpolate({
    inputRange: [-1, 1],
    outputRange: [-width * 0.6, width * 0.9],
  });

  const sosArrowTranslate = sosHover.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  });

  // Render Guest Incident Report Page when SOS is tapped
  if (showReportPage) {
    return (
      <GuestIncidentReportPage
        onClose={() => setShowReportPage(false)}
        onSubmit={() => {
          setShowReportPage(false);
          setShowSuccessModal(true);
        }}
        onRegisterNow={() => {
          setShowReportPage(false);
          onRegisterNow();
        }}
      />
    );
  }

  // Render Guest SMS Emergency Page when SMS Alert is tapped
  if (showSMSPage) {
    return (
      <GuestSMSEmergencyPage
        onClose={() => setShowSMSPage(false)}
        onSendSMS={(type, message) => {
          console.log(`Guest SMS sent: [${type}] ${message}`);
          setShowSMSPage(false);
        }}
        onRegisterNow={() => {
          setShowSMSPage(false);
          onRegisterNow();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ===== HEADER SECTION (same layout as HomePage) ===== */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.logoContainer}>
              <Image
                source={LogoImage}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.logo}>NagaReady</Text>
            </View>

            {/* GUEST badge acts as dropdown trigger */}
            <TouchableOpacity
              style={styles.guestBadge}
              onPress={() => setShowGuestMenu(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={responsiveSize(14, 12, 16)} color="#FF8C00" />
              <Text style={styles.guestBadgeText}>GUEST</Text>
              <Ionicons
                name="chevron-down"
                size={responsiveSize(12, 10, 14)}
                color="#FF8C00"
                style={{ marginLeft: 2 }}
              />
            </TouchableOpacity>
          </View>

          {/* Divider line */}
          <View style={styles.headerDivider} />
        </View>

        {/* ===== EMERGENCY SECTION ===== */}
        <Text style={styles.sectionTitle}>EMERGENCY</Text>

        {/* SOS Button — same design as HomePage */}
        <Animated.View style={[styles.sosContainer, { transform: [{ scale: sosScale }] }]}>
          <TouchableOpacity
            style={styles.sosTouchable}
            onPress={handleSOSPress}
            onPressIn={handleSOSPressIn}
            onPressOut={handleSOSPressOut}
            activeOpacity={1}
          >
            <LinearGradient
              colors={['#FF4D4D', '#CC1111', '#8C0A0A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sosButton}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.sosGlow, { opacity: sosGlowOpacity, transform: [{ scale: sosPulse }] }]}
              />

              <Animated.View
                pointerEvents="none"
                style={[styles.shimmerWrap, { transform: [{ translateX: sosShimmerTranslate }, { rotate: '18deg' }] }]}
              >
                <LinearGradient
                  colors={['transparent', 'rgba(255,255,255,0.16)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shimmerBar}
                />
              </Animated.View>

              <View pointerEvents="none" style={styles.sosTopHighlight} />

              <View style={styles.sosTopSection}>
                <View style={styles.sosIconOuter}>
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.radarRing, { opacity: ring1Opacity, transform: [{ scale: ring1Scale }] }]}
                  />
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.radarRing, { opacity: ring2Opacity, transform: [{ scale: ring2Scale }] }]}
                  />
                  <Animated.View
                    style={[styles.sosIconWrapper, { transform: [{ scale: sosContinuousPop }] }]}
                  >
                    <Text style={styles.sosIconText}>SOS</Text>
                  </Animated.View>
                </View>
                <View style={styles.sosTitleContainer}>
                  <Text style={styles.sosLabel}>SOS</Text>
                  <Text style={styles.sosSubtitle}>Emergency Alert</Text>
                </View>
              </View>

              <View style={styles.sosBottomSection}>
                <View style={styles.sosActionContainer}>
                  <Text style={styles.sosActionText}>TAP TO SEND</Text>
                  <View style={styles.sosActionBadge}>
                    <Text style={styles.sosActionBadgeText}>IMMEDIATE HELP</Text>
                  </View>
                </View>
                <Animated.View
                  style={[styles.sosArrowContainer, { transform: [{ translateX: sosArrowTranslate }] }]}
                >
                  <Ionicons name="arrow-forward" size={responsiveSize(32, 26, 36)} color="rgba(255,255,255,0.6)" />
                </Animated.View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* ===== SMS Alert — bigger size, full width ===== */}
        <Animated.View style={[{ transform: [{ scale: smsScale }] }]}>
          <TouchableOpacity
            style={styles.smsTouchable}
            onPress={handleSMSPress}
            onPressIn={() => handlePressIn(smsScale, smsHover)}
            onPressOut={() => handlePressOut(smsScale, smsHover)}
            activeOpacity={1}
          >
            <LinearGradient
              colors={['#1E6BFF', '#0047B3', '#00306E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.mediumButton}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.buttonGlow, styles.smsGlow, { opacity: smsGlowOpacity }]}
              />

              <Animated.View
                pointerEvents="none"
                style={[styles.shimmerWrap, { transform: [{ translateX: smsShimmerTranslate }, { rotate: '18deg' }] }]}
              >
                <LinearGradient
                  colors={['transparent', 'rgba(255,255,255,0.18)', 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shimmerBar}
                />
              </Animated.View>

              <View pointerEvents="none" style={styles.smsTopHighlight} />

              <Animated.View style={[styles.mediumIconWrapper, { transform: [{ scale: smsIconScale }] }]}>
                <Ionicons name="chatbubbles" size={responsiveSize(66, 52, 80)} color="#FFFFFF" />
              </Animated.View>
              <Text style={styles.mediumLabel}>SMS Alert</Text>
              <Text style={styles.mediumSubtitle}>Send message even without Wi-Fi</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ===== GUEST DROPDOWN MODAL ===== */}
      <Modal
        visible={showGuestMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGuestMenu(false)}
      >
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setShowGuestMenu(false)}
        >
          <View style={styles.dropdownMenuModal}>
            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleLoginPress}
              activeOpacity={0.7}
            >
              <Ionicons
                name="log-in-outline"
                size={responsiveSize(18, 15, 22)}
                color="#FFFFFF"
              />
              <Text style={styles.dropdownItemText}>Log in</Text>
            </TouchableOpacity>

            <View style={styles.dropdownDivider} />

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={handleCreateAccountPress}
              activeOpacity={0.7}
            >
              <Ionicons
                name="person-add-outline"
                size={responsiveSize(18, 15, 22)}
                color="#FFFFFF"
              />
              <Text style={styles.dropdownItemText}>Create Account</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Guest Report Success Modal */}
      <GuestReportSuccessModal
        visible={showSuccessModal}
        onRegisterNow={() => {
          setShowSuccessModal(false);
          onRegisterNow();
        }}
        onContinueAsGuest={() => {
          setShowSuccessModal(false);
          onContinueAsGuest();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A0A0A' },
  container: {
    flex: 1,
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    paddingTop: responsiveSpacing(8, 4, 12),
  },

  // HEADER
  headerCard: {
    backgroundColor: '#180707',
    marginTop: responsiveSpacing(12, 8, 16),
    marginBottom: responsiveSpacing(20, 14, 26),
    paddingTop: responsiveSpacing(20, 14, 26),
    paddingBottom: 0,
    paddingHorizontal: responsiveSpacing(20, 14, 26),
    borderRadius: responsiveSize(28, 20, 32),
    shadowColor: '#140606',
    shadowOffset: { width: 20, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 60,
    elevation: 25,
    borderWidth: 1,
    borderColor: 'rgba(28, 8, 8, 0.3)',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginTop: -8,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(8, 6, 12),
  },
  logoImage: {
    width: responsiveSize(64, 52, 78),
    height: responsiveSize(64, 52, 78),
    borderRadius: responsiveSize(32, 26, 39),
  },
  logo: {
    fontSize: responsiveSize(22, 18, 28),
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // GUEST badge
  guestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    paddingHorizontal: responsiveSpacing(10, 8, 14),
    paddingVertical: responsiveSpacing(8, 6, 10),
    borderRadius: responsiveSize(22, 18, 26),
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.3)',
  },
  guestBadgeText: {
    fontSize: responsiveSize(12, 10, 14),
    fontWeight: '700',
    color: '#FF8C00',
    letterSpacing: 0.5,
  },

  // ===== DROPDOWN MODAL STYLES =====
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  dropdownMenuModal: {
    position: 'absolute',
    top: responsiveSpacing(100, 88, 112), // below the GUEST badge
    right: responsiveSpacing(20, 16, 26),
    minWidth: responsiveSize(190, 165, 220),
    backgroundColor: '#1F1414',
    borderRadius: responsiveSize(14, 12, 18),
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.25)',
    paddingVertical: responsiveSpacing(6, 4, 8),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 20,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(12, 10, 14),
    paddingHorizontal: responsiveSpacing(18, 14, 22),
    paddingVertical: responsiveSpacing(14, 12, 16),
  },
  dropdownItemText: {
    fontSize: responsiveSize(15, 13, 18),
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    marginHorizontal: responsiveSpacing(12, 10, 16),
  },

  // Section title
  sectionTitle: {
    fontSize: responsiveSize(14, 11, 17),
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1,
    marginBottom: responsiveSpacing(20, 14, 26),
    marginTop: 0,
  },

  // SOS button
  sosContainer: {
    marginBottom: responsiveSpacing(16, 10, 22),
  },
  sosTouchable: {
    borderRadius: responsiveSize(36, 28, 44),
    shadowColor: '#CC1111',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 35,
    elevation: 30,
  },
  sosButton: {
    borderRadius: responsiveSize(36, 28, 44),
    padding: responsiveSpacing(40, 28, 52),
    overflow: 'hidden',
    minHeight: responsiveSize(240, 180, 300),
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  sosGlow: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    bottom: -50,
    backgroundColor: 'rgba(204, 17, 17, 0.4)',
  },
  sosTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderTopLeftRadius: responsiveSize(34, 26, 42),
    borderTopRightRadius: responsiveSize(34, 26, 42),
  },
  shimmerWrap: {
    position: 'absolute',
    top: -80,
    bottom: -80,
    left: 0,
    width: 90,
  },
  shimmerBar: {
    flex: 1,
    width: 90,
  },
  sosTopSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(28, 18, 36),
    marginBottom: responsiveSpacing(20, 14, 28),
  },
  sosIconOuter: {
    width: responsiveSize(130, 90, 170),
    height: responsiveSize(130, 90, 170),
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: responsiveSize(130, 90, 170),
    height: responsiveSize(130, 90, 170),
    borderRadius: responsiveSize(65, 45, 85),
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  sosIconWrapper: {
    width: responsiveSize(130, 90, 170),
    height: responsiveSize(130, 90, 170),
    borderRadius: responsiveSize(65, 45, 85),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  sosIconText: {
    fontSize: responsiveSize(48, 32, 64),
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  sosTitleContainer: {
    flex: 1,
  },
  sosLabel: {
    fontSize: responsiveSize(46, 30, 60),
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    marginBottom: responsiveSpacing(4, 2, 6),
    textShadowColor: 'rgba(0, 0, 0, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  sosSubtitle: {
    fontSize: responsiveSize(20, 14, 26),
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.5,
  },
  sosBottomSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: responsiveSpacing(20, 14, 28),
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  sosActionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(16, 10, 22),
  },
  sosActionText: {
    fontSize: responsiveSize(16, 12, 20),
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 3,
  },
  sosActionBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: responsiveSpacing(18, 12, 24),
    paddingVertical: responsiveSpacing(8, 6, 10),
    borderRadius: responsiveSize(24, 18, 30),
  },
  sosActionBadgeText: {
    fontSize: responsiveSize(13, 10, 16),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  sosArrowContainer: {
    width: responsiveSize(52, 40, 64),
    height: responsiveSize(52, 40, 64),
    borderRadius: responsiveSize(26, 20, 32),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },

  // SMS Alert button — BIGGER
  smsTouchable: {
    borderRadius: responsiveSize(24, 20, 28),
    shadowColor: '#0047B3',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  mediumButton: {
    borderRadius: responsiveSize(24, 20, 28),
    paddingVertical: responsiveSpacing(52, 38, 66),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  smsTopHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderTopLeftRadius: responsiveSize(23, 19, 27),
    borderTopRightRadius: responsiveSize(23, 19, 27),
  },
  mediumIconWrapper: {
    width: responsiveSize(120, 96, 144),
    height: responsiveSize(120, 96, 144),
    borderRadius: responsiveSize(60, 48, 72),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsiveSpacing(26, 20, 32),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  mediumLabel: {
    fontSize: responsiveSize(28, 22, 34),
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: responsiveSpacing(10, 8, 12),
    letterSpacing: 0.3,
  },
  mediumSubtitle: {
    fontSize: responsiveSize(17, 14, 20),
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },

  // Glow effects
  buttonGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 44,
  },
  smsGlow: {
    backgroundColor: 'rgba(0, 71, 179, 0.3)',
  },

  // ===== SUCCESS MODAL STYLES =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: responsiveSpacing(20, 16, 26),
  },
  modalContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: responsiveSize(24, 18, 30),
    width: '100%',
    maxWidth: 400,
    padding: responsiveSpacing(28, 22, 36),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconContainer: { marginBottom: responsiveSpacing(20, 14, 26) },
  iconCircle: {
    width: responsiveSize(90, 70, 110),
    height: responsiveSize(90, 70, 110),
    borderRadius: responsiveSize(45, 35, 55),
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: responsiveSize(22, 18, 26),
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: responsiveSpacing(12, 8, 16),
  },
  modalMessage: {
    fontSize: responsiveSize(14, 12, 17),
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: responsiveSize(22, 18, 26),
    marginBottom: responsiveSpacing(20, 14, 26),
  },
  benefitsContainer: {
    backgroundColor: 'rgba(74, 158, 255, 0.08)',
    borderRadius: responsiveSize(16, 12, 20),
    padding: responsiveSpacing(18, 14, 22),
    width: '100%',
    marginBottom: responsiveSpacing(24, 18, 30),
    borderWidth: 1,
    borderColor: 'rgba(74, 158, 255, 0.15)',
  },
  benefitsTitle: {
    fontSize: responsiveSize(13, 11, 16),
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: responsiveSize(20, 16, 24),
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: responsiveSpacing(10, 8, 14),
    backgroundColor: '#B00000',
    borderRadius: responsiveSize(14, 10, 18),
    paddingVertical: responsiveSpacing(16, 12, 20),
    width: '100%',
    marginBottom: responsiveSpacing(12, 8, 16),
  },
  registerButtonText: {
    fontSize: responsiveSize(16, 14, 20),
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  guestButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: responsiveSpacing(14, 10, 18),
    paddingHorizontal: responsiveSpacing(24, 18, 30),
    borderRadius: responsiveSize(14, 10, 18),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
  },
  guestButtonText: {
    fontSize: responsiveSize(15, 13, 18),
    fontWeight: '600',
    color: '#94A3B8',
  },
});