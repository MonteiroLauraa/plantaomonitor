importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBzQsazuvqeNx7We2jh-pZPY0_LvlIPJ-w",
    authDomain: "monitorplantao.firebaseapp.com",
    projectId: "monitorplantao",
    storageBucket: "monitorplantao.firebasestorage.app",
    messagingSenderId: "881772434144",
    appId: "1:881772434144:web:faff8a39e87cea283bf685",
    measurementId: "G-65WWC0G8PW"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/vite.svg'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
