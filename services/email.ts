import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app, 'europe-west2');

interface SendEmailParams {
  type: 'original' | 'review';
  tenantEmail: string;
  tenantName: string;
  address: string;
  pdfStoragePath: string;
  firestoreToken: string;
  reviewLink?: string;
}

export const sendInventoryEmail = async (params: SendEmailParams): Promise<string> => {
  const fn = httpsCallable<SendEmailParams, { success: boolean; reference: string }>(functions, 'sendInventoryEmail');
  const result = await fn(params);
  return result.data.reference;
};
