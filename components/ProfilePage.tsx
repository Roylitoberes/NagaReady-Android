// components/ProfilePage.tsx

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth } from '../services/firebase';
import { supabase } from '../services/supabase';

interface ProfilePageProps {
  userData?: any;
  onLogout?: () => void;
  onEditProfile?: () => void;
  onPhotoUpdated?: (url: string) => void;
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
};

export default function ProfilePage({
  userData,
  onLogout,
  onEditProfile,
  onPhotoUpdated,
}: ProfilePageProps) {

  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  const [pendingPhoto, setPendingPhoto] = useState<{
    uri: string;
    mimeType: string;
  } | null>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);

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
      value: userData?.email || 'Not specified',
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
        <View style={styles.content}>
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
              {userData?.email || 'user@example.com'}
            </Text>

            {!!onEditProfile && (
              <TouchableOpacity
                style={styles.editButton}
                onPress={onEditProfile}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={COLORS.text}
                />
                <Text style={styles.editButtonText}>Edit profile</Text>
              </TouchableOpacity>
            )}
          </View>

          {renderGroup('Contact', contactItems)}
          {renderGroup('Personal information', personalItems)}

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons
              name="log-out-outline"
              size={20}
              color={COLORS.brand}
            />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>

          <Text style={styles.versionText}>NagaReady v1.0.0</Text>
        </View>
      </View>

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
    paddingTop: 24,
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
});