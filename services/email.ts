import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

const functions = getFunctions(app, 'europe-west2');

interface SendEmailParams {
  type: 'original' | 'review';
  tenantEmail: string;
  tenantName: string;
  address: string;
  pdfStoragePath: string;
  reviewLink?: string;
}

export const sendInventoryEmail = async (params: SendEmailParams): Promise<void> => {
  const fn = httpsCallable(functions, 'sendInventoryEmail');
  await fn(params);
};
