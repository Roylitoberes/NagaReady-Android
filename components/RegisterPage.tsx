// components/RegisterPage.tsx (Formal layout - logic unchanged)
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, firestore } from '../services/firebase';
import { 
  createUserWithEmailAndPassword, 
  sendEmailVerification
} from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';

interface RegisterPageProps {
  onBack: () => void;
  onRegisterSuccess: (userData: any) => void;
}

export default function RegisterPage({ onBack, onRegisterSuccess }: RegisterPageProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Step 1 - Personal Info
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sex, setSex] = useState('');
  const [showSexDropdown, setShowSexDropdown] = useState(false);
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  
  // Date picker state
  const [selectedMonth, setSelectedMonth] = useState('January');
  const [selectedDay, setSelectedDay] = useState('01');
  const [selectedYear, setSelectedYear] = useState('2000');
  
  // Step 2 - Contact & Address
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [barangay, setBarangay] = useState('');
  const [street, setStreet] = useState('');
  const [showBarangayDropdown, setShowBarangayDropdown] = useState(false);
  
  // Step 3 - Account Setup
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Password validation states
  const [passwordErrors, setPasswordErrors] = useState({
    minLength: false,
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
  });
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  
  // Verification States
  const [isVerifying, setIsVerifying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [verificationCompleted, setVerificationCompleted] = useState(false);

  const sexOptions = ['Male', 'Female'];
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const getMonthNumber = (monthName: string) => {
    const monthIndex = monthNames.indexOf(monthName) + 1;
    return monthIndex < 10 ? `0${monthIndex}` : `${monthIndex}`;
  };
  
  const days = Array.from({ length: 31 }, (_, i) => {
    const num = i + 1;
    return num < 10 ? `0${num}` : `${num}`;
  });
  
  const years = Array.from({ length: 100 }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return `${year}`;
  });
  
  const barangayOptions = [
    'Alfaco (also written as Alpaco)',
    'Bairan',
    'Balirong',
    'Cabungahan',
    'Cantao-an',
    'Central Poblacion',
    'Cogon',
    'Colon',
    'East Poblacion',
    'Inayagan',
    'Inoburan',
    'Jaguimit',
    'Lanas',
    'Langtad',
    'Lutac',
    'Mainit',
    'Mayana',
    'Naalad',
    'North Poblacion',
    'Pangdan',
    'Patag',
    'South Poblacion',
    'Tagjaguimit',
    'Tangke',
    'Tinaan',
    'Tuyan',
    'Uling',
    'West Poblacion',
  ];

  // Password validation function
  const validatePassword = (text: string) => {
    setPassword(text);
    setPasswordTouched(true);
    setPasswordErrors({
      minLength: text.length >= 8,
      uppercase: /[A-Z]/.test(text),
      lowercase: /[a-z]/.test(text),
      number: /[0-9]/.test(text),
      specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(text),
    });
    
    if (confirmPassword) {
      if (text !== confirmPassword) {
        setConfirmPasswordError('Passwords do not match');
      } else {
        setConfirmPasswordError('');
      }
    }
  };

  // Confirm password validation
  const validateConfirmPassword = (text: string) => {
    setConfirmPassword(text);
    if (password !== text) {
      setConfirmPasswordError('Passwords do not match');
    } else {
      setConfirmPasswordError('');
    }
  };

  // Check if password is valid
  const isPasswordValid = () => {
    return passwordErrors.minLength && 
           passwordErrors.uppercase && 
           passwordErrors.lowercase && 
           passwordErrors.number && 
           passwordErrors.specialChar;
  };

  // Check if form is valid for Step 3 (Emergency contact checks removed)
  const isStep3Valid = () => {
    return isPasswordValid() && 
           confirmPasswordError === '' && 
           password !== '';
  };

  // Check email verification status periodically
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (verificationSent && auth.currentUser && !checkingVerification && !verificationCompleted) {
      setCheckingVerification(true);
      interval = setInterval(async () => {
        try {
          await auth.currentUser?.reload();
          if (auth.currentUser?.emailVerified) {
            clearInterval(interval);
            const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
            const userData = userDoc.data();
            
            Alert.alert('Success', 'Email verified successfully!');
            setVerificationCompleted(true);
            onRegisterSuccess(userData);
          }
        } catch (error) {
          console.error('Error checking verification:', error);
        }
      }, 3000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
      setCheckingVerification(false);
    };
  }, [verificationSent, verificationCompleted]);

  // Timer for resend
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      setCanResend(true);
    }
  }, [timeLeft]);

  const checkEmailExists = async (email: string): Promise<boolean> => {
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

  const checkMobileExists = async (mobileNumber: string): Promise<boolean> => {
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

  const validateStep1 = () => {
    if (!firstName) {
      Alert.alert('Missing Information', 'Please enter your first name');
      return false;
    }
    if (!lastName) {
      Alert.alert('Missing Information', 'Please enter your last name');
      return false;
    }
    if (!dateOfBirth) {
      Alert.alert('Missing Information', 'Please select your date of birth');
      return false;
    }
    if (!sex) {
      Alert.alert('Missing Information', 'Please select your sex');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!mobileNumber || mobileNumber.length !== 10 || !mobileNumber.startsWith('9')) {
      Alert.alert('Invalid Mobile Number', 'Please enter a valid 10-digit mobile number starting with 9.');
      return false;
    }
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return false;
    }
    if (!barangay) {
      Alert.alert('Missing Information', 'Please select your barangay');
      return false;
    }
    if (!street) {
      Alert.alert('Missing Information', 'Please enter your street address');
      return false;
    }
    return true;
  };

  const handleRegister = async () => {
    if (!isStep3Valid()) {
      if (!isPasswordValid()) {
        Alert.alert('Weak Password', 'Please meet all password requirements');
      } else if (confirmPasswordError) {
        Alert.alert('Password Mismatch', 'Passwords do not match');
      }
      return;
    }
    
    setIsLoading(true);
    
    try {
      const emailExists = await checkEmailExists(email);
      if (emailExists) {
        Alert.alert('Error', 'This email is already registered. Please use a different email or login.');
        setIsLoading(false);
        return;
      }

      const mobileExists = await checkMobileExists(mobileNumber);
      if (mobileExists) {
        Alert.alert('Error', 'This mobile number is already registered. Please use a different number or login.');
        setIsLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // ✅ Emergency contact removed from userData
      const userData = {
        uid: user.uid,
        firstName,
        lastName,
        dateOfBirth,
        sex,
        mobileNumber,
        email,
        barangay,
        street,
        emailVerified: false,
        registeredAt: new Date().toISOString(),
      };

      await setDoc(doc(firestore, 'users', user.uid), userData);
      await sendEmailVerification(user);
      setVerificationSent(true);
      
      Alert.alert(
        'Verification Email Sent!',
        `Please check your email ${email} and click the verification link to complete your registration.\n\nOnce verified, you will be automatically redirected to the welcome screen.\n\nCheck your spam folder if you don't see it.`
      );
      
      setCurrentStep(4);
      
    } catch (error: any) {
      console.error('Registration error:', error);
      let errorMessage = 'Failed to create account. Please try again.';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please login instead.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address. Please enter a valid email.';
      }
      
      Alert.alert('Registration Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (canResend && auth.currentUser) {
      setIsVerifying(true);
      try {
        await sendEmailVerification(auth.currentUser);
        Alert.alert('Email Sent', `New verification email sent to ${email}`);
        setTimeLeft(60);
        setCanResend(false);
      } catch (error: any) {
        Alert.alert('Error', 'Failed to resend verification email.');
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1 && currentStep !== 4) {
      setCurrentStep(currentStep - 1);
    } else if (currentStep === 4) {
      setCurrentStep(3);
    }
  };

  const handleDateConfirm = () => {
    const monthNumber = getMonthNumber(selectedMonth);
    const formattedDate = `${monthNumber}/${selectedDay}/${selectedYear}`;
    setDateOfBirth(formattedDate);
    setShowDatePickerModal(false);
  };

  const renderStepIndicator = () => {
    const steps = [
      { number: 1, label: 'Personal', completed: currentStep > 1 },
      { number: 2, label: 'Contact', completed: currentStep > 2 },
      { number: 3, label: 'Account', completed: currentStep > 3 },
      { number: 4, label: 'Verify', completed: currentStep > 4 },
    ];

    return (
      <View style={styles.stepIndicatorContainer}>
        <View style={styles.stepRow}>
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <View style={styles.stepItem}>
                <View style={[
                  styles.stepCircle,
                  step.completed && styles.stepCompleted,
                  currentStep === step.number && styles.stepActive
                ]}>
                  {step.completed ? (
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  ) : (
                    <Text style={[
                      styles.stepNumber,
                      currentStep === step.number && styles.stepNumberActive
                    ]}>{step.number}</Text>
                  )}
                </View>
                <Text style={[
                  styles.stepLabel,
                  (step.completed || currentStep === step.number) && styles.stepLabelActive
                ]}>{step.label}</Text>
              </View>
              {index < steps.length - 1 && (
                <View style={[
                  styles.stepLine,
                  step.completed && styles.stepLineActive
                ]} />
              )}
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  };

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.sectionCard}>
        <Text style={styles.stepTitle}>Personal Information</Text>
        
        <View style={styles.inputWrapper}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="person-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>First Name</Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Juan"
              placeholderTextColor="#9CA3AF"
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>
        </View>

        <View style={styles.inputWrapper}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="person-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Last Name</Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Dela Cruz"
              placeholderTextColor="#9CA3AF"
              value={lastName}
              onChangeText={setLastName}
            />
          </View>
        </View>

        <View style={styles.inputWrapper}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="calendar-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Date of Birth</Text>
          </View>
          <TouchableOpacity 
            style={styles.inputContainer}
            onPress={() => setShowDatePickerModal(true)}
          >
            <Text style={[styles.input, { color: dateOfBirth ? '#111827' : '#9CA3AF' }]}>
              {dateOfBirth || 'MM/DD/YYYY'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={[styles.inputWrapper, styles.lastInputWrapper]}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="male-female-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Sex</Text>
          </View>
          <TouchableOpacity 
            style={styles.inputContainer}
            onPress={() => setShowSexDropdown(true)}
          >
            <Text style={[styles.input, { color: sex ? '#111827' : '#9CA3AF' }]}>
              {sex || 'Select Sex'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.sectionCard}>
        <Text style={styles.stepTitle}>Contact Information</Text>
        
        <View style={styles.inputWrapper}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="call-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Mobile Number</Text>
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.countryCode}>+63</Text>
            <View style={styles.countryDivider} />
            <TextInput
              style={[styles.input, styles.mobileInput]}
              placeholder="9123456789"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              value={mobileNumber}
              onChangeText={setMobileNumber}
              maxLength={10}
            />
          </View>
          <Text style={styles.inputHint}>Must start with 9 (e.g., 9123456789)</Text>
        </View>

        <View style={[styles.inputWrapper, styles.lastInputWrapper]}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="mail-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Email Address</Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="juan.delacruz@gmail.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
            />
          </View>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.stepTitle}>Address</Text>
        
        <View style={styles.inputWrapper}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="location-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Barangay</Text>
          </View>
          <TouchableOpacity 
            style={styles.inputContainer}
            onPress={() => setShowBarangayDropdown(true)}
          >
            <Text style={[styles.input, { color: barangay ? '#111827' : '#9CA3AF' }]} numberOfLines={1}>
              {barangay || 'Select Barangay'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <View style={[styles.inputWrapper, styles.lastInputWrapper]}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="home-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Street / Purok</Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Street name, Purok, Subdivision"
              placeholderTextColor="#9CA3AF"
              value={street}
              onChangeText={setStreet}
            />
          </View>
        </View>
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View style={styles.sectionCard}>
        <Text style={styles.stepTitle}>Security</Text>
        
        <View style={styles.inputWrapper}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="lock-closed-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Password</Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Create a strong password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={validatePassword}
              onBlur={() => setPasswordTouched(true)}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          {passwordTouched && (
            <View style={styles.validationContainer}>
              <Text style={[styles.validationText, passwordErrors.minLength ? styles.validText : styles.invalidText]}>
                {passwordErrors.minLength ? '✓' : '○'} At least 8 characters
              </Text>
              <Text style={[styles.validationText, passwordErrors.uppercase ? styles.validText : styles.invalidText]}>
                {passwordErrors.uppercase ? '✓' : '○'} At least 1 uppercase letter
              </Text>
              <Text style={[styles.validationText, passwordErrors.lowercase ? styles.validText : styles.invalidText]}>
                {passwordErrors.lowercase ? '✓' : '○'} At least 1 lowercase letter
              </Text>
              <Text style={[styles.validationText, passwordErrors.number ? styles.validText : styles.invalidText]}>
                {passwordErrors.number ? '✓' : '○'} At least 1 number
              </Text>
              <Text style={[styles.validationText, passwordErrors.specialChar ? styles.validText : styles.invalidText]}>
                {passwordErrors.specialChar ? '✓' : '○'} At least 1 special character (!@#$%^&*)
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.inputWrapper, styles.lastInputWrapper]}>
          <View style={styles.inputLabelContainer}>
            <Ionicons name="lock-closed-outline" size={15} color="#DC2626" />
            <Text style={styles.inputLabel}>Confirm Password</Text>
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Confirm your password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={validateConfirmPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              <Ionicons name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
          {confirmPasswordError !== '' && (
            <Text style={styles.errorText}>{confirmPasswordError}</Text>
          )}
        </View>
      </View>

      {/* ✅ EMERGENCY CONTACT SECTION REMOVED */}

      <View style={styles.trustSection}>
        <View style={styles.trustCard}>
          <View style={styles.trustIconContainer}>
            <Ionicons name="shield-checkmark" size={20} color="#DC2626" />
          </View>
          <View style={styles.trustContent}>
            <Text style={styles.trustTitle}>Verified User</Text>
            <Text style={styles.trustText}>We verify your identity to keep our community safe.</Text>
          </View>
        </View>
        
        <View style={styles.trustCard}>
          <View style={styles.trustIconContainer}>
            <Ionicons name="lock-closed" size={20} color="#DC2626" />
          </View>
          <View style={styles.trustContent}>
            <Text style={styles.trustTitle}>Secure Registration</Text>
            <Text style={styles.trustText}>Your data is encrypted and always protected.</Text>
          </View>
        </View>
        
        <View style={styles.trustCard}>
          <View style={styles.trustIconContainer}>
            <Ionicons name="flash" size={20} color="#DC2626" />
          </View>
          <View style={styles.trustContent}>
            <Text style={styles.trustTitle}>Faster Emergency Response</Text>
            <Text style={styles.trustText}>Together, we can respond faster and save lives.</Text>
          </View>
        </View>
      </View>

      <View style={styles.footerLogoContainer}>
        <Ionicons name="shield" size={18} color="#DC2626" />
        <Text style={styles.footerLogoText}>NAGAREADY</Text>
        <Text style={styles.footerTagline}>BE PREPARED. STAY SAFE.</Text>
      </View>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      <View style={styles.verificationCard}>
        <View style={styles.illustrationContainer}>
          <View style={styles.emailIconCircle}>
            <Ionicons name="mail" size={40} color="#DC2626" />
          </View>
        </View>
        
        <Text style={styles.verifyTitle}>Verify Your Email Address</Text>
        <Text style={styles.verifyDescription}>
          We sent a verification link to
        </Text>
        <Text style={styles.verifyEmail}>{email}</Text>
        
        <View style={styles.verificationInfoContainer}>
          <Ionicons name="information-circle-outline" size={20} color="#DC2626" />
          <Text style={styles.verificationInfoText}>
            Please check your email and click the verification link to complete your registration.
          </Text>
        </View>
        
        <View style={styles.verificationInfoContainer}>
          <Ionicons name="sync-outline" size={20} color="#DC2626" />
          <Text style={styles.verificationInfoText}>
            Once verified, you will be automatically redirected to the welcome screen.
          </Text>
        </View>
        
        <View style={styles.resendContainer}>
          {canResend ? (
            <TouchableOpacity onPress={resendVerificationEmail} disabled={isVerifying}>
              {isVerifying ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <Text style={styles.resendText}>
                  Didn't receive the email? <Text style={styles.resendLink}>Resend</Text>
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <Text style={styles.resendText}>
              Resend available in <Text style={styles.timerText}>{timeLeft} seconds</Text>
            </Text>
          )}
        </View>

        <View style={styles.checkSpamContainer}>
          <Ionicons name="alert-circle-outline" size={16} color="#6B7280" />
          <Text style={styles.checkSpamText}>
            Check your spam folder if you don't see the email
          </Text>
        </View>
      </View>
    </View>
  );

  const renderSexDropdown = () => (
    <Modal transparent visible={showSexDropdown} animationType="fade" onRequestClose={() => setShowSexDropdown(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSexDropdown(false)}>
        <View style={styles.dropdownModal}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>Select Sex</Text>
            <TouchableOpacity onPress={() => setShowSexDropdown(false)}><Ionicons name="close" size={22} color="#FFFFFF" /></TouchableOpacity>
          </View>
          {sexOptions.map((option) => (
            <TouchableOpacity key={option} style={styles.dropdownOption} onPress={() => { setSex(option); setShowSexDropdown(false); }}>
              <Text style={[styles.dropdownOptionText, sex === option && styles.dropdownOptionTextActive]}>{option}</Text>
              {sex === option && <Ionicons name="checkmark-circle" size={20} color="#DC2626" />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderDatePickerModal = () => (
    <Modal transparent visible={showDatePickerModal} animationType="slide" onRequestClose={() => setShowDatePickerModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.datePickerModal}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>Select Date of Birth</Text>
            <TouchableOpacity onPress={() => setShowDatePickerModal(false)}><Ionicons name="close" size={22} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <View style={styles.datePickerRow}>
            <View style={styles.datePickerColumn}>
              <Text style={styles.datePickerLabel}>Month</Text>
              <ScrollView style={styles.datePickerScroll}>
                {monthNames.map((month) => (
                  <TouchableOpacity key={month} style={[styles.datePickerItem, selectedMonth === month && styles.datePickerItemSelected]} onPress={() => setSelectedMonth(month)}>
                    <Text style={[styles.datePickerItemText, selectedMonth === month && styles.datePickerItemTextSelected]}>{month}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.datePickerColumn}>
              <Text style={styles.datePickerLabel}>Day</Text>
              <ScrollView style={styles.datePickerScroll}>
                {days.map((day) => (
                  <TouchableOpacity key={day} style={[styles.datePickerItem, selectedDay === day && styles.datePickerItemSelected]} onPress={() => setSelectedDay(day)}>
                    <Text style={[styles.datePickerItemText, selectedDay === day && styles.datePickerItemTextSelected]}>{day}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <View style={styles.datePickerColumn}>
              <Text style={styles.datePickerLabel}>Year</Text>
              <ScrollView style={styles.datePickerScroll}>
                {years.map((year) => (
                  <TouchableOpacity key={year} style={[styles.datePickerItem, selectedYear === year && styles.datePickerItemSelected]} onPress={() => setSelectedYear(year)}>
                    <Text style={[styles.datePickerItemText, selectedYear === year && styles.datePickerItemTextSelected]}>{year}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
          <TouchableOpacity style={styles.dateConfirmButton} onPress={handleDateConfirm}><Text style={styles.dateConfirmButtonText}>Confirm Date</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderBarangayDropdown = () => (
    <Modal transparent visible={showBarangayDropdown} animationType="fade" onRequestClose={() => setShowBarangayDropdown(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowBarangayDropdown(false)}>
        <View style={styles.dropdownModalLarge}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>Select Barangay</Text>
            <TouchableOpacity onPress={() => setShowBarangayDropdown(false)}><Ionicons name="close" size={22} color="#FFFFFF" /></TouchableOpacity>
          </View>
          <ScrollView>
            {barangayOptions.map((option) => (
              <TouchableOpacity key={option} style={styles.dropdownOption} onPress={() => { setBarangay(option); setShowBarangayDropdown(false); }}>
                <Text style={[styles.dropdownOptionText, barangay === option && styles.dropdownOptionTextActive]}>{option}</Text>
                {barangay === option && <Ionicons name="checkmark-circle" size={20} color="#DC2626" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#DC2626" />
      <View style={styles.headerGradient}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Image 
            source={require('../assets/adaptive-icon2.png')} 
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>NagaReady</Text>
            <Text style={styles.welcomeText}>Create Account</Text>
          </View>
        </View>
        <View style={styles.headerDivider} />
        <Text style={styles.subtitleText}>Step {currentStep} of 4 — {currentStep === 1 ? 'Personal Information' : currentStep === 2 ? 'Contact & Address' : currentStep === 3 ? 'Account Setup' : 'Verify Email'}</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {renderStepIndicator()}
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.fixedButtonContainer}>
        <View style={styles.buttonContainer}>
          {currentStep > 1 && currentStep !== 4 && (
            <TouchableOpacity style={styles.backButtonOutline} onPress={handleBack}>
              <Text style={styles.backButtonText}>BACK</Text>
            </TouchableOpacity>
          )}
          {currentStep < 3 ? (
            <TouchableOpacity style={[styles.nextButton, styles.fullWidth]} onPress={handleNext}>
              <Text style={styles.nextButtonText}>NEXT →</Text>
            </TouchableOpacity>
          ) : currentStep === 3 ? (
            <TouchableOpacity 
              style={[styles.registerButton, (!isStep3Valid() || isLoading) && styles.registerButtonDisabled]} 
              onPress={handleRegister} 
              disabled={!isStep3Valid() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.registerButtonText} numberOfLines={1}>CREATE ACCOUNT</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.nextButton, styles.fullWidth]} onPress={() => {}}>
              <Text style={styles.nextButtonText}>WAITING FOR VERIFICATION...</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {renderSexDropdown()}
      {renderDatePickerModal()}
      {renderBarangayDropdown()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  keyboardView: { flex: 1 },

  // ---------- Header (flat, pure red) ----------
  headerGradient: { backgroundColor: '#DC2626', paddingTop: Platform.OS === 'ios' ? 50 : 38, paddingBottom: 14, paddingHorizontal: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'flex-start' },
  headerLogo: { width: 72, height: 72, marginLeft: 4 },
  headerTextBlock: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 12, fontWeight: '600', color: '#FFFFFF', opacity: 0.85, letterSpacing: 1.2, marginBottom: 2 },
  welcomeText: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  headerDivider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.3)', marginTop: 12, marginBottom: 10 },
  subtitleText: { fontSize: 13, fontWeight: '500', color: '#FFFFFF', letterSpacing: 0.2 },

  // ---------- Layout ----------
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

  // ---------- Step indicator ----------
  stepIndicatorContainer: { marginTop: 22, marginBottom: 20 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  stepItem: { alignItems: 'center', width: 62 },
  stepCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#D1D5DB' },
  stepActive: { borderColor: '#DC2626', backgroundColor: '#FFFFFF' },
  stepCompleted: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  stepNumber: { fontSize: 14, fontWeight: '700', color: '#9CA3AF' },
  stepNumberActive: { color: '#DC2626' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#D1D5DB', marginTop: 17, maxWidth: 40 },
  stepLineActive: { backgroundColor: '#DC2626' },
  stepLabel: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
  stepLabelActive: { color: '#111827', fontWeight: '600' },
  stepContent: { marginBottom: 24 },

  // ---------- Cards ----------
  sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  stepTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },

  // ---------- Inputs ----------
  inputWrapper: { marginBottom: 18 },
  lastInputWrapper: { marginBottom: 0 },
  inputLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: '#D1D5DB' },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  countryCode: { fontSize: 15, fontWeight: '600', color: '#111827' },
  countryDivider: { width: 1, height: 22, backgroundColor: '#D1D5DB', marginHorizontal: 12 },
  mobileInput: { flex: 1 },
  inputHint: { fontSize: 11, color: '#6B7280', marginTop: 6 },

  // ---------- Bottom buttons ----------
  fixedButtonContainer: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingTop: 25, paddingBottom: Platform.OS === 'ios' ? 65 : 60, minHeight: 120, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  buttonContainer: { flexDirection: 'row', gap: 12 },
  backButtonOutline: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 15, alignItems: 'center', borderWidth: 1.5, borderColor: '#DC2626' },
  backButtonText: { fontSize: 15, fontWeight: '700', color: '#DC2626', letterSpacing: 0.5 },
  nextButton: { flex: 1, backgroundColor: '#DC2626', borderRadius: 8, paddingVertical: 15, alignItems: 'center' },
  fullWidth: { flex: 1 },
  nextButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  registerButton: { flex: 1, backgroundColor: '#DC2626', borderRadius: 8, paddingVertical: 15, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  registerButtonDisabled: { opacity: 0.45 },
  registerButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5, textAlign: 'center' },

  // ---------- Verification ----------
  verificationCard: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 26, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  illustrationContainer: { alignItems: 'center', marginBottom: 20 },
  emailIconCircle: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  verifyTitle: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
  verifyDescription: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 4 },
  verifyEmail: { fontSize: 15, fontWeight: '700', color: '#DC2626', textAlign: 'center', marginBottom: 20 },
  verificationInfoContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF2F2', padding: 14, borderRadius: 8, marginBottom: 12, alignSelf: 'stretch' },
  verificationInfoText: { fontSize: 12, color: '#374151', flex: 1, lineHeight: 18 },
  resendContainer: { alignItems: 'center', marginTop: 8, marginBottom: 12 },
  resendText: { fontSize: 13, color: '#6B7280' },
  resendLink: { color: '#DC2626', fontWeight: '700' },
  timerText: { color: '#DC2626', fontWeight: '700' },
  checkSpamContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  checkSpamText: { fontSize: 11, color: '#6B7280' },

  // ---------- Trust cards ----------
  trustSection: { marginTop: 8, gap: 12 },
  trustCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 14 },
  trustIconContainer: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  trustContent: { flex: 1 },
  trustTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 },
  trustText: { fontSize: 12, color: '#6B7280', lineHeight: 17 },
  footerLogoContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, marginBottom: 12, flexWrap: 'wrap' },
  footerLogoText: { fontSize: 11, fontWeight: 'bold', color: '#DC2626', letterSpacing: 0.8 },
  footerTagline: { fontSize: 9, color: '#6B7280' },

  // ---------- Modals ----------
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', alignItems: 'center' },
  dropdownModal: { width: '82%', backgroundColor: '#FFFFFF', borderRadius: 8, overflow: 'hidden' },
  dropdownModalLarge: { width: '90%', maxHeight: '70%', backgroundColor: '#FFFFFF', borderRadius: 8, overflow: 'hidden' },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#DC2626' },
  dropdownTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  dropdownOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  dropdownOptionText: { fontSize: 15, color: '#374151' },
  dropdownOptionTextActive: { color: '#DC2626', fontWeight: '700' },
  datePickerModal: { width: '90%', backgroundColor: '#FFFFFF', borderRadius: 8, overflow: 'hidden', paddingBottom: 20 },
  datePickerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  datePickerColumn: { flex: 1, alignItems: 'center' },
  datePickerLabel: { fontSize: 13, fontWeight: '700', color: '#DC2626', marginBottom: 8 },
  datePickerScroll: { height: 200, width: '100%' },
  datePickerItem: { paddingVertical: 10, alignItems: 'center', borderRadius: 6 },
  datePickerItemSelected: { backgroundColor: '#DC2626' },
  datePickerItemText: { fontSize: 14, color: '#374151' },
  datePickerItemTextSelected: { fontWeight: 'bold', color: '#FFFFFF' },
  dateConfirmButton: { backgroundColor: '#DC2626', borderRadius: 8, paddingVertical: 14, marginHorizontal: 16, marginTop: 16, alignItems: 'center' },
  dateConfirmButtonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // ---------- Validation ----------
  validationContainer: { marginTop: 10 },
  validationText: { fontSize: 12, marginBottom: 4 },
  validText: { color: '#16A34A' },
  invalidText: { color: '#DC2626' },
  errorText: { fontSize: 12, color: '#DC2626', marginTop: 6 },
});