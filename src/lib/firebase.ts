import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// Firebase web config — public by design (Firestore rules guard access).
const firebaseConfig = {
  apiKey: 'AIzaSyCQkwhp95eYbb9UpecL15LXPPJtA968xEs',
  authDomain: 'layer-desktop.firebaseapp.com',
  projectId: 'layer-desktop',
  storageBucket: 'layer-desktop.firebasestorage.app',
  messagingSenderId: '271931571617',
  appId: '1:271931571617:web:667013fc2935f1c6d69fe0',
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
