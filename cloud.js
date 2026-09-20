// Lila i engleski – spremanje profila u Firebase (radi samo ako je config.js popunjen)
const cfg = window.LILA_FIREBASE;
if (cfg && cfg.apiKey) {
  const V = '10.12.2', base = `https://www.gstatic.com/firebasejs/${V}/`;
  try {
    const [appM, authM, fsM] = await Promise.all([
      import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')
    ]);
    const app = appM.initializeApp(cfg);
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    const col = () => fsM.collection(db, 'users', auth.currentUser.uid, 'profiles');
    const ref = pid => fsM.doc(db, 'users', auth.currentUser.uid, 'profiles', pid);
    const MSG = {
      'auth/invalid-credential': 'Pogrešan e-mail ili lozinka.',
      'auth/wrong-password': 'Pogrešan e-mail ili lozinka.',
      'auth/user-not-found': 'Ne postoji račun s tim e-mailom. Dodirnite „Napravi novi račun“.',
      'auth/invalid-login-credentials': 'Pogrešan e-mail ili lozinka.',
      'auth/email-already-in-use': 'Račun s tim e-mailom već postoji. Dodirnite „Prijavi se“.',
      'auth/weak-password': 'Lozinka treba imati barem 6 znakova.',
      'auth/invalid-email': 'E-mail adresa nije ispravna.',
      'auth/missing-email': 'Upišite e-mail.',
      'auth/network-request-failed': 'Nema interneta. Spojite se i pokušajte ponovno.',
      'auth/too-many-requests': 'Previše pokušaja. Pričekajte nekoliko minuta.',
      'auth/unauthorized-domain': 'Ova adresa nije dopuštena u Firebaseu (Authentication → Settings → Authorized domains).',
      'auth/operation-not-allowed': 'U Firebaseu nije uključena prijava e-mailom (Authentication → Sign-in method).'
    };
    const wrap = p => p.then(() => ({ ok: true }), e => ({ ok: false, msg: MSG[e.code] || ('Nešto nije u redu (' + (e.code || e.message) + ').') }));
    let timer = null, queued = null;
    const flush = async () => {
      if (!queued || !auth.currentUser) return;
      const { cur, data } = queued;
      try {
        await fsM.setDoc(ref(cur.pid), { name: cur.name, avatar: cur.avatar, data: JSON.stringify(data), updatedAt: data.updatedAt || Date.now() }, { merge: true });
        if (queued && queued.data === data) queued = null;
        C.pending = false; C.lastSync = Date.now();
      } catch (e) { C.pending = true; }
    };
    const C = {
      enabled: true, user: null, pending: false, lastSync: 0,
      signIn: (e, p) => wrap(authM.signInWithEmailAndPassword(auth, e, p)),
      signUp: (e, p) => wrap(authM.createUserWithEmailAndPassword(auth, e, p)),
      reset: e => wrap(authM.sendPasswordResetEmail(auth, e)),
      signOut: async () => { await flush(); await authM.signOut(auth); },
      async list() {
        const s = await fsM.getDocs(col());
        return s.docs.map(d => ({ pid: d.id, name: d.data().name, avatar: d.data().avatar, updatedAt: d.data().updatedAt || 0 }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'hr'));
      },
      async create(name, avatar, data) {
        const r = fsM.doc(col());
        await fsM.setDoc(r, { name, avatar, data: JSON.stringify(data), updatedAt: data.updatedAt || Date.now() });
        return { pid: r.id, name, avatar };
      },
      async fetch(pid) {
        const d = await fsM.getDoc(ref(pid));
        if (!d.exists()) return null;
        const x = d.data();
        let data = {}; try { data = JSON.parse(x.data || '{}'); } catch (e) {}
        data.updatedAt = data.updatedAt || x.updatedAt || 0;
        return { data, name: x.name, avatar: x.avatar };
      },
      queueSave(cur, data) {
        queued = { cur: { ...cur }, data: JSON.parse(JSON.stringify(data)) };
        C.pending = true; clearTimeout(timer); timer = setTimeout(flush, 1500);
      }
    };
    window.Cloud = C;
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    authM.onAuthStateChanged(auth, u => { C.user = u; window.dispatchEvent(new Event('cloud-auth')); });
    window.dispatchEvent(new Event('cloud-ready'));
  } catch (e) {
    console.warn('Lila: oblak nije dostupan (nema interneta?)', e);
  }
}
