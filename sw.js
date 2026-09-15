// =====================================================
// SERVICE WORKER — অফলাইন অ্যাপ-শেল + Firebase পুশ নোটিফিকেশন (ব্যাকগ্রাউন্ড)
// =====================================================

importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// এই কনফিগ index.html-এর firebaseConfig-এর সাথে একই হতে হবে
firebase.initializeApp({
    apiKey: "AIzaSyAavCcIkqFFAz-iG5INaM4eQ2yA5Un-E7s",
    authDomain: "new-bondhu-fund.firebaseapp.com",
    projectId: "new-bondhu-fund",
    storageBucket: "new-bondhu-fund.firebasestorage.app",
    messagingSenderId: "408088794322",
    appId: "1:408088794322:web:545877c413d8c37e1ac90b"
});

const messaging = firebase.messaging();

// অ্যাপ বন্ধ থাকা অবস্থায় / ব্যাকগ্রাউন্ডে পুশ এলে এই ফাংশন চালু হবে —
// এখানেই ফোনের নোটিফিকেশন বারে দেখানোর কাজটা হয়।
messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || "🔔 রিমাইন্ডার";
    const options = {
        body: (payload.notification && payload.notification.body) || "",
        icon: "icon-192.png",
        badge: "icon-192.png",
        data: payload.data || {}
    };
    self.registration.showNotification(title, options);
});

// নোটিফিকেশনে ক্লিক করলে অ্যাপ খুলে যাবে
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ("focus" in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow("./index.html");
        })
    );
});

// ---------- অফলাইন অ্যাপ-শেল ক্যাশ (হালকা) ----------
const CACHE_NAME = "kisti-app-shell-v1";
const APP_SHELL = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    // শুধু GET রিকোয়েস্টের জন্য ক্যাশ-ফার্স্ট, নেট না থাকলে সর্বশেষ ক্যাশ দেখাবে
    if (event.request.method !== "GET") return;
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
    );
});
