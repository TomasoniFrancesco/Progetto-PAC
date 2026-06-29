const express = require('express');
const router = express.Router();
const utenti = require('../repositories/utente.repo');
const auth = require('../services/auth.service');

// Autenticazione Admin (Iterazione 3, UC8).
// Accesso con una SINGOLA password (nessun username). La password è confrontata
// con l'hash bcrypt dell'unico utente con ruolo 'admin'. Al successo viene
// emesso un token di sessione che protegge le operazioni riservate.

// POST /api/auth/admin/login — verifica la password e rilascia un token.
router.post('/admin/login', async (req, res) => {
    const { password } = req.body || {};
    if (password === undefined || password === null || password === '') {
        return res.status(400).json({ errore: 'Password richiesta' });
    }

    try {
        const admin = await utenti.trovaAdmin();
        const ok = admin && (await auth.verificaPassword(password, admin.password_hash));
        if (!ok) {
            // Stessa risposta per "admin assente" e "password errata": non si
            // rivelano dettagli utili a un attaccante.
            return res.status(401).json({ errore: 'Password errata' });
        }

        const { token, scadenza } = auth.creaToken('admin');
        res.json({ token, scadenza, ruolo: 'admin' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

// POST /api/auth/admin/logout — revoca il token corrente.
router.post('/admin/logout', auth.richiediAdmin, (req, res) => {
    auth.revocaToken(req.token);
    res.json({ messaggio: 'Logout effettuato' });
});

// GET /api/auth/admin/verifica — conferma che il token è ancora valido.
// Usato dal frontend al caricamento per decidere se mostrare il pannello admin.
router.get('/admin/verifica', auth.richiediAdmin, (req, res) => {
    res.json({ valido: true, ruolo: req.utente.ruolo });
});

// PUT /api/auth/admin/password — cambia la password admin (operazione protetta).
router.put('/admin/password', auth.richiediAdmin, async (req, res) => {
    const { password_attuale, nuova_password } = req.body || {};
    if (!password_attuale || !nuova_password) {
        return res.status(400).json({ errore: 'password_attuale e nuova_password sono obbligatorie' });
    }

    try {
        const admin = await utenti.trovaAdmin();
        const ok = admin && (await auth.verificaPassword(password_attuale, admin.password_hash));
        if (!ok) {
            return res.status(401).json({ errore: 'Password attuale errata' });
        }

        const nuovoHash = await auth.hashPassword(nuova_password);
        await utenti.aggiornaPasswordAdmin(nuovoHash);
        res.json({ messaggio: 'Password aggiornata' });
    } catch (err) {
        res.status(500).json({ errore: err.message });
    }
});

module.exports = router;
