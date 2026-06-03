// Confine unico di accesso ai dati per il layer dei repository.
// Tutti i repository passano da qui invece di importare direttamente il pool:
// un solo punto in cui, in futuro, aggiungere logging/metriche delle query o
// sostituire il driver. È l'unico modulo del layer che dipende da ../db.
module.exports = require('../db');
