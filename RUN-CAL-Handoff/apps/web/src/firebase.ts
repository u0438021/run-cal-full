import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey: 'AIzaSyDRvsG78J3WK9zhTTvhc5Hc_4JclFkHRwE',
  authDomain: 'run-cal-th.firebaseapp.com',
  projectId: 'run-cal-th',
  storageBucket: 'run-cal-th.firebasestorage.app',
  messagingSenderId: '152237457223',
  appId: '1:152237457223:web:bf97f1fd7f93aab30a5662',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const functions = getFunctions(app, 'asia-southeast1')
