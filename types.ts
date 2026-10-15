// types.ts
export type TabType = 'Home' | 'Notifications' | 'Tracking' | 'Profile';

export interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  type: 'emergency' | 'info' | 'alert';
}