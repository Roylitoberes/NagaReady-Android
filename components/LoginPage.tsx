// components/LoginPage.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  StatusBar,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LoginFormPage from './LoginFormPage';
import RegisterPage from './RegisterPage';
import OnboardingScreen from './OnboardingScreen';

interface LoginPageProps {
  onLogin: (userData: any) => void;
  onGuestContinue: () => void;
  onRegister: () => void;
}

// Design tokens
const COLORS = {
  red: '#E10000',
  redDark: '#B00000',
  black: '#141414',
  white: '#FFFFFF',
  ink: '#0F0F0F',
  gray: '#2B3445',
};

const STATUS_BAR = Platform.OS === 'ios' ? 64 : (StatusBar.currentHeight ?? 24) + 24;

export default function LoginPage({ onLogin, onGuestContinue }: LoginPageProps) {
  const { width, height } = useWindowDimensions();

  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showRegisterPage, setShowRegisterPage] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newUserData, setNewUserData] = useState<any>(null);

  const handleRegisterSuccess = (userData: any) => {
    setNewUserData(userData);
    setShowRegisterPage(false);
    setShowOnboarding(true);
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    onLogin(newUserData);
  };

  if (showOnboarding) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  if (showRegisterPage) {
    return (
      <RegisterPage
        onBack={() => setShowRegisterPage(false)}
        onRegisterSuccess={handleRegisterSuccess}
      />
    );
  }

  if (showLoginForm) {
    return (
      <LoginFormPage
        onBack={() => setShowLoginForm(false)}
        onLoginSuccess={onLogin}
        onRegisterNow={() => setShowRegisterPage(true)}
        onGuestMode={onGuestContinue}
      />
    );
  }

  const bottomH = height * 0.56;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Top-right red swoosh */}
      <View style={styles.topCircleBig} />
      <View style={styles.topCircleDark} />

      {/* Logo */}
      <View style={styles.logoRow}>
        <Image
          source={require('../assets/adaptive-icon2.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <View style={styles.logoTextWrap}>
          <Text style={styles.logoText}>
            NAGA-<Text style={styles.logoTextRed}>READY</Text>
          </Text>
          <View style={styles.pulseRow}>
            <View style={styles.pulseLine} />
            <Ionicons name="pulse" size={16} color={COLORS.red} />
            <View style={styles.pulseLine} />
          </View>
        </View>
      </View>

      {/* Title */}
      <View style={styles.titleWrap}>
        <Text style={styles.title}>Get Started</Text>
        <Text style={styles.subtitle}>Start with sign up or sign in</Text>
      </View>

      {/* Bottom curved black area */}
      <View style={[styles.bottomArea, { height: bottomH }]}>
        {/* red wave behind */}
        <View
          style={{
            position: 'absolute',
            width: width * 1.6,
            height: bottomH * 1.6,
            borderRadius: width * 0.8,
            left: -width * 0.3,
            top: 0,
            backgroundColor: COLORS.red,
          }}
        />
        {/* black wave */}
        <View
          style={{
            position: 'absolute',
            width: width * 1.6,
            height: bottomH * 1.6,
            borderRadius: width * 0.8,
            left: -width * 0.3,
            top: 22,
            backgroundColor: COLORS.black,
          }}
        />
        {/* bottom-right red swoosh */}
        <View style={[styles.bottomCircleDark, { right: -width * 0.45 }]} />
        <View style={[styles.bottomCircle, { right: -width * 0.55 }]} />

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.pillButton}
            onPress={() => setShowLoginForm(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.pillButtonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pillButton}
            onPress={() => setShowRegisterPage(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.pillButtonText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.guestButton}
            onPress={onGuestContinue}
            activeOpacity={0.7}
          >
            <Ionicons name="person-outline" size={20} color={COLORS.red} />
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.red} />
          </TouchableOpacity>

          <Text style={styles.footerText}>
            By continuing, you agree to our
            <Text style={styles.linkText}> Terms of Service</Text> and
            <Text style={styles.linkText}> Privacy Policy</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },

  // Top-right decoration
  topCircleBig: {
    position: 'absolute',
    top: -150,
    right: -170,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: COLORS.red,
  },
  topCircleDark: {
    position: 'absolute',
    top: -200,
    right: -200,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: COLORS.redDark,
  },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: STATUS_BAR,
    paddingHorizontal: 24,
    gap: 12,
  },
  logoImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: COLORS.black,
  },
  logoTextWrap: {
    alignItems: 'stretch',
  },
  logoText: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.ink,
    letterSpacing: 0.5,
  },
  logoTextRed: {
    color: COLORS.red,
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  pulseLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.red,
  },

  // Title
  titleWrap: {
    paddingHorizontal: 24,
    marginTop: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 17,
    color: COLORS.gray,
    textAlign: 'center',
  },

  // Bottom area
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  bottomCircleDark: {
    position: 'absolute',
    bottom: -250,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: COLORS.redDark,
  },
  bottomCircle: {
    position: 'absolute',
    bottom: -300,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: COLORS.red,
  },
  buttonsContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: Platform.OS === 'ios' ? 40 : 64,
  },
  pillButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pillButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.ink,
  },
  guestButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  guestButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.red,
  },
  footerText: {
    marginTop: 12,
    paddingHorizontal: 8,
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    lineHeight: 16,
  },
  linkText: {
    color: COLORS.white,
    fontWeight: '700',
  },
});