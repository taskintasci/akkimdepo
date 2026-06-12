import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'akkim-plan'
});

const db = getFirestore();

async function checkPersons() {
  try {
    const docRef = db.doc('config/persons');
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      console.log('Persons data:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('No persons document found');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkPersons();