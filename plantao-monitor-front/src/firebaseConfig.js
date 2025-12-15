
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBzQsazuvqeNx7We2jh-pZPY0_LvlIPJ-w",
  authDomain: "monitorplantao.firebaseapp.com",
  projectId: "monitorplantao",
  storageBucket: "monitorplantao.firebasestorage.app",
  messagingSenderId: "881772434144",
  appId: "1:881772434144:web:faff8a39e87cea283bf685",
  measurementId: "G-65WWC0G8PW"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const messaging = getMessaging(app);