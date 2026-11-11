// components/ProfilePage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  signOut,
  signInWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth } from '../services/firebase';
import { supabase } from '../services/supabase';

interface ProfilePageProps {
  userData?: any;
  onLogout?: () => void;
  onEditProfile?: () => void;
  onPhotoUpdated?: (url: string) => void;
  onProfileUpdated?: (updatedUserData: any) => void;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface InfoItem {
  icon: IconName;
  label: string;
  value: string;
}

const COLORS = {
  background: '#0A0A0A',
  surface: '#12121A',
  border: '#1E1E2E',
  text: '#F8FAFC',
  muted: '#94A3B8',
  faint: '#64748B',
  brand: '#DC2626',
  brandSoft: 'rgba(220, 38, 38, 0.14)',
  success: '#22C55E',
  info: '#0EA5E9',
};

/* ============================================================
   PASSWORD RULES (same as the admin portal)
   12+ chars, upper, lower, number, special
   ============================================================ */
const PASSWORD_MIN_LENGTH = 12;

const validateNewPassword = (pw: string): string => {
  if (pw.length < PASSWORD_MIN_LENGTH)
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Z]/.test(pw)) return 'Include at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Include at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Include at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw))
    return 'Include at least one special character.';
  return '';
};

/* ============================================================
   EMAIL MASK  (admin@gmail.com -> admi•••@gmail.com)
   ============================================================ */
const maskEmail = (email?: string): string => {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  const visible = local.length > 4 ? 4 : 1;
  const hidden = Math.max(local.length - visible, 3);
  return `${local.slice(0, visible)}${'•'.repeat(hidden)}@${domain}`;
};

/* ============================================================
   PASSWORD INPUT WITH SHOW / HIDE EYE
   ============================================================ */
interface PasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

const PasswordField = ({
  value,
  onChange,
  placeholder,
  onFocus,
  onBlur,
}: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.pwInputWrap}>
      <TextInput
        style={styles.pwInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.faint}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={COLORS.muted}
        />
      </TouchableOpacity>
    </View>
  );
};

