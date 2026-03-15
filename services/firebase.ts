import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyBLDGcxYRdG4cBbOu41e3KBrAcKXaznmpU",
  authDomain: "bergason-inventory.firebaseapp.com",
  projectId: "bergason-inventory",
  storageBucket: "bergason-inventory.firebasestorage.app",
  messagingSenderId: "294355970243",
  appId: "1:294355970243:web:84365fc7a6f30283d95a76",
  measurementId: "G-DZ8RDM0MVC"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
