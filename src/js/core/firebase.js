/**
 * Firebase configuration — Akkim İthalat ve İhracat Planı
 *
 * Firebase console'dan yeni proje oluşturduktan sonra bu config'i güncelleyin:
 * https://console.firebase.google.com/
 *
 * Güncellenecek alanlar: apiKey, authDomain, projectId, storageBucket,
 *                        messagingSenderId, appId
 */

const firebaseConfig = {
  apiKey:            "AIzaSyDbGW1xiyRpxQmLIWLYQ3t7Ppq9tHKe9Ec",
  authDomain:        "akkim-plan.firebaseapp.com",
  projectId:         "akkim-plan",
  storageBucket:     "akkim-plan.firebasestorage.app",
  messagingSenderId: "751503194833",
  appId:             "1:751503194833:web:36de9c671732407ecd63f0",
};

// Firebase compat SDK (global firebase objesi)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Firestore cache (offline persistence) — settings() db referansı alınmadan önce çağrılmalı
try {
  firebase.firestore().settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
  });
} catch {
  // settings() yalnızca ilk çağrıda çalışır; sonraki sekmelerde sessizce geç
}

export const db = firebase.firestore();
