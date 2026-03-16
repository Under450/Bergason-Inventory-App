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

export interface FirestoreInventory {
  inventory: Inventory;
  token: string;
  tenantEmail: string;
  tenantName: string;
  status: 'pending_signature' | 'signed' | 'review_sent' | 'reviewing' | 'completed' | 'expired';
  createdAt: number;

  // Stage 1 — Pre-move-in signature
  signatureSentAt?: number;
  signatureStatus?: 'pending' | 'signed';
  tenantSignatureData?: string;
  signaturePdfUrl?: string;
  signatureDispatchRef?: string;
  originalPdfUrl?: string;       // PDF 1 sent to tenant with signature request

  // Stage 2 — Post-move-in review (5-day window)
  reviewSentAt?: number;         // when Craig clicks "Send Review Link"
  expiresAt?: number;            // reviewSentAt + 5 days
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
  tenantReviewCompletedAt?: number;
  reviewPdfUrl?: string;         // PDF 2 — combined tenant review report
  reviewPdfDispatchRef?: string;
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
export const activateReviewLink = async (token: string): Promise<void> => {
  const reviewSentAt = Date.now();
  const expiresAt = reviewSentAt + 5 * 24 * 60 * 60 * 1000;
  await updateDoc(doc(db, 'inventories', token), {
    status: 'review_sent',
    reviewSentAt,
    expiresAt,
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
