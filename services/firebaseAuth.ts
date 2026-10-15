// services/firebaseAuth.ts
import { auth, firestore } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  UserCredential 
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserData {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  dateOfBirth: string;
  sex: string;
  barangay: string;
  street: string;
  idType: string;
  idImage: string | null;
  emergencyContact: {
    name: string;
    number: string;
  };
  emailVerified: boolean;
  registeredAt: string;
  lastLogin?: string;
}

export const registerUser = async (
  email: string, 
  password: string, 
  userData: Omit<UserData, 'uid' | 'emailVerified' | 'registeredAt'>
): Promise<UserCredential> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await sendEmailVerification(user);

    const firestoreUserData: UserData = {
      uid: user.uid,
      ...userData,
      emailVerified: false,
      registeredAt: new Date().toISOString(),
    };

    await setDoc(doc(firestore, 'users', user.uid), firestoreUserData);
    return userCredential;
  } catch (error: any) {
    console.error('Registration error:', error);
    throw new Error(error.message);
  }
};

export const loginUser = async (email: string, password: string): Promise<UserData> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user.emailVerified) {
      throw new Error('email-not-verified');
    }

    const userDoc = await getDoc(doc(firestore, 'users', user.uid));
    
    if (!userDoc.exists()) {
      throw new Error('User data not found');
    }

    const userData = userDoc.data() as UserData;

    await updateDoc(doc(firestore, 'users', user.uid), {
      lastLogin: new Date().toISOString(),
    });

    // Save session data to AsyncStorage
    await AsyncStorage.setItem('userData', JSON.stringify(userData));
    await AsyncStorage.setItem('sessionActive', 'true');
    await AsyncStorage.removeItem('isGuest');

    console.log('✅ User session saved to AsyncStorage');

    return userData;
  } catch (error: any) {
    console.error('Login error:', error);
    throw new Error(error.message);
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
    
    // Clear all session data from AsyncStorage
    await AsyncStorage.removeItem('userData');
    await AsyncStorage.removeItem('sessionActive');
    await AsyncStorage.removeItem('isGuest');
    
    console.log('✅ User session cleared from AsyncStorage');
  } catch (error: any) {
    console.error('Logout error:', error);
    throw new Error(error.message);
  }
};

// Forgot Password - Send reset email
export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Reset password error:', error);
    throw new Error(error.message);
  }
};

export const resendVerificationEmail = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (user && !user.emailVerified) {
      await sendEmailVerification(user);
    } else {
      throw new Error('No user found or email already verified');
    }
  } catch (error: any) {
    console.error('Resend error:', error);
    throw new Error(error.message);
  }
};

export const checkEmailExists = async (email: string): Promise<boolean> => {
  try {
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking email:', error);
    return false;
  }
};

export const checkMobileExists = async (mobileNumber: string): Promise<boolean> => {
  try {
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('mobileNumber', '==', mobileNumber));
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking mobile:', error);
    return false;
  }
};

export const refreshUserData = async (uid: string): Promise<UserData | null> => {
  try {
    const userDoc = await getDoc(doc(firestore, 'users', uid));
    if (userDoc.exists()) {
      const data = userDoc.data() as UserData;
      
      // Update cached data
      await AsyncStorage.setItem('userData', JSON.stringify(data));
      await AsyncStorage.setItem('sessionActive', 'true');
      
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error refreshing user data:', error);
    return null;
  }
};