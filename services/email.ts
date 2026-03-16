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

const FUNCTION_URL = 'https://europe-west2-bergason-inventory.cloudfunctions.net/sendInventoryEmail';

export const sendInventoryEmail = async (params: SendEmailParams): Promise<string> => {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Email function error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.reference;
};