export default function ProfilePage({
  userData: userDataProp,
  onLogout,
  onEditProfile,
  onPhotoUpdated,
  onProfileUpdated,
}: ProfilePageProps) {

  // Local edits are layered on top of the userData prop so changes show
  // immediately after saving.
  const [localEdits, setLocalEdits] = useState<any>({});
  const userData = useMemo(
    () => ({ ...(userDataProp || {}), ...localEdits }),
    [userDataProp, localEdits]
  );

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  const [pendingPhoto, setPendingPhoto] = useState<{
    uri: string;
    mimeType: string;
  } | null>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // --- SETTINGS MENU ---
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  // --- EDIT PROFILE ---
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editSex, setEditSex] = useState('');
  const [editStreet, setEditStreet] = useState('');
  const [editBarangay, setEditBarangay] = useState('');
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // --- CHANGE PASSWORD ---
  const [showPwModal, setShowPwModal] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [newPwFocused, setNewPwFocused] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  // --- FORGOT PASSWORD ---
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const getFirebaseUserId = () => {
    if (auth.currentUser?.uid) {
      return auth.currentUser.uid;
    }
    if (userData?.uid) {
      return userData.uid;
    }
    if (userData?.userId) {
      return userData.userId;
    }
    return null;
  };

  useEffect(() => {
    loadProfilePhoto();
  }, [userData]);

  const loadProfilePhoto = async () => {
    try {
      const userId = getFirebaseUserId();

      if (!userId) {
        console.log('Profile photo: waiting for user ID...');
        return;
      }

      const storageKey = `profilePhotoUrl_${userId}`;
      const savedPhoto = await AsyncStorage.getItem(storageKey);

      if (savedPhoto) {
        setProfilePhoto(savedPhoto);
      }
    } catch (error) {
      console.error('Error loading profile photo:', error);
    }
  };

  const handleProfilePhotoPress = async () => {
    try {
      const userId = getFirebaseUserId();

      console.log('Profile Firebase UID:', userId);

      if (!userId) {
        Alert.alert(
          'Account Not Found',
          'Your account information is still loading. Please try again.'
        );
        return;
      }

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'NagaReady needs access to your photos so you can select a profile picture.'
        );
        return;
      }

      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });

      if (result.canceled) return;
      if (!result.assets || result.assets.length === 0) return;

      const selectedImage = result.assets[0];

      setPendingPhoto({
        uri: selectedImage.uri,
        mimeType: selectedImage.mimeType || 'image/jpeg',
      });

      setShowConfirmModal(true);
    } catch (error) {
      console.error('Profile photo picker error:', error);
      Alert.alert(
        'Error',
        'Something went wrong while selecting your photo.'
      );
    }
  };

  const handleConfirmPhoto = async () => {
    if (!pendingPhoto) return;

    const userId = getFirebaseUserId();

    if (!userId) {
      Alert.alert(
        'Account Not Found',
        'Your account information is still loading. Please try again.'
      );
      setShowConfirmModal(false);
      setPendingPhoto(null);
      return;
    }

    setShowConfirmModal(false);

    await uploadProfilePhoto(
      pendingPhoto.uri,
      pendingPhoto.mimeType,
      userId
    );

    setPendingPhoto(null);
  };

  const handleCancelPhoto = () => {
    setShowConfirmModal(false);
    setPendingPhoto(null);
  };

  const uploadProfilePhoto = async (
    imageUri: string,
    mimeType: string,
    userId: string
  ) => {
    try {
      setIsUploadingPhoto(true);

      let extension = 'jpg';
      if (mimeType === 'image/png') extension = 'png';
      if (mimeType === 'image/webp') extension = 'webp';

      const filePath = `${userId}/avatar.${extension}`;

      console.log('Uploading profile photo:', filePath);

      const response = await fetch(imageUri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, arrayBuffer, {
          contentType: mimeType,
          upsert: true,
          cacheControl: '3600',
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from('profile-photos')
        .getPublicUrl(filePath);

      if (!publicUrlData || !publicUrlData.publicUrl) {
        throw new Error('Unable to get the uploaded photo URL.');
      }

      const photoUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      console.log('Profile photo URL:', photoUrl);

      setProfilePhoto(photoUrl);

      if (onPhotoUpdated) {
        onPhotoUpdated(photoUrl);
      }

      await AsyncStorage.setItem(
        `profilePhotoUrl_${userId}`,
        photoUrl
      );

      Alert.alert(
        'Profile Photo Updated',
        'Your profile photo has been uploaded successfully.'
      );
    } catch (error: any) {
      console.error('Profile photo upload error:', error);
      Alert.alert(
        'Upload Failed',
        error?.message ||
          'Unable to upload your profile photo. Please try again.'
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  /* ============================================================
     SETTINGS MENU HANDLERS
     ============================================================ */
  const resetPasswordForm = () => {
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setNewPwFocused(false);
    setPwError('');
    setPwSuccess('');
    setResetEmail('');
    setResetError('');
    setResetSuccess('');
  };

  // Opened from the Edit Profile modal. The email is NOT pre-filled
  // in the Forgot Password field; the user types it.
  const openChangePassword = () => {
    setMenuOpen(false);
    setShowEditModal(false);
    resetPasswordForm();
    setShowPwModal(true);
  };

  const closeChangePassword = () => {
    if (pwLoading || resetLoading) return;
    setShowPwModal(false);
    resetPasswordForm();
  };

  const openAbout = () => {
    setMenuOpen(false);
    setShowAbout(true);
  };

  // --- CHANGE PASSWORD (current + new + confirm in one step) ---
  const handleUpdatePassword = async () => {
    setPwError('');
    setPwSuccess('');

    // auth.currentUser can be null even when the user is logged in
    // (session restored from AsyncStorage), so fall back to userData.email
    const email = auth.currentUser?.email || userData?.email;

    if (!email) {
      return setPwError(
        'No email found for this account. Please log in again.'
      );
    }

    if (!currentPw) return setPwError('Please enter your current password.');
    const ruleError = validateNewPassword(newPw);
    if (ruleError) return setPwError(ruleError);
    if (newPw !== confirmPw) return setPwError('Passwords do not match.');
    if (newPw === currentPw)
      return setPwError('New password must be different.');

    setPwLoading(true);
    try {
      let user = auth.currentUser;

      if (user) {
        // Firebase session is active: re-verify the current password
        const credential = EmailAuthProvider.credential(email, currentPw);
        await reauthenticateWithCredential(user, credential);
      } else {
        // No Firebase session: sign in with the current password
        // (this also verifies it and restores the session)
        const cred = await signInWithEmailAndPassword(auth, email, currentPw);
        user = cred.user;
      }

      await updatePassword(user, newPw);
      setPwSuccess('Password updated successfully!');
      setTimeout(() => {
        setShowPwModal(false);
        resetPasswordForm();
      }, 1800);
    } catch (err: any) {
      if (
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/invalid-credential'
      ) {
        setPwError('Current password is incorrect.');
      } else if (err?.code === 'auth/user-not-found') {
        setPwError('This account was not found in Firebase Authentication.');
      } else if (err?.code === 'auth/too-many-requests') {
        setPwError('Too many attempts. Please try again later.');
      } else if (err?.code === 'auth/requires-recent-login') {
        setPwError('Please log out and log in again, then retry.');
      } else if (err?.code === 'auth/network-request-failed') {
        setPwError('Network error. Check your connection and try again.');
      } else {
        setPwError(err?.message || 'Failed to update password.');
      }
    } finally {
      setPwLoading(false);
    }
  };

  // --- FORGOT PASSWORD: send reset link by email ---
  const handleSendResetLink = async () => {
    setResetError('');
    setResetSuccess('');
    const email = resetEmail.trim();
    if (!email) {
      return setResetError('Please enter your registered email address.');
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess(
        `Reset link sent to ${email}. Check your inbox (and spam).`
      );
    } catch (err: any) {
      if (err?.code === 'auth/invalid-email') {
        setResetError('Invalid email address.');
      } else if (err?.code === 'auth/user-not-found') {
        setResetError('No account found with this email.');
      } else if (err?.code === 'auth/too-many-requests') {
        setResetError('Too many requests. Try again later.');
      } else {
        setResetError('Failed to send reset link. Please try again.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  /* ============================================================
     EDIT PROFILE (name, contact, personal information)
     ============================================================ */
  const openEditProfile = () => {
    setEditFirstName(userData?.firstName || '');
    setEditLastName(userData?.lastName || '');
    setEditPhone(userData?.mobileNumber || '');
    setEditDob(userData?.dateOfBirth || '');
    setEditSex(userData?.sex || '');
    setEditStreet(userData?.street || '');
    setEditBarangay(userData?.barangay || '');
    setEditError('');
    setShowEditModal(true);
  };

  const closeEditProfile = () => {
    if (editSaving) return;
    setShowEditModal(false);
  };

  const handleSaveProfile = async () => {
    setEditError('');

    const first = editFirstName.trim();
    const last = editLastName.trim();
    if (!first) return setEditError('First name is required.');

    let phone = editPhone.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = phone.slice(1);
    if (phone && phone.length !== 10) {
      return setEditError('Phone number must be 10 digits (e.g. 9123456789).');
    }

    const userId = getFirebaseUserId();
    if (!userId) {
      return setEditError(
        'Your account information is still loading. Please try again.'
      );
    }

    const updates = {
      firstName: first,
      lastName: last,
      mobileNumber: phone,
      dateOfBirth: editDob.trim(),
      sex: editSex,
      street: editStreet.trim(),
      barangay: editBarangay.trim(),
    };

    setEditSaving(true);
    try {
      await setDoc(
        doc(getFirestore(), 'users', userId),
        { ...updates, updatedAt: new Date().toISOString() },
        { merge: true }
      );

      // Keep the locally saved session in sync
      try {
        const stored = await AsyncStorage.getItem('userData');
        const parsed = stored ? JSON.parse(stored) : {};
        await AsyncStorage.setItem(
          'userData',
          JSON.stringify({ ...parsed, ...updates })
        );
      } catch (e) {
        console.error('Failed to update stored userData:', e);
      }

      setLocalEdits((prev: any) => ({ ...prev, ...updates }));
      if (onProfileUpdated) onProfileUpdated({ ...userData, ...updates });

      setShowEditModal(false);
      Alert.alert('Profile Updated', 'Your information has been saved.');
    } catch (err: any) {
      console.error('Profile update error:', err);
      if (err?.code === 'permission-denied') {
        setEditError(
          'Could not save. Please log out and log in again, then retry.'
        );
      } else {
        setEditError(err?.message || 'Failed to save your information.');
      }
    } finally {
      setEditSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  const performLogout = async () => {
    try {
      setIsLoggingOut(true);

      await signOut(auth);
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('isNewUser');
      await AsyncStorage.removeItem('sessionActive');
      await AsyncStorage.removeItem('isGuest');

      if (onLogout) onLogout();
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Error', 'Failed to logout. Please try again.');
      setIsLoggingOut(false);
    }
  };

  if (isLoggingOut) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>Logging out...</Text>
      </View>
    );
  }

  const firstName = userData?.firstName || 'User';
  const lastName = userData?.lastName || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'U';

  const address =
    [userData?.street, userData?.barangay]
      .filter(Boolean)
      .join(', ') || 'Not specified';

  const contactItems: InfoItem[] = [
    {
      icon: 'call-outline',
      label: 'Phone number',
      value: userData?.mobileNumber
        ? `+63 ${userData.mobileNumber}`
        : 'Not specified',
    },
    {
      icon: 'mail-outline',
      label: 'Email',
      value: userData?.email ? maskEmail(userData.email) : 'Not specified',
    },
  ];

  const personalItems: InfoItem[] = [
    {
      icon: 'calendar-outline',
      label: 'Date of birth',
      value: userData?.dateOfBirth || 'Not specified',
    },
    {
      icon: 'male-female-outline',
      label: 'Gender',
      value: userData?.sex || 'Not specified',
    },
    {
      icon: 'location-outline',
      label: 'Address',
      value: address,
    },
  ];

  const renderGroup = (title: string, items: InfoItem[]) => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.card}>
          {items.map((item, index) => (
            <View
              key={item.label}
              style={[
                styles.row,
                index < items.length - 1 && styles.rowDivider,
              ]}
            >
              <View style={styles.rowIcon}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={COLORS.brand}
                />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{item.label}</Text>
                <Text style={styles.rowValue}>{item.value}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <>
      <View
        style={styles.container}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.avatarWrapper}
              onPress={handleProfilePhotoPress}
              activeOpacity={0.85}
              disabled={isUploadingPhoto}
            >
              <View style={styles.avatar}>
                {profilePhoto ? (
                  <Image
                    source={{ uri: profilePhoto }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarText}>{initials}</Text>
                )}

                {isUploadingPhoto && (
                  <View style={styles.avatarLoading}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}
              </View>

              {!isUploadingPhoto && (
                <View style={styles.cameraButton}>
                  <Ionicons name="camera" size={16} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.changePhotoText}>Tap photo to change</Text>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.email}>
              {userData?.email
                ? maskEmail(userData.email)
                : 'user@example.com'}
            </Text>
          </View>

          {renderGroup('Contact', contactItems)}
          {renderGroup('Personal information', personalItems)}

          <Text style={styles.versionText}>NagaReady v1.0.0</Text>
        </ScrollView>

        {/* SETTINGS (GEAR) BUTTON */}
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setMenuOpen((v) => !v)}
          activeOpacity={0.8}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-sharp" size={26} color={COLORS.brand} />
        </TouchableOpacity>

        {/* TAP-OUTSIDE LAYER + DROPDOWN MENU */}
        {menuOpen && (
          <>
            <Pressable
              style={styles.menuBackdrop}
              onPress={() => setMenuOpen(false)}
            />
            <View style={styles.menu}>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDivider]}
                onPress={() => {
                  setMenuOpen(false);
                  openEditProfile();
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuIconEdit}>
                  <Ionicons name="create" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.menuText}>Edit Profile</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemDivider]}
                onPress={openAbout}
                activeOpacity={0.8}
              >
                <View style={styles.menuIconInfo}>
                  <Ionicons
                    name="information"
                    size={20}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={styles.menuText}>About NAGA READY</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                activeOpacity={0.8}
              >
                <View style={styles.menuIconLogout}>
                  <Ionicons name="log-out" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.menuText}>Logout</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* PHOTO CONFIRM MODAL */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelPhoto}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Save Profile Photo</Text>
              <TouchableOpacity
                onPress={handleCancelPhoto}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Use this photo as your profile picture?
            </Text>

            {pendingPhoto && (
              <View style={styles.modalImageWrapper}>
                <Image
                  source={{ uri: pendingPhoto.uri }}
                  style={styles.modalImage}
                />
              </View>
            )}

            <View style={styles.modalInfoRow}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={COLORS.brand}
              />
              <Text style={styles.modalInfoText}>
                This photo will be used as your profile picture.
              </Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={handleCancelPhoto}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={handleConfirmPhoto}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.modalSaveText}>Save Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* CHANGE PASSWORD MODAL */}
      <Modal
        visible={showPwModal}
        transparent
        animationType="fade"
        onRequestClose={closeChangePassword}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, styles.pwModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity
                onPress={closeChangePassword}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* 1. CHANGE PASSWORD */}
              <Text style={styles.pwHeading}>1. Change Password</Text>
              <View style={styles.pwCard}>
                <Text style={[styles.pwLabel, { marginTop: 0 }]}>
                  Current Password
                </Text>
                <PasswordField
                  value={currentPw}
                  onChange={setCurrentPw}
                  placeholder="Enter your current password"
                />

                <Text style={styles.pwLabel}>New Password</Text>
                <PasswordField
                  value={newPw}
                  onChange={setNewPw}
                  placeholder="Enter your new password"
                  onFocus={() => setNewPwFocused(true)}
                  onBlur={() => setNewPwFocused(false)}
                />
                {newPwFocused && (
                  <Text style={styles.pwHint}>
                    12+ characters with uppercase, lowercase, number, and
                    symbol.
                  </Text>
                )}

                <Text style={styles.pwLabel}>Confirm New Password</Text>
                <PasswordField
                  value={confirmPw}
                  onChange={setConfirmPw}
                  placeholder="Re-enter your new password"
                />
                {!!confirmPw && newPw !== confirmPw && (
                  <Text style={styles.pwError}>Passwords do not match.</Text>
                )}

                {!!pwError && <Text style={styles.pwError}>{pwError}</Text>}
                {!!pwSuccess && (
                  <Text style={styles.pwSuccess}>{pwSuccess}</Text>
                )}

                <View style={[styles.modalButtons, { marginTop: 14 }]}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={closeChangePassword}
                    disabled={pwLoading}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalSaveButton,
                      pwLoading && styles.disabledButton,
                    ]}
                    onPress={handleUpdatePassword}
                    disabled={pwLoading}
                    activeOpacity={0.8}
                  >
                    {pwLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalSaveText}>
                        Update Password
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* 2. FORGOT PASSWORD */}
              <Text style={styles.pwHeading}>
                2. Forgot Password (can't remember current password)
              </Text>
              <View style={styles.pwCard}>
                <Text style={[styles.pwLabel, { marginTop: 0 }]}>
                  Registered Email Address
                </Text>
                <View style={styles.pwInputWrap}>
                  <TextInput
                    style={styles.pwInput}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="Enter your email"
                    placeholderTextColor={COLORS.faint}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {!!resetError && (
                  <Text style={styles.pwError}>{resetError}</Text>
                )}
                {!!resetSuccess && (
                  <Text style={styles.pwSuccess}>{resetSuccess}</Text>
                )}

                <TouchableOpacity
                  style={[
                    styles.modalSaveButton,
                    { marginTop: 14, flex: 0 },
                    resetLoading && styles.disabledButton,
                  ]}
                  onPress={handleSendResetLink}
                  disabled={resetLoading}
                  activeOpacity={0.8}
                >
                  {resetLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveText}>Send Reset Link</Text>
                  )}
                </TouchableOpacity>
                <Text style={styles.pwHint}>
                  A password reset link will be sent to your registered email
                  address.
                </Text>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* EDIT PROFILE MODAL */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={closeEditProfile}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, styles.pwModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity
                onPress={closeEditProfile}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={[styles.modalSaveButton, { flex: 0, marginTop: 8 }]}
                onPress={openChangePassword}
                activeOpacity={0.8}
              >
                <Ionicons name="lock-closed" size={16} color="#FFFFFF" />
                <Text style={styles.modalSaveText}>Change Password</Text>
              </TouchableOpacity>

              <Text style={styles.pwHeading}>Name</Text>
              <View style={styles.pwCard}>
                <Text style={[styles.pwLabel, { marginTop: 0 }]}>
                  First Name
                </Text>
                <View style={styles.pwInputWrap}>
                  <TextInput
                    style={styles.pwInput}
                    value={editFirstName}
                    onChangeText={setEditFirstName}
                    placeholder="First name"
                    placeholderTextColor={COLORS.faint}
                  />
                </View>

                <Text style={styles.pwLabel}>Last Name</Text>
                <View style={styles.pwInputWrap}>
                  <TextInput
                    style={styles.pwInput}
                    value={editLastName}
                    onChangeText={setEditLastName}
                    placeholder="Last name"
                    placeholderTextColor={COLORS.faint}
                  />
                </View>
              </View>

              <Text style={styles.pwHeading}>Contact</Text>
              <View style={styles.pwCard}>
                <Text style={[styles.pwLabel, { marginTop: 0 }]}>
                  Phone number (+63)
                </Text>
                <View style={styles.pwInputWrap}>
                  <TextInput
                    style={styles.pwInput}
                    value={editPhone}
                    onChangeText={(t) =>
                      setEditPhone(t.replace(/\D/g, '').slice(0, 11))
                    }
                    placeholder="9XXXXXXXXX"
                    placeholderTextColor={COLORS.faint}
                    keyboardType="phone-pad"
                  />
                </View>

                <Text style={styles.pwLabel}>Email</Text>
                <View style={[styles.pwInputWrap, styles.disabledButton]}>
                  <TextInput
                    style={styles.pwInput}
                    value={maskEmail(userData?.email)}
                    editable={false}
                  />
                </View>
                <Text style={styles.pwHint}>
                  Email can't be changed here.
                </Text>
              </View>

              <Text style={styles.pwHeading}>Personal information</Text>
              <View style={styles.pwCard}>
                <Text style={[styles.pwLabel, { marginTop: 0 }]}>
                  Date of birth
                </Text>
                <View style={styles.pwInputWrap}>
                  <TextInput
                    style={styles.pwInput}
                    value={editDob}
                    onChangeText={setEditDob}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor={COLORS.faint}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                <Text style={styles.pwLabel}>Gender</Text>
                <View style={styles.sexRow}>
                  {['Male', 'Female'].map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.sexChip,
                        editSex === option && styles.sexChipActive,
                      ]}
                      onPress={() => setEditSex(option)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.sexChipText,
                          editSex === option && { color: '#FFFFFF' },
                        ]}
                      >
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.pwLabel}>Street / Purok</Text>
                <View style={styles.pwInputWrap}>
                  <TextInput
                    style={styles.pwInput}
                    value={editStreet}
                    onChangeText={setEditStreet}
                    placeholder="Street / Purok"
                    placeholderTextColor={COLORS.faint}
                  />
                </View>

                <Text style={styles.pwLabel}>Barangay</Text>
                <View style={styles.pwInputWrap}>
                  <TextInput
                    style={styles.pwInput}
                    value={editBarangay}
                    onChangeText={setEditBarangay}
                    placeholder="Barangay"
                    placeholderTextColor={COLORS.faint}
                  />
                </View>
              </View>

              {!!editError && <Text style={styles.pwError}>{editError}</Text>}

              <View style={[styles.modalButtons, { marginTop: 16 }]}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={closeEditProfile}
                  disabled={editSaving}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalSaveButton,
                    editSaving && styles.disabledButton,
                  ]}
                  onPress={handleSaveProfile}
                  disabled={editSaving}
                  activeOpacity={0.8}
                >
                  {editSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ABOUT MODAL */}
      <Modal
        visible={showAbout}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAbout(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.pwModalCard]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About NAGA READY</Text>
              <TouchableOpacity
                onPress={() => setShowAbout(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ marginTop: 12 }}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.aboutHeading}>About NAGA READY</Text>
              <Text style={styles.aboutBody}>
                NAGA READY is a citizen-focused emergency response mobile
                application designed to help residents of the City of Naga
                report emergencies, request assistance, and stay informed
                during emergency situations.
              </Text>

              <Text style={styles.aboutHeading}>Key Features:</Text>
              {[
                [
                  'Emergency Reporting',
                  'Submit emergency reports directly to the CDRRMO.',
                ],
                ['SOS Alert', 'Quickly request emergency assistance.'],
                [
                  'GPS Mapping',
                  'Share your location to help responders locate incidents.',
                ],
                [
                  'SMS Fallback',
                  'Send emergency reports through SMS when internet connectivity is unavailable.',
                ],
                [
                  'Notifications',
                  'Receive emergency alerts and updates on reported incidents.',
                ],
                [
                  'Emergency Information',
                  'Access important emergency announcements and information.',
                ],
              ].map(([title, desc]) => (
                <View key={title} style={styles.aboutFeatureRow}>
                  <Text style={styles.aboutBullet}>•</Text>
                  <Text style={styles.aboutBody}>
                    <Text style={styles.aboutBold}>{title}</Text>
                    {` – ${desc}`}
                  </Text>
                </View>
              ))}

              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>Developed for:</Text>
                <Text style={styles.aboutValue}>City of Naga CDRRMO</Text>
              </View>
              <View style={styles.aboutRow}>
                <Text style={styles.aboutLabel}>Version:</Text>
                <Text style={styles.aboutValue}>1.0.0</Text>
              </View>

              <Text style={styles.aboutFooter}>
                © 2026 NAGA READY. All Rights Reserved.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalSaveButton, { marginTop: 18, flex: 0 }]}
              onPress={() => setShowAbout(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalSaveText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 24,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.muted,
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: COLORS.brandSoft,
    borderWidth: 2,
    borderColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 1,
  },
  avatarLoading: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButton: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.brand,
    borderWidth: 3,
    borderColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 10,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  email: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
  },
  editButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontSize: 12,
    color: COLORS.faint,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.45)',
    backgroundColor: COLORS.brandSoft,
    marginTop: 4,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.brand,
  },
  versionText: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.faint,
  },

  /* ---------- Settings gear + dropdown ---------- */
  settingsButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
  },
  menu: {
    position: 'absolute',
    top: 110,
    right: 20,
    width: 250,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.brand,
    paddingHorizontal: 14,
    zIndex: 15,
    elevation: 15,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.faint,
  },
  menuIconEdit: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuIconLogout: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuIconLock: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuIconInfo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.info,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },

  /* ---------- Modals ---------- */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },
  pwModalCard: {
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.muted,
    marginBottom: 16,
  },
  modalImageWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalImage: {
    width: 140,
    height: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  modalInfoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 18,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },
  modalSaveButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.6,
  },

  /* ---------- Change password form ---------- */
  pwHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
    marginBottom: 8,
  },
  pwCard: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  pwDesc: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 6,
    lineHeight: 17,
  },
  pwLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.muted,
    marginTop: 10,
    marginBottom: 6,
  },
  pwInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  pwInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  pwRules: {
    marginTop: 10,
    gap: 4,
  },
  pwRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pwRuleText: {
    fontSize: 12,
    color: COLORS.faint,
  },
  pwError: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.brand,
  },
  pwSuccess: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.success,
  },
  pwHint: {
    marginTop: 10,
    fontSize: 11,
    color: COLORS.faint,
    textAlign: 'center',
  },

  /* ---------- Scroll + edit profile ---------- */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  sexRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sexChip: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexChipActive: {
    backgroundColor: COLORS.brand,
    borderColor: COLORS.brand,
  },
  sexChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.muted,
  },

  /* ---------- About ---------- */
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  aboutLabel: {
    fontSize: 13,
    color: COLORS.muted,
  },
  aboutValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  aboutHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
    marginBottom: 8,
  },
  aboutBody: {
    flex: 1,
    fontSize: 13,
    color: COLORS.muted,
    lineHeight: 19,
    marginBottom: 8,
  },
  aboutBold: {
    fontWeight: '700',
    color: COLORS.text,
  },
  aboutFeatureRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  aboutBullet: {
    fontSize: 13,
    color: COLORS.brand,
    lineHeight: 19,
  },
  aboutFooter: {
    marginTop: 16,
    marginBottom: 4,
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.faint,
  },
});