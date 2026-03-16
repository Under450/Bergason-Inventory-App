import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app, 'europe-west2');

export interface SendEmailParams {
  type: 'signature_request' | 'signature_confirmation' | 'review_link' | 'review_complete';
  tenantEmail: string;
  tenantName: string;
  address: string;
  pdfStoragePath: string;
  firestoreToken: string;
  propertyId?: string;
  signLink?: string;    // for signature_request
  reviewLink?: string;  // for review_link
}

export const sendInventoryEmail = async (params: SendEmailParams): Promise<string> => {
  const fn = httpsCallable<SendEmailParams, { success: boolean; reference: string }>(functions, 'sendInventoryEmail');
  const result = await fn(params);
  return result.data.reference;
};
