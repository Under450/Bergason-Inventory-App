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
  status: 'sent' | 'reviewing' | 'completed' | 'expired';
  createdAt: number;
  expiresAt: number;
  tenantReview: TenantReviewData;
  completedRooms: string[];
  tenantSignature?: string;
  tenantReviewCompletedAt?: number;
  originalPdfUrl?: string;   // PDF 1 – original signed inventory
  reviewPdfUrl?: string;     // PDF 2 – tenant review report
}

export const saveInventoryToFirestore = async (
  inventory: Inventory,
  tenantEmail: string,
  tenantName: string
): Promise<string> => {
  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = Date.now() + 5 * 24 * 60 * 60 * 1000; // 5 days

  const data: FirestoreInventory = {
    inventory,
    token,
    tenantEmail,
    tenantName,
    status: 'sent',
    createdAt: Date.now(),
    expiresAt,
    tenantReview: {},
    completedRooms: [],
  };

  await setDoc(doc(db, 'inventories', token), data);
  return token;
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
