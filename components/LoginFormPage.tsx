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

// Design tokens (same as LoginPage)
const COLORS = {
  red: '#B00000',
  redTint: '#FDECEC',
  white: '#FFFFFF',
  ink: '#1A1111',
  gray: '#6B6464',
  grayLight: '#9A9393',
  field: '#F6F2F2',
  line: '#E6DEDE',
};

const STATUS_BAR = Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight ?? 24) + 8;

export default function LoginFormPage({
  onBack,
  onLoginSuccess,
  onRegisterNow,
  onGuestMode,
}: LoginFormPageProps) {
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
      <StatusBar barStyle="light-content" backgroundColor={COLORS.red} />

      {/* Header – solid red, big logo, no border */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <Image
          source={require('../assets/adaptive-icon2.png')}
          style={styles.headerImage}
          resizeMode="contain"
        />
        <Text style={styles.brandText}>
          NAGA-<Text style={styles.brandHighlight}>READY</Text>
        </Text>
        <Text style={styles.subtitleText}>Login to your NagaReady account</Text>
      </View>

      {/* White sheet */}
      <View style={styles.sheet}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
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

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          {/* Guest */}
          <TouchableOpacity style={styles.guestButton} onPress={onGuestMode} activeOpacity={0.7}>
            <Ionicons name="person-outline" size={20} color={COLORS.red} />
            <Text style={styles.guestButtonText}>Continue as Guest</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.red} />
          </TouchableOpacity>

          {/* Register */}
          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={onRegisterNow}>
              <Text style={styles.registerLinkText}>Register Now</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

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
  // Pure solid red background
  container: {
    flex: 1,
    backgroundColor: COLORS.red,
  },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: STATUS_BAR,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    top: STATUS_BAR,
    left: 20,
    zIndex: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Big logo – no border, no box
  headerImage: {
    width: 150,
    height: 150,
  },
  brandText: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  brandHighlight: {
    color: '#FFD3D3',
  },
  subtitleText: {
    fontSize: 14,
    color: COLORS.white,
    opacity: 0.92,
    marginTop: 6,
    letterSpacing: 0.3,
  },

  // White sheet
  sheet: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 32,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.5,
  },
  welcomeSub: {
    fontSize: 15,
    color: COLORS.gray,
    marginTop: 4,
    marginBottom: 24,
  },

  // Inputs
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.field,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 16,
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
    marginBottom: 22,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: COLORS.red,
    fontWeight: '700',
  },

  // Buttons
  loginButton: {
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.line,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: COLORS.grayLight,
    fontWeight: '500',
  },
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
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  registerText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  registerLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.red,
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
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 16,
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
    borderRadius: 16,
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