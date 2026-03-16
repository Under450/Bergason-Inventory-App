import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads a PDF blob to Firebase Storage and returns the public download URL.
 * path example: "pdfs/abc123/original.pdf"
 */
export const uploadPDFToStorage = async (blob: Blob, path: string): Promise<string> => {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
  return getDownloadURL(snapshot.ref);
};
