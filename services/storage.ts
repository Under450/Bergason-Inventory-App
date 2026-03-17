import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads a blob to Firebase Storage and returns the public download URL.
 * path example: "pdfs/abc123/original.pdf" or "docs/inv123/docId_file.pdf"
 */
export const uploadPDFToStorage = async (blob: Blob, path: string): Promise<string> => {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, blob, { contentType: blob.type || 'application/octet-stream' });
  return getDownloadURL(snapshot.ref);
};
