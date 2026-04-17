// Firebase Realtime Database sync layer.
// Uses dynamic imports so that a CDN failure never blocks the main app.

const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.12.2';

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAXRMMZoFduhRcSOohBVrqARCAVzzhYAWk",
    authDomain: "nezho-quest.firebaseapp.com",
    databaseURL: "https://nezho-quest-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "nezho-quest",
    storageBucket: "nezho-quest.firebasestorage.app",
    messagingSenderId: "248098761577",
    appId: "1:248098761577:web:7eb08a140a4dfcd554ebf8"
};

const DB_PATH = 'nezha_quest/state';

let db = null;
let auth = null;
let _unsubscribe = null;
// Resolves once auth completes (or fails) — gating all DB reads
let _authReady = Promise.resolve(null);

export async function initFirebase() {
    try {
        const [{ initializeApp }, { getDatabase, ref: _ref, set, get, onValue, serverTimestamp }, { getAuth, signInAnonymously, onAuthStateChanged }] = await Promise.all([
            import(`${FIREBASE_CDN}/firebase-app.js`),
            import(`${FIREBASE_CDN}/firebase-database.js`),
            import(`${FIREBASE_CDN}/firebase-auth.js`)
        ]);

        // Store helpers on module scope for later use
        _fb = { ref: _ref, set, get, onValue, serverTimestamp };

        const app = initializeApp(FIREBASE_CONFIG);
        db = getDatabase(app);
        auth = getAuth(app);

        _authReady = new Promise((resolve) => {
            onAuthStateChanged(auth, (user) => resolve(user));
            signInAnonymously(auth).catch(() => resolve(null));
        });

        return { ready: true };
    } catch (e) {
        console.warn('[Firebase] init failed:', e.message);
        return { ready: false, reason: e.message };
    }
}

// Firebase DB helpers — populated after initFirebase() resolves
let _fb = null;

export function pushStateToCloud(state) {
    if (!db || !_fb || !auth?.currentUser) return;
    const payload = {
        ...state,
        isSpinning: false,
        txLockUntil: 0,
        _syncedAt: _fb.serverTimestamp()
    };
    _fb.set(_fb.ref(db, DB_PATH), payload).catch((e) => {
        console.warn('[Firebase] push failed:', e.message);
    });
}

export async function loadStateFromCloud() {
    if (!db || !_fb) return null;
    try {
        const user = await _authReady;
        if (!user) return null;
        const snapshot = await _fb.get(_fb.ref(db, DB_PATH));
        if (snapshot.exists()) {
            const { _syncedAt, ...rest } = snapshot.val();
            return rest;
        }
        return null;
    } catch (e) {
        console.warn('[Firebase] load failed:', e.message);
        return null;
    }
}

export function subscribeToCloudState(onChange) {
    if (!db || !_fb) return () => {};
    if (_unsubscribe) _unsubscribe();

    _unsubscribe = _fb.onValue(
        _fb.ref(db, DB_PATH),
        (snapshot) => {
            if (snapshot.exists()) {
                const { _syncedAt, ...rest } = snapshot.val();
                onChange(rest);
            }
        },
        (err) => {
            console.warn('[Firebase] listener error:', err.message);
        }
    );

    return () => {
        if (_unsubscribe) {
            _unsubscribe();
            _unsubscribe = null;
        }
    };
}

