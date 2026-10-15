// components/LoginPage.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
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
  red: '#B00000',
  redDark: '#8C0000',
  redTint: '#FDECEC',
  white: '#FFFFFF',
  ink: '#1A1111',
  gray: '#6B6464',
  grayLight: '#9A9393',
  handle: '#E6DEDE',
};

export default function LoginPage({ onLogin, onGuestContinue }: LoginPageProps) {
  const { height } = useWindowDimensions();

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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.red} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          {/* Big logo – no border, no box */}
          <Image
            source={require('../assets/adaptive-icon2.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />

          <Text style={styles.cityName}>
            NAGA-<Text style={styles.cityNameHighlight}>READY</Text>
          </Text>

          <Text style={styles.subtitle}>Emergency Response System</Text>

          <View style={styles.locationPill}>
            <Ionicons name="location-outline" size={14} color={COLORS.white} />
            <Text style={styles.locationText}>Naga City, Cebu</Text>
          </View>

          {/* Feature highlights */}
          <View style={styles.featuresRow}>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="megaphone-outline" size={22} color={COLORS.white} />
              </View>
              <Text style={styles.featureText}>Report{'\n'}incidents</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="navigate-outline" size={22} color={COLORS.white} />
              </View>
              <Text style={styles.featureText}>Track{'\n'}responders</Text>
            </View>
            <View style={styles.featureItem}>
              <View style={styles.featureIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={COLORS.white} />
              </View>
              <Text style={styles.featureText}>SMS{'\n'}alerts</Text>
            </View>
          </View>
        </View>

        {/* White sheet – taller */}
        <View style={[styles.sheet, { minHeight: height * 0.62 }]}>
          <View style={styles.sheetHandle} />

          <Text style={styles.sheetTitle}>Welcome</Text>
          <Text style={styles.sheetSubtitle}>
            Sign in to report emergencies and follow the response in real time.
          </Text>

          <View style={styles.buttonsContainer}>
            {/* Login – solid red */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => setShowLoginForm(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.loginButtonText}>Login</Text>
            </TouchableOpacity>

            {/* Register – outlined red */}
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => setShowRegisterPage(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.registerButtonText}>Create Account</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Guest – red */}
            <TouchableOpacity
              style={styles.guestButton}
              onPress={onGuestContinue}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={20} color={COLORS.red} />
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.red} />
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              By continuing, you agree to our
              <Text style={styles.linkText}> Terms of Service</Text> and
              <Text style={styles.linkText}> Privacy Policy</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pure solid red background – no gradient, no decorations
  container: {
    flex: 1,
    backgroundColor: COLORS.red,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },

  // Header
  headerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 24,
  },
  logoImage: {
    width: 150,
    height: 150,
    marginBottom: 0,
  },
  cityName: {
    fontSize: 40,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1.5,
  },
  cityNameHighlight: {
    color: '#FFD3D3',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '500',
    letterSpacing: 0.4,
    opacity: 0.92,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 14,
  },
  locationText: {
    fontSize: 12,
    color: COLORS.white,
    fontWeight: '600',
  },

  // Feature highlights
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 12,
  },
  featureItem: {
    alignItems: 'center',
    width: 84,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  featureText: {
    fontSize: 12,
    color: COLORS.white,
    textAlign: 'center',
    lineHeight: 16,
    fontWeight: '500',
    opacity: 0.92,
  },

  // White sheet
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 32,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.handle,
    marginBottom: 26,
  },
  sheetTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.gray,
  },

  // Buttons – taller
  buttonsContainer: {
    marginTop: 28,
  },
  loginButton: {
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  registerButton: {
    height: 60,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.red,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.red,
    letterSpacing: 0.3,
  },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.handle,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: COLORS.grayLight,
    fontWeight: '500',
  },

  // Guest – red
  guestButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.redTint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  guestButtonText: {
    fontSize: 16,
    color: COLORS.red,
    fontWeight: '700',
  },

  // Footer
  footer: {
    marginTop: 'auto',
    paddingTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: COLORS.grayLight,
    textAlign: 'center',
    lineHeight: 18,
  },
  linkText: {
    color: COLORS.red,
    fontWeight: '700',
  },
});