// components/LoginFormPage.tsx
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Image,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '../services/firebase';

export interface LoginFormPageProps {
  onBack: () => void;
  onLoginSuccess: (userData: any) => void;
  onRegisterNow: () => void;
  onGuestMode: () => void;
}

// Design tokens
const COLORS = {
  red: '#E10000',
  redDark: '#B00000',
  redTint: '#FDE8E8',
  black: '#141414',
  white: '#FFFFFF',
  ink: '#0F0F0F',
  gray: '#2B3445',
  grayLight: '#9A9A9A',
  field: '#F1F1F1',
  line: '#DADADA',
};

const STATUS_BAR = Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 8;

export default function LoginFormPage({
  onBack,
  onLoginSuccess,
  onRegisterNow,
  onGuestMode,
}: LoginFormPageProps) {
  const { width } = useWindowDimensions();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | 'reset' | null>(null);

  // Forgot Password States
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const showErrorAlert = (title: string, message: string) => {
    Alert.alert(title, message, [{ text: 'OK' }]);
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      showErrorAlert(
        'Invalid Email',
        'Please enter a valid email address.\n\nExample: username@example.com'
      );
      return;
    }
    if (!password) {
      showErrorAlert('Password Required', 'Please enter your password to continue.');
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        await signOut(auth);
        showErrorAlert(
          'Email Not Verified',
          `We sent a verification link to:\n\n${trimmedEmail}\n\nPlease check your inbox and spam folder to verify your email address before logging in.`
        );
        return;
      }

      const userDoc = await getDoc(doc(firestore, 'users', user.uid));

      if (!userDoc.exists()) {
        showErrorAlert('Login Failed', 'Account data not found. Please contact support.');
        return;
      }

      const userData = userDoc.data();
      Alert.alert('Welcome Back!', `Hello ${userData.firstName}, you have successfully logged in.`, [
        { text: 'OK' },
      ]);
      onLoginSuccess(userData);
    } catch (error: any) {
      showErrorAlert(
        'Login Failed',
        'The email or password you entered is incorrect.\n\nPlease try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password Handlers
  const handleForgotPassword = () => {
    setResetEmail(email);
    setShowForgotPasswordModal(true);
  };

  const handleSendResetEmail = async () => {
    const trimmed = resetEmail.trim();
    if (!trimmed || !trimmed.includes('@')) {
      showErrorAlert('Invalid Email', 'Please enter a valid email address to reset your password.');
      return;
    }

    setIsResetting(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      Alert.alert(
        'Reset Email Sent',
        `We have sent a password reset link to:\n\n${trimmed}\n\nPlease check your inbox and spam folder to reset your password.`,
        [{ text: 'OK', onPress: () => setShowForgotPasswordModal(false) }]
      );
      setResetEmail('');
    } catch (error: any) {
      let errorMessage = 'Failed to send reset email. Please try again.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address. Please register first.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address. Please enter a valid email.';
      }
      showErrorAlert('Reset Failed', errorMessage);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Top-right decoration */}
      <View style={styles.topBlack} />
      <View style={styles.topCircleBig} />
      <View style={styles.topCircleDark} />

      {/* Bottom-right decoration */}
      <View style={[styles.bottomCircleDark, { right: -width * 0.4 }]} pointerEvents="none" />
      <View style={[styles.bottomCircle, { right: -width * 0.5 }]} pointerEvents="none" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back */}
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.ink} />
        </TouchableOpacity>

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
              <Ionicons name="pulse" size={14} color={COLORS.red} />
              <View style={styles.pulseLine} />
            </View>
          </View>
        </View>

        <Text style={styles.welcomeText}>Welcome Back!</Text>
        <Text style={styles.welcomeSub}>Enter your details to continue.</Text>

        {/* Email */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Email Address</Text>
          <View style={[styles.inputContainer, focused === 'email' && styles.inputFocused]}>
            <Ionicons name="mail-outline" size={20} color={COLORS.red} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your email address"
              placeholderTextColor={COLORS.grayLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              returnKeyType="next"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.inputWrapper}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={[styles.inputContainer, focused === 'password' && styles.inputFocused]}>
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={COLORS.red}
              style={styles.inputIcon}
            />
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={COLORS.grayLight}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              returnKeyType="done"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={COLORS.gray}
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.forgotPassword} onPress={handleForgotPassword}>
          <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
        </TouchableOpacity>

        {/* Login */}
        <TouchableOpacity
          style={[styles.loginButton, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </TouchableOpacity>

        {/* Register link */}
        <View style={styles.registerRow}>
          <Text style={styles.registerPrompt}>Don't have an account?</Text>
          <TouchableOpacity
            onPress={onRegisterNow}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.registerLink}>Register</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.dividerContainer}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.divider} />
        </View>

        {/* Guest */}
        <TouchableOpacity style={styles.guestButton} onPress={onGuestMode} activeOpacity={0.7}>
          <Ionicons name="person-outline" size={20} color={COLORS.red} />
          <Text style={styles.guestButtonText}>Continue as Guest</Text>
          <Ionicons name="arrow-forward" size={18} color={COLORS.red} />
        </TouchableOpacity>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal
        transparent
        visible={showForgotPasswordModal}
        animationType="fade"
        onRequestClose={() => setShowForgotPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity
                onPress={() => setShowForgotPasswordModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={COLORS.ink} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.modalIconContainer}>
                <Ionicons name="lock-closed-outline" size={40} color={COLORS.red} />
              </View>
              <Text style={styles.modalDescription}>
                Enter your email address below and we'll send you a link to reset your password.
              </Text>

              <View
                style={[styles.modalInputContainer, focused === 'reset' && styles.inputFocused]}
              >
                <Ionicons name="mail-outline" size={20} color={COLORS.red} />
                <TextInput
                  style={styles.modalInput}
                  placeholder="Email Address"
                  placeholderTextColor={COLORS.grayLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  onFocus={() => setFocused('reset')}
                  onBlur={() => setFocused(null)}
                />
              </View>

              <TouchableOpacity
                style={[styles.resetButton, isResetting && styles.buttonDisabled]}
                onPress={handleSendResetEmail}
                disabled={isResetting}
                activeOpacity={0.85}
              >
                {isResetting ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Text style={styles.resetButtonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },

  // Decorations
  topBlack: {
    position: 'absolute',
    top: -138,
    right: -176,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: COLORS.black,
  },
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
  bottomCircleDark: {
    position: 'absolute',
    bottom: -250,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: COLORS.redDark,
  },
  bottomCircle: {
    position: 'absolute',
    bottom: -280,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: COLORS.red,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: STATUS_BAR,
    paddingBottom: 40,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.field,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 22,
  },
  logoImage: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: COLORS.black,
  },
  logoTextWrap: {
    alignItems: 'stretch',
  },
  logoText: {
    fontSize: 22,
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

  welcomeText: {
    fontSize: 34,
    fontWeight: '900',
    color: COLORS.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  welcomeSub: {
    fontSize: 17,
    color: COLORS.gray,
    marginTop: 6,
    marginBottom: 24,
    textAlign: 'center',
  },

  // Inputs
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.field,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    height: 56,
  },
  inputFocused: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.white,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.ink,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 14,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: COLORS.red,
    fontWeight: '700',
  },

  // Buttons
  loginButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.3,
  },

  // Register link row
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  registerPrompt: {
    fontSize: 15,
    color: COLORS.ink,
  },
  registerLink: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.red,
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.line,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  guestButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.redTint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  guestButtonText: {
    fontSize: 16,
    color: COLORS.red,
    fontWeight: '800',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '88%',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.ink,
  },
  modalBody: {
    padding: 24,
    alignItems: 'center',
  },
  modalIconContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.redTint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 21,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.field,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    height: 56,
    width: '100%',
    marginBottom: 20,
  },
  modalInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.ink,
    marginLeft: 12,
  },
  resetButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});