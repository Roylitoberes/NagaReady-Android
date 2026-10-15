// services/incidentService.ts - Final version with specificType support
import { firestore } from './firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  onSnapshot,
  limit,
  getCountFromServer,
} from 'firebase/firestore';
import { supabase } from './supabase';
import { Platform, Alert, ActionSheetIOS } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { getAuth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface IncidentReportData {
  incidentId: string;
  timestamp: string;
  incidentType: string;
  specificType?: string | null;   // ✅ for "Other" incidents
  reporter: {
    fullName: string;
    phoneNumber: string;
  };
  location: any;
  description: string;
  casualties: {
    injured: number;
    fatalities: number;
    trapped: number;
  };
  status: 'submitted' | 'dispatched' | 'enroute' | 'arrived' | 'resolved';
  submittedAt: string;
  photoUrl: string | null;
  hasPhoto: boolean;
  userId: string;
  isAnonymous: boolean;
  createdAt?: any;
  updatedAt?: any;
  eta?: string;
  responder?: string;
}

export interface LocationData {
  address: string;
  streetAddress: string;
  barangay: string;
  city: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  latitude: number;
  longitude: number;
  mapsUrl: string;
}

export interface ImagePickerResult {
  uri: string | null;
  base64?: string | undefined;
}

// ============================================
// INCIDENT SERVICE
// ============================================

class IncidentService {
  private static instance: IncidentService;
  private unsubscribeTracking: (() => void) | null = null;
  private cachedUserId: string | null = null;
  
  private constructor() {}
  
  public static getInstance(): IncidentService {
    if (!IncidentService.instance) {
      IncidentService.instance = new IncidentService();
    }
    return IncidentService.instance;
  }

  // ------------------------------------------
  // Helper Methods
  // ------------------------------------------

  private async getCurrentUserIdFromCache(): Promise<string | null> {
    try {
      const cachedUserData = await AsyncStorage.getItem('userData');
      if (cachedUserData) {
        const parsedData = JSON.parse(cachedUserData);
        if (parsedData.uid) {
          return parsedData.uid;
        }
        if (parsedData.email) {
          const auth = getAuth();
          const user = auth.currentUser;
          if (user) {
            return user.uid;
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting cached user ID:', error);
      return null;
    }
  }

  private async getCurrentUserId(): Promise<string | null> {
    if (this.cachedUserId) {
      return this.cachedUserId;
    }

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (user) {
        this.cachedUserId = user.uid;
        return user.uid;
      }

      const userId = await this.getCurrentUserIdFromCache();
      if (userId) {
        this.cachedUserId = userId;
        return userId;
      }

      return null;
    } catch (error) {
      console.error('Error getting current user ID:', error);
      const userId = await this.getCurrentUserIdFromCache();
      if (userId) {
        this.cachedUserId = userId;
        return userId;
      }
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const userId = await this.getCurrentUserId();
    return userId !== null;
  }

  async getCurrentUser() {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
      return user;
    }
    
    const cachedUserData = await AsyncStorage.getItem('userData');
    if (cachedUserData) {
      try {
        return JSON.parse(cachedUserData);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // ------------------------------------------
  // Incident Types & Status
  // ------------------------------------------

  getIncidentTypes() {
    return [
      { id: 'fire', name: 'Fire', icon: 'flame-outline', color: '#FF6B35', bgColor: 'rgba(255, 107, 53, 0.15)', solidBg: '#FF6B35' },
      { id: 'medical', name: 'Medical', icon: 'medkit-outline', color: '#FF4444', bgColor: 'rgba(255, 68, 68, 0.15)', solidBg: '#FF4444' },
      { id: 'flood', name: 'Flood', icon: 'water-outline', color: '#2196F3', bgColor: 'rgba(33, 150, 243, 0.15)', solidBg: '#2196F3' },
      { id: 'crime', name: 'Crime', icon: 'shield-outline', color: '#9C27B0', bgColor: 'rgba(156, 39, 176, 0.15)', solidBg: '#9C27B0' },
      { id: 'accident', name: 'Accident', icon: 'car-outline', color: '#FF9800', bgColor: 'rgba(255, 152, 0, 0.15)', solidBg: '#FF9800' },
      { id: 'other', name: 'Other', icon: 'ellipsis-horizontal-circle-outline', color: '#607D8B', bgColor: 'rgba(96, 125, 139, 0.15)', solidBg: '#607D8B' },
    ];
  }

  getStatusInfo(status: string): { icon: string; color: string; label: string } {
    const statusMap: { [key: string]: { icon: string; color: string; label: string } } = {
      'submitted': { icon: 'send', color: '#FF8C00', label: 'Submitted' },
      'dispatched': { icon: 'send', color: '#FF8C00', label: 'Dispatched' },
      'enroute': { icon: 'directions-car', color: '#2196F3', label: 'En Route' },
      'arrived': { icon: 'flag', color: '#00C853', label: 'Arrived' },
      'resolved': { icon: 'checkmark-circle', color: '#4CAF50', label: 'Resolved' },
    };
    return statusMap[status] || { icon: 'help', color: '#94A3B8', label: status };
  }

  getNotificationTypeInfo(incidentType: string): { icon: string; color: string; type: string } {
    const typeMap: { [key: string]: { icon: string; color: string; type: string } } = {
      'Fire': { icon: 'flame', color: '#FF6B35', type: 'emergency' },
      'Medical': { icon: 'medkit', color: '#FF4444', type: 'emergency' },
      'Flood': { icon: 'water', color: '#2196F3', type: 'emergency' },
      'Crime': { icon: 'shield', color: '#9C27B0', type: 'emergency' },
      'Accident': { icon: 'car', color: '#FF9800', type: 'emergency' },
      'Other': { icon: 'alert-circle', color: '#607D8B', type: 'alert' },
    };
    return typeMap[incidentType] || { icon: 'alert-circle', color: '#607D8B', type: 'alert' };
  }

  getPriorityLevel(incidentType: string): string {
    const priorityMap: { [key: string]: string } = {
      'Medical': 'critical',
      'Fire': 'critical',
      'Crime': 'critical',
      'Accident': 'high',
      'Flood': 'high',
      'Other': 'normal',
    };
    return priorityMap[incidentType] || 'normal';
  }

  // ✅ createNotification — explicitly accepts & writes specificType
  async createNotification(reportId: string, reportData: any): Promise<void> {
    try {
      const specificType = reportData?.specificType || null;
      console.log('🔔 createNotification received specificType =', specificType);
      console.log('🔔 createNotification received incidentType =', reportData?.incidentType);

      const notificationRef = collection(firestore, 'notifications');
      await addDoc(notificationRef, {
        reportId: reportId,
        incidentType: reportData.incidentType,
        specificType: specificType,             // ✅ WRITTEN TO FIRESTORE
        reporter: reportData.reporter,
        location: reportData.location,
        description: reportData.description,
        casualties: reportData.casualties || { injured: 0, fatalities: 0, trapped: 0 },
        photoUrl: reportData.photoUrl || null,
        hasPhoto: reportData.hasPhoto || false,
        status: 'pending',
        timestamp: serverTimestamp(),
        read: false,
        createdAt: serverTimestamp(),
        type: 'incident_report',
        priority: this.getPriorityLevel(reportData.incidentType),
      });
      console.log('✅ Notification created for report:', reportId, 'with specificType:', specificType);
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  // ------------------------------------------
  // Validation
  // ------------------------------------------

  validateReportData(data: {
    incidentType: string;
    fullName: string;
    phoneNumber: string;
    location: string;
    description: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.incidentType) {
      errors.push('Please select an incident type');
    }
    if (!data.fullName || !data.fullName.trim()) {
      errors.push('Please enter your full name');
    }
    if (!data.phoneNumber || data.phoneNumber.length < 10) {
      errors.push('Please enter a valid mobile number (at least 10 digits)');
    }
    if (!data.location) {
      errors.push('Please provide your location');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ------------------------------------------
  // Image Upload
  // ------------------------------------------

  async uploadImageToSupabase(imageUri: string, userId: string): Promise<string> {
    try {
      console.log('📸 Starting image upload...');
      console.log('📸 Image URI:', imageUri);
      
      if (!imageUri) {
        throw new Error('No image URI provided');
      }

      let base64Data: string;
      
      if (Platform.OS === 'web') {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const reader = new FileReader();
        base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const reader = new FileReader();
        base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      if (!base64Data) {
        throw new Error('Failed to convert image to base64');
      }

      const timestamp = Date.now();
      const filename = `${userId}_${timestamp}.jpg`;
      const filePath = `incident_photos/${filename}`;
      
      console.log('📤 Uploading to Supabase...', { filePath });
      
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { data, error } = await supabase.storage
        .from('Incident')
        .upload(filePath, bytes.buffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('❌ Upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      console.log('✅ Upload successful!', data);

      const { data: urlData } = supabase.storage
        .from('Incident')
        .getPublicUrl(filePath);

      if (!urlData || !urlData.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      console.log('📸 Public URL:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error('❌ Error uploading to Supabase:', error);
      throw error;
    }
  }

  // ------------------------------------------
  // Firebase Save
  // ------------------------------------------

  async saveReportToFirebase(reportData: IncidentReportData): Promise<string> {
    try {
      const userId = await this.getCurrentUserId();
      
      if (!userId) {
        throw new Error('User not authenticated. Please sign in to submit a report.');
      }

      const reportsCollection = collection(firestore, 'incident_reports');
      const docRef = await addDoc(reportsCollection, {
        ...reportData,
        userId: userId,
        isAnonymous: false,
        status: 'submitted',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deviceInfo: Platform.select({
          ios: 'iOS',
          android: 'Android',
          default: 'Web'
        })
      });
      console.log('✅ Report saved to Firebase with ID:', docRef.id);
      return docRef.id;
    } catch (error: any) {
      console.error('❌ Error saving to Firebase:', error);
      
      if (error.code === 'permission-denied') {
        throw new Error('You do not have permission to submit a report. Please sign in.');
      } else if (error.code === 'unavailable') {
        throw new Error('Service is currently unavailable. Please check your internet connection.');
      }
      
      throw error;
    }
  }

  // ------------------------------------------
  // Submit Report - MAIN FUNCTION
  // ------------------------------------------

  async submitIncidentReport(
    incidentData: Omit<IncidentReportData, 'photoUrl' | 'hasPhoto' | 'userId' | 'isAnonymous' | 'status' | 'eta' | 'responder'>,
    imageUri: string | null
  ): Promise<{ firebaseId: string; photoUrl: string | null }> {
    let photoUrl: string | null = null;

    try {
      const userId = await this.getCurrentUserId();
      
      if (!userId) {
        console.error('❌ No userId found');
        throw new Error('Please sign in to submit a report.');
      }

      console.log('✅ User authenticated with ID:', userId);

      // ✅ Capture specificType BEFORE spreading
      const specificType = (incidentData as any).specificType || null;
      console.log('🔍 incoming incidentData.incidentType =', incidentData.incidentType);
      console.log('🔍 incoming incidentData.specificType =', specificType);

      // Try to upload image, but continue even if it fails
      if (imageUri) {
        try {
          photoUrl = await this.uploadImageToSupabase(imageUri, userId);
        } catch (uploadError) {
          console.warn('⚠️ Image upload failed, continuing without photo:', uploadError);
          photoUrl = null;
        }
      }

      const responderMap: { [key: string]: string } = {
        'Fire': 'Bureau of Fire Protection',
        'Medical': 'Emergency Medical Services',
        'Flood': 'Disaster Response Team',
        'Crime': 'Philippine National Police',
        'Accident': 'Emergency Medical Services',
        'Other': 'CDRRMO Response Team',
      };

      const reportData: IncidentReportData = {
        ...incidentData,
        specificType: specificType,   // ✅ explicitly set
        casualties: incidentData.casualties || {
          injured: 0,
          fatalities: 0,
          trapped: 0,
        },
        photoUrl: photoUrl,
        hasPhoto: !!photoUrl,
        userId: userId,
        isAnonymous: false,
        status: 'submitted',
        eta: '10-15 minutes',
        responder: responderMap[incidentData.incidentType] || 'CDRRMO Response Team',
      };

      console.log('📤 Submitting report. specificType =', reportData.specificType);

      const firebaseId = await this.saveReportToFirebase(reportData);
      
      // ✅ Pass specificType to notification
      await this.createNotification(firebaseId, {
        ...reportData,
        specificType: specificType,
      });
      
      return { firebaseId, photoUrl };
    } catch (error) {
      console.error('❌ Error submitting incident report:', error);
      throw error;
    }
  }

  // ------------------------------------------
  // Tracking Methods
  // ------------------------------------------

  listenForTrackingUpdates(
    onUpdate: (events: any[]) => void,
    onError: (error: Error) => void
  ): () => void {
    if (this.unsubscribeTracking) {
      this.unsubscribeTracking();
      this.unsubscribeTracking = null;
    }

    const reportsCollection = collection(firestore, 'incident_reports');
    const q = query(
      reportsCollection,
      limit(50)
    );

    this.unsubscribeTracking = onSnapshot(
      q,
      (snapshot) => {
        const events: any[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const statusInfo = this.getStatusInfo(data.status || 'submitted');
          
          events.push({
            id: doc.id,
            type: data.incidentType || 'Unknown',
            specificType: data.specificType || null,
            location: data.location?.address || 'Location not specified',
            status: data.status || 'submitted',
            timestamp: data.submittedAt ? new Date(data.submittedAt) : new Date(),
            eta: data.eta || '10-15 minutes',
            responder: data.responder || 'CDRRMO Response Team',
            description: data.description || '',
            photoUrl: data.photoUrl || null,
            hasPhoto: data.hasPhoto || false,
            userId: data.userId,
            reporter: data.reporter || {},
            casualties: data.casualties || { injured: 0, fatalities: 0, trapped: 0 },
            statusIcon: statusInfo.icon,
            statusColor: statusInfo.color,
            statusLabel: statusInfo.label,
          });
        });
        events.sort((a, b) => b.timestamp - a.timestamp);
        onUpdate(events);
      },
      (error) => {
        console.error('Error listening for tracking updates:', error);
        onError(error);
      }
    );

    return this.unsubscribeTracking;
  }

  async getUserReportsForTracking(): Promise<any[]> {
    try {
      const userId = await this.getCurrentUserId();
      
      if (!userId) {
        return [];
      }

      const reportsCollection = collection(firestore, 'incident_reports');
      const q = query(
        reportsCollection,
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      const reports: any[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const statusInfo = this.getStatusInfo(data.status || 'submitted');
        
        reports.push({
          id: doc.id,
          type: data.incidentType || 'Unknown',
          specificType: data.specificType || null,
          location: data.location?.address || 'Location not specified',
          status: data.status || 'submitted',
          timestamp: data.submittedAt ? new Date(data.submittedAt) : new Date(),
          eta: data.eta || '10-15 minutes',
          responder: data.responder || 'CDRRMO Response Team',
          description: data.description || '',
          photoUrl: data.photoUrl || null,
          hasPhoto: data.hasPhoto || false,
          reporter: data.reporter || {},
          casualties: data.casualties || { injured: 0, fatalities: 0, trapped: 0 },
          statusIcon: statusInfo.icon,
          statusColor: statusInfo.color,
          statusLabel: statusInfo.label,
        });
      });
      
      reports.sort((a, b) => b.timestamp - a.timestamp);
      
      return reports;
    } catch (error) {
      console.error('Error getting user reports for tracking:', error);
      return [];
    }
  }

  // ------------------------------------------
  // Location Methods
  // ------------------------------------------

  async getCurrentLocation(): Promise<LocationData | null> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Please enable location services to detect your location automatically.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enter Manually' }
          ]
        );
        return null;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      
      const { latitude, longitude } = currentLocation.coords;
      
      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude,
        longitude
      });
      
      let formattedAddress = '';
      let streetAddress = '';
      let barangay = '';
      let city = '';
      
      if (reverseGeocode.length > 0) {
        const addr = reverseGeocode[0];
        const street = addr.street || '';
        const streetNumber = addr.streetNumber || '';
        streetAddress = `${streetNumber} ${street}`.trim();
        
        barangay = addr.district || addr.subregion || '';
        city = addr.city || '';
        
        formattedAddress = [
          streetAddress,
          barangay,
          city
        ].filter(part => part && part.trim() !== '').join(', ');
        
        if (formattedAddress === '') {
          formattedAddress = addr.name || `${latitude}, ${longitude}`;
        }
      } else {
        formattedAddress = `${latitude}, ${longitude}`;
      }
      
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      
      return {
        address: formattedAddress,
        streetAddress,
        barangay,
        city,
        coordinates: { latitude, longitude },
        latitude,
        longitude,
        mapsUrl,
      };
    } catch (error) {
      console.error('Error getting location:', error);
      return null;
    }
  }

  // ------------------------------------------
  // Image Methods
  // ------------------------------------------

  async requestCameraPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return false;
    }
    
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera permissions to take photos.');
      return false;
    }
    return true;
  }

  async requestGalleryPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return false;
    }
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant gallery permissions to upload photos.');
      return false;
    }
    return true;
  }

  async takePhoto(): Promise<ImagePickerResult> {
    try {
      const hasPermission = await this.requestCameraPermissions();
      if (!hasPermission) {
        return { uri: null };
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        return {
          uri: asset.uri || null,
          base64: asset.base64 || undefined,
        };
      }
      
      return { uri: null };
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
      return { uri: null };
    }
  }

  async pickImageFromGallery(): Promise<ImagePickerResult> {
    try {
      const hasPermission = await this.requestGalleryPermissions();
      if (!hasPermission) {
        return { uri: null };
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        return {
          uri: asset.uri || null,
          base64: asset.base64 || undefined,
        };
      }
      
      return { uri: null };
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
      return { uri: null };
    }
  }

  showImagePickerOptions(
    onTakePhoto: () => void,
    onPickFromGallery: () => void
  ): void {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Gallery'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            onTakePhoto();
          } else if (buttonIndex === 2) {
            onPickFromGallery();
          }
        }
      );
    }
  }

  // ============================================
  // GUEST MODE METHODS
  // ============================================

  async getGuestId(): Promise<string> {
    try {
      let guestId = await AsyncStorage.getItem('guestId');
      if (!guestId) {
        guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        await AsyncStorage.setItem('guestId', guestId);
      }
      return guestId;
    } catch (error) {
      console.error('Error getting/creating guest ID:', error);
      return `guest_${Date.now()}`;
    }
  }

  async saveGuestReportToFirebase(reportData: any): Promise<string> {
    try {
      const guestId = await this.getGuestId();

      const reportsCollection = collection(firestore, 'incident_reports');
      const docRef = await addDoc(reportsCollection, {
        ...reportData,
        userId: guestId,
        isGuest: true,
        isAnonymous: false,
        status: 'submitted',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deviceInfo: Platform.select({
          ios: 'iOS',
          android: 'Android',
          default: 'Web',
        }),
      });

      console.log('✅ Guest report saved to Firebase with ID:', docRef.id);
      return docRef.id;
    } catch (error: any) {
      console.error('❌ Error saving guest report to Firebase:', error);

      if (error.code === 'permission-denied') {
        throw new Error('Unable to submit guest report. Please check your connection or sign in.');
      } else if (error.code === 'unavailable') {
        throw new Error('Service is currently unavailable. Please check your internet connection.');
      }

      throw error;
    }
  }

  async submitGuestIncidentReport(
    incidentData: any,
    imageUri: string | null
  ): Promise<{ firebaseId: string; photoUrl: string | null }> {
    let photoUrl: string | null = null;

    try {
      const guestId = await this.getGuestId();
      console.log('✅ Guest submission with ID:', guestId);

      // ✅ Capture specificType BEFORE spreading
      const specificType = incidentData.specificType || null;
      console.log('🔍 guest incidentData.specificType =', specificType);

      if (imageUri) {
        try {
          photoUrl = await this.uploadImageToSupabase(imageUri, guestId);
        } catch (uploadError) {
          console.warn('⚠️ Guest image upload failed, continuing without photo:', uploadError);
          photoUrl = null;
        }
      }

      const responderMap: { [key: string]: string } = {
        'Fire': 'Bureau of Fire Protection',
        'Medical': 'Emergency Medical Services',
        'Flood': 'Disaster Response Team',
        'Crime': 'Philippine National Police',
        'Accident': 'Emergency Medical Services',
        'Other': 'CDRRMO Response Team',
      };

      const reportData = {
        ...incidentData,
        specificType: specificType,   // ✅ explicitly set
        casualties: incidentData.casualties || {
          injured: 0,
          fatalities: 0,
          trapped: 0,
        },
        photoUrl: photoUrl,
        hasPhoto: !!photoUrl,
        userId: guestId,
        isGuest: true,
        isAnonymous: false,
        status: 'submitted',
        eta: '10-15 minutes',
        responder: responderMap[incidentData.incidentType] || 'CDRRMO Response Team',
      };

      const firebaseId = await this.saveGuestReportToFirebase(reportData);

      await this.createNotification(firebaseId, {
        ...reportData,
        specificType: specificType,
      });

      return { firebaseId, photoUrl };
    } catch (error) {
      console.error('❌ Error submitting guest incident report:', error);
      throw error;
    }
  }

  async getGuestReports(): Promise<any[]> {
    try {
      const guestId = await this.getGuestId();

      const reportsCollection = collection(firestore, 'incident_reports');
      const q = query(
        reportsCollection,
        where('userId', '==', guestId)
      );

      const querySnapshot = await getDocs(q);
      const reports: any[] = [];

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const statusInfo = this.getStatusInfo(data.status || 'submitted');

        reports.push({
          id: docSnap.id,
          type: data.incidentType || 'Unknown',
          specificType: data.specificType || null,
          location: data.location?.address || 'Location not specified',
          status: data.status || 'submitted',
          timestamp: data.submittedAt ? new Date(data.submittedAt) : new Date(),
          eta: data.eta || '10-15 minutes',
          responder: data.responder || 'CDRRMO Response Team',
          description: data.description || '',
          photoUrl: data.photoUrl || null,
          hasPhoto: data.hasPhoto || false,
          reporter: data.reporter || {},
          casualties: data.casualties || { injured: 0, fatalities: 0, trapped: 0 },
          statusIcon: statusInfo.icon,
          statusColor: statusInfo.color,
          statusLabel: statusInfo.label,
          isGuest: true,
        });
      });

      reports.sort((a, b) => b.timestamp - a.timestamp);
      return reports;
    } catch (error) {
      console.error('Error getting guest reports:', error);
      return [];
    }
  }

  async clearGuestData(): Promise<void> {
    try {
      await AsyncStorage.removeItem('guestId');
      console.log('✅ Guest data cleared');
    } catch (error) {
      console.error('Error clearing guest data:', error);
    }
  }
}

export const incidentService = IncidentService.getInstance();