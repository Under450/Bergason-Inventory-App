
export enum Condition {
  EXCELLENT = 'Excellent',
  GOOD = 'Good',
  FAIR = 'Fair',
  POOR = 'Poor',
  NEEDS_ATTENTION = 'Needs Attention'
}

export enum Cleanliness {
  PROFESSIONAL = 'Professional Clean',
  DOMESTIC = 'Domestic Clean',
  GOOD = 'Good',
  FAIR = 'Fair',
  POOR = 'Poor',
  DIRTY = 'Dirty'
}

export enum MeterType {
  STANDARD = 'Standard',
  PAYG = 'PAYG'
}

export interface Photo {
  id: string;
  url: string; // Base64 data URI
  timestamp: number;
  roomRef?: string;
  itemRef?: string; // ID of the item this photo belongs to
}

export interface InventoryItem {
  id: string;
  name: string; // e.g., "Walls", "Ceiling", "Door"
  condition: Condition;
  cleanliness: Cleanliness;
  description: string;
  photos: string[]; // Array of Photo IDs
  
  // Specific fields for Appliances/Meters
  make?: string;
  model?: string;
  serialNumber?: string;
  workingStatus?: string; // 'Working', 'Not Tested', etc.
  meterType?: MeterType;
  supplier?: string;
}

export interface Room {
  id: string;
  name: string; // e.g., "Lounge", "Kitchen"
  floorGroup?: string; // e.g. "Ground Floor"
  items: InventoryItem[];
}

export interface Document {
  id: string;
  name: string;
  fileData: string | null; // Base64, null if not yet uploaded
  uploadDate: number | null;
}

export interface HealthSafetyCheck {
  id: string;
  question: string;
  answer: 'YES' | 'NO' | 'N/A' | null;
  comment?: string;
}

export interface SignatureEntry {
  id: string;
  name: string;
  type: 'Tenant' | 'Clerk' | 'Landlord' | 'Other';
  data: string; // Base64 signature
  date: number;
}

export interface Inventory {
  id: string;
  address: string;
  clientName: string;
  dateCreated: number;
  dateUpdated: number;
  status: 'DRAFT' | 'LOCKED';
  
  // New fields for Front Page
  frontImage?: string; // Base64 of the main property photo
  propertyDescription?: string;

  healthSafetyChecks: HealthSafetyCheck[];
  rooms: Room[];
  documents: Document[];
  
  // Disclaimer / Sig section
  tenantPresent: boolean;
  declarationAgreed: boolean;
  signatures: SignatureEntry[];
  inspectorName: string;
}
