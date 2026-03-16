export enum Condition {
  EXCELLENT = 'Excellent',
  GOOD = 'Good',
  FAIR = 'Fair',
  CWA = 'Consistent With Age',
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
  url: string;
  timestamp: number;
  roomRef?: string;
  itemRef?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  condition: Condition;
  cleanliness: Cleanliness;
  description: string;
  photos: string[];

  // Appliance/Meter fields
  make?: string;
  model?: string;
  serialNumber?: string;
  workingStatus?: string;
  meterType?: MeterType;
  supplier?: string;
  accountNumber?: string;   // meter account number for utility claims

  // Deposit evidence fields
  qualityTier?: 'Budget' | 'Mid-range' | 'Premium';  // for depreciation calculation
  installedDate?: string;   // e.g. "March 2021" — for fair wear and tear
  purchasePrice?: string;   // e.g. "£450" — for depreciation at check-out
}

export interface Room {
  id: string;
  name: string;
  floorGroup?: string;
  items: InventoryItem[];

  // Deposit evidence fields
  odourNotes?: string;         // smell at check-in — critical for smoking/pet claims
  decorationColour?: string;   // wall/ceiling colour — needed for redecoration claims
  lastDecorated?: string;      // approx year — for fair wear and tear on decoration
}

export interface Document {
  id: string;
  name: string;
  fileData: string | null;
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
  type: string;
  data: string;
  date: number;
}

export interface Inventory {
  id: string;
  address: string;
  clientName: string;
  dateCreated: number;
  dateUpdated: number;
  status: 'DRAFT' | 'LOCKED';

  frontImage?: string;
  propertyId?: string;
  propertyDescription?: string;
  propertyType?: string;
  activeRoomIds?: string[];

  // Pre-tenancy condition — critical for cleaning/redecoration claims
  preTenancyClean?: boolean;
  preTenancyCleanDate?: string;
  preTenancyCleanInvoiceRef?: string;

  healthSafetyChecks: HealthSafetyCheck[];
  rooms: Room[];
  documents: Document[];

  tenantPresent: boolean;
  declarationAgreed: boolean;
  noFurtherDefects?: boolean;   // tenant confirms no undocumented defects
  signatures: SignatureEntry[];
  inspectorName: string;
}
