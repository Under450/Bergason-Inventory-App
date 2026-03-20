import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Inventory } from '../types';

export interface ItemReview {
  agreed: boolean;
  comment?: string;
  photos?: string[];
}

export interface TenantReviewData {
  [itemId: string]: ItemReview;
}

export type CheckOutChargeType = 'beyond_fwt' | 'repair' | 'replace' | 'missing' | 'left_behind';
export type CheckOutResponsibility = 'tenant' | 'landlord';

export interface AgentDisputeResponse {
  [itemId: string]: {
    respondedAt: number;
    accepted: boolean;
    notes?: string;
  };
}

export interface CheckOutItemResult {
  changed: boolean;
  chargeType?: CheckOutChargeType;
  responsibility?: CheckOutResponsibility;
  estimatedCost?: number;
  notes?: string;
  photos?: string[];
}

export interface CheckOutNewItem {
  id: string;
  name: string;
  roomId: string;
  chargeType: CheckOutChargeType;
  responsibility: CheckOutResponsibility;
  estimatedCost?: number;
  notes?: string;
  photos?: string[];
}

export interface CheckOutData {
  checkOutDate: number;
  inspectorName: string;
  tenantPresent: boolean;
  tenantRefusedToSign?: boolean;
  tenantSignatureData?: string;
  cleaningStandard?: 'professional' | 'domestic' | 'good' | 'fair' | 'poor' | 'dirty';
  meterReadings?: {
    gas?:      { reading: string; photo?: string };
    electric?: { reading: string; photo?: string };
    water?:    { reading: string; photo?: string };
  };
  keysReturned?: { count: number; notes?: string };
  items: { [itemId: string]: CheckOutItemResult };
  newItems?: CheckOutNewItem[];
}

export interface FirestoreInventory {
  inventory: Inventory;
  token: string;
  tenantEmail: string;
  tenantName: string;
  status: 'pending_signature' | 'signed' | 'review_sent' | 'reviewing' | 'completed' | 'expired'
         | 'dispute_review' | 'checkout_in_progress' | 'checkout_complete';
  createdAt: number;

  // Stage 1 — Pre-move-in signature
  signatureSentAt?: number;
  signatureStatus?: 'pending' | 'signed';
  tenantSignatureData?: string;
  signaturePdfUrl?: string;
  signatureDispatchRef?: string;
  originalPdfUrl?: string;       // PDF 1 sent to tenant with signature request

  // Stage 2 — Post-move-in review (5-day window)
  moveInDate?: number;           // tenant's actual move-in date (ms epoch)
  reviewSentAt?: number;         // when Craig clicks "Send Review Link"
  expiresAt?: number;            // moveInDate + 5 days
  reviewDispatchRef?: string;
  reminder3Sent?: boolean;
  reminder3SentAt?: number;
  reminder5Sent?: boolean;
  reminder5SentAt?: number;
  expiryEmailSent?: boolean;
  expiryEmailSentAt?: number;

  // Stage 3 — Tenant review responses
  tenantReview: TenantReviewData;
  completedRooms: string[];
  tenantSignature?: string;
  noFurtherDefects?: boolean;
  tenantReviewCompletedAt?: number;
  reviewPdfUrl?: string;         // PDF 2 — combined tenant review report
  reviewPdfDispatchRef?: string;

  // Stage 4 — Agent dispute response
  agentDisputeResponse?: AgentDisputeResponse;

  // Stage 5 — Check-out
  tenancyStartDate?: number;
  tenancyEndDate?: number;
  checkInDate?: number;
  checkOutData?: CheckOutData;
  checkOutPdfUrl?: string;
}

/** Called when inspector clicks "Send for Signature" — Stage 1 */
export const saveInventoryToFirestore = async (
  inventory: Inventory,
  tenantEmail: string,
  tenantName: string
): Promise<string> => {
  const token = crypto.randomUUID().replace(/-/g, '');

  const data: FirestoreInventory = {
    inventory,
    token,
    tenantEmail,
    tenantName,
    status: 'pending_signature',
    createdAt: Date.now(),
    signatureSentAt: Date.now(),
    signatureStatus: 'pending',
    tenantReview: {},
    completedRooms: [],
  };

  await setDoc(doc(db, 'inventories', token), data);
  return token;
};

/** Called when Craig clicks "Send Review Link" — Stage 2 */
export const activateReviewLink = async (
  token: string,
  moveInDate: number,
  activeRoomIds: string[]
): Promise<void> => {
  const reviewSentAt = Date.now();
  const expiresAt = moveInDate + 5 * 24 * 60 * 60 * 1000;
  await updateDoc(doc(db, 'inventories', token), {
    status: 'review_sent',
    moveInDate,
    reviewSentAt,
    expiresAt,
    'inventory.activeRoomIds': activeRoomIds,
  });
};

export const getInventoryByToken = async (token: string): Promise<FirestoreInventory | null> => {
  const snap = await getDoc(doc(db, 'inventories', token));
  return snap.exists() ? (snap.data() as FirestoreInventory) : null;
};

export const updateTenantProgress = async (
  token: string,
  updates: Partial<FirestoreInventory>
): Promise<void> => {
  await updateDoc(doc(db, 'inventories', token), updates as Record<string, unknown>);
};

/** Saves checkOutData to Firestore — called from CheckOut page */
export const saveCheckOutData = async (
  token: string,
  checkOutData: CheckOutData,
  status: 'checkout_in_progress' | 'checkout_complete'
): Promise<void> => {
  await updateDoc(doc(db, 'inventories', token), { checkOutData, status });
};

/** Saves agent dispute responses to Firestore */
export const saveDisputeResponses = async (
  token: string,
  agentDisputeResponse: AgentDisputeResponse
): Promise<void> => {
  await updateDoc(doc(db, 'inventories', token), {
    agentDisputeResponse,
    status: 'dispute_review'
  });
};
