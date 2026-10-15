// components/HomePage.tsx
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
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// 👇 Logo asset
const LogoImage = require('../assets/adaptive-icon2.png');

const { width, height } = Dimensions.get('window');

// Responsive size helper function
const responsiveSize = (baseSize: number, smallSize: number, largeSize: number) => {
  if (width < 375) {
    return smallSize;
  } else if (width > 414) {
    return largeSize;
  }
  return baseSize;
};

// Responsive spacing helper
const responsiveSpacing = (base: number, small: number, large: number) => {
  if (width < 375) return small;
  if (width > 414) return large;
  return base;
};

interface HomePageProps {
  onNavigateToTracking: () => void;
  onAuthRequired?: () => void;
  onOpenReport?: () => void;
  onOpenSMS?: () => void;
  profilePhoto?: string | null;   // ✅ NEW
}

export default function HomePage({
  onNavigateToTracking,
  onAuthRequired,
  onOpenReport,
  onOpenSMS,
  profilePhoto,   // ✅ NEW
}: HomePageProps) {
  // Animation values for each button
  const sosScale = useRef(new Animated.Value(1)).current;
  const smsScale = useRef(new Animated.Value(1)).current;

  // Hover/active effect values
  const sosHover = useRef(new Animated.Value(0)).current;
  const smsHover = useRef(new Animated.Value(0)).current;

  // Continuous pop animation for SOS button (auto-play) - only for icon
  const sosContinuousPop = useRef(new Animated.Value(1)).current;

  // Pulsing animation for SOS button glow
  const sosPulse = useRef(new Animated.Value(1)).current;

  // Radar-style expanding rings behind the SOS icon
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;

  // Slow diagonal shimmer sweep across both buttons
  const shimmerSOS = useRef(new Animated.Value(-1)).current;
  const shimmerSMS = useRef(new Animated.Value(-1)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sosContinuousPop, {
          toValue: 1.15,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(sosContinuousPop, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(sosPulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    const makeRing = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1800,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    makeRing(ring1, 0).start();
    makeRing(ring2, 900).start();

    const makeShimmer = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: -1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.delay(2600),
        ])
      );
    makeShimmer(shimmerSOS, 600).start();
    makeShimmer(shimmerSMS, 2200).start();
  }, []);

  const handlePressIn = (scale: Animated.Value, hover: Animated.Value) => {
    Animated.spring(scale, {
      toValue: 0.97,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();

    Animated.spring(hover, {
      toValue: 1,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = (scale: Animated.Value, hover: Animated.Value) => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();

    Animated.spring(hover, {
      toValue: 0,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  const handleSOSPress = () => {
    sosContinuousPop.stopAnimation();
    Animated.sequence([
      Animated.timing(sosScale, {
        toValue: 0.95,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(sosScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onOpenReport) {
        onOpenReport();
      }
      Animated.loop(
        Animated.sequence([
          Animated.timing(sosContinuousPop, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(sosContinuousPop, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  };

  const handleSOSPressIn = () => {
    Animated.spring(sosScale, {
      toValue: 0.96,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();

    Animated.spring(sosHover, {
      toValue: 1,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  const handleSOSPressOut = () => {
    Animated.spring(sosScale, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();

    Animated.spring(sosHover, {
      toValue: 0,
      friction: 5,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  const handleSMSPressIn = () => {
    handlePressIn(smsScale, smsHover);
  };

  const sosGlowOpacity = sosHover.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.6],
  });

  const smsIconScale = smsHover.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  const smsGlowOpacity = smsHover.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ===== HEADER SECTION ===== */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={styles.logoContainer}>
              <Image
                source={LogoImage}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <View style={styles.logoTextWrap}>
                <Text style={styles.logo}>NagaReady</Text>
                <Text style={styles.logoTagline}>Emergency response</Text>
              </View>
            </View>

            {/* ✅ Profile avatar — shows uploaded photo if available */}
            <TouchableOpacity style={styles.avatar} activeOpacity={0.8}>
              {profilePhoto ? (
                <Image
                  source={{ uri: profilePhoto }}
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons
                  name="person"
                  size={responsiveSize(22, 18, 26)}
                  color="#FFFFFF"
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== EMERGENCY SECTION ===== */}
        <Text style={styles.sectionTitle}>EMERGENCY</Text>

        {/* SOS Button */}
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
                  style={[styles.sosArrowContainer, { transform: [{ translateX: sosHover.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }]}
                >
                  <Ionicons name="arrow-forward" size={responsiveSize(32, 26, 36)} color="rgba(255,255,255,0.6)" />
                </Animated.View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* SMS Alert Button */}
        <Animated.View style={[{ transform: [{ scale: smsScale }] }]}>
          <TouchableOpacity
            style={styles.smsTouchable}
            onPress={() => {
              if (onOpenSMS) onOpenSMS();
            }}
            onPressIn={handleSMSPressIn}
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
                <Ionicons name="chatbubbles" size={responsiveSize(54, 44, 66)} color="#FFFFFF" />
              </Animated.View>
              <Text style={styles.mediumLabel}>SMS Alert</Text>
              <Text style={styles.mediumSubtitle}>Send message even without Wi-Fi</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  container: {
    flex: 1,
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    paddingTop: responsiveSpacing(8, 4, 12),
  },

  // HEADER STYLES
  headerCard: {
    backgroundColor: '#180707',
    marginTop: responsiveSpacing(12, 8, 16),
    marginBottom: responsiveSpacing(20, 14, 26),
    paddingVertical: responsiveSpacing(14, 10, 18),
    paddingHorizontal: responsiveSpacing(16, 12, 20),
    borderRadius: responsiveSize(24, 20, 28),
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: responsiveSpacing(12, 10, 14),
    paddingRight: 12,
  },
  logoImage: {
    width: responsiveSize(52, 44, 60),
    height: responsiveSize(52, 44, 60),
    borderRadius: responsiveSize(26, 22, 30),
  },
  logoTextWrap: {
    flexShrink: 1,
  },
  logo: {
    fontSize: responsiveSize(22, 18, 26),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  logoTagline: {
    fontSize: responsiveSize(13, 11, 15),
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 1,
  },
  avatar: {
    width: responsiveSize(46, 38, 54),
    height: responsiveSize(46, 38, 54),
    borderRadius: responsiveSize(23, 19, 27),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',   // ✅ NEW — keeps the image inside the circle
  },
  avatarImage: {          // ✅ NEW
    width: '100%',
    height: '100%',
    borderRadius: responsiveSize(23, 19, 27),
    resizeMode: 'cover',
  },

  // Section Titles
  sectionTitle: {
    fontSize: responsiveSize(14, 11, 17),
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: 1,
    marginBottom: responsiveSpacing(20, 14, 26),
    marginTop: 0,
  },

  // SOS Button Styles
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

  // SOS Top Section
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

  // SOS Bottom Section
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

  // Medium Button (SMS Alert)
  smsTouchable: {
    borderRadius: responsiveSize(20, 16, 24),
    shadowColor: '#0047B3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  mediumButton: {
    borderRadius: responsiveSize(20, 16, 24),
    paddingVertical: responsiveSpacing(36, 26, 48),
    paddingHorizontal: responsiveSpacing(12, 8, 16),
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
    borderTopLeftRadius: responsiveSize(19, 15, 23),
    borderTopRightRadius: responsiveSize(19, 15, 23),
  },
  mediumIconWrapper: {
    width: responsiveSize(94, 74, 112),
    height: responsiveSize(94, 74, 112),
    borderRadius: responsiveSize(47, 37, 56),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: responsiveSpacing(20, 14, 26),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  mediumLabel: {
    fontSize: responsiveSize(22, 17, 26),
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: responsiveSpacing(7, 5, 9),
    letterSpacing: 0.3,
  },
  mediumSubtitle: {
    fontSize: responsiveSize(15, 12, 18),
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
});