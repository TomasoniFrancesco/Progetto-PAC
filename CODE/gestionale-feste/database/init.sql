CREATE DATABASE IF NOT EXISTS gestionale_feste CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gestionale_feste;

-- Utenti del sistema (Cassiere e Admin)
CREATE TABLE utente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    ruolo ENUM('cassiere', 'admin') NOT NULL DEFAULT 'cassiere'
);

-- Voci del menu (pietanze e bevande)
CREATE TABLE voce (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codice VARCHAR(20) NOT NULL UNIQUE,
    nome VARCHAR(150) NOT NULL,
    prezzo DECIMAL(6,2) NOT NULL DEFAULT 0.00,
    categoria VARCHAR(100),
    settore_visualizzazione VARCHAR(50),
    settore_stampa VARCHAR(50),
    colore_tasto VARCHAR(20) DEFAULT '#4A90D9',
    ordine_schermo INT DEFAULT 0,
    visibile TINYINT(1) NOT NULL DEFAULT 1,
    asportabile TINYINT(1) NOT NULL DEFAULT 1,
    modalita_stampa ENUM('singola_singola', 'singola_multipla') DEFAULT 'singola_multipla'
);

-- Scorte per voce
CREATE TABLE scorta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voce_id INT NOT NULL,
    quantita INT NOT NULL DEFAULT 0,
    soglia_giallo INT NOT NULL DEFAULT 10,
    soglia_rosso INT NOT NULL DEFAULT 3,
    attiva TINYINT(1) NOT NULL DEFAULT 0,
    FOREIGN KEY (voce_id) REFERENCES voce(id) ON DELETE CASCADE
);

-- Contatori aggregati (es. polenta condivisa tra piu pietanze)
CREATE TABLE contatore_aggregato (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    quantita INT NOT NULL DEFAULT 0
);

-- Associazione voce <-> contatore aggregato
CREATE TABLE voce_contatore (
    voce_id INT NOT NULL,
    contatore_id INT NOT NULL,
    PRIMARY KEY (voce_id, contatore_id),
    FOREIGN KEY (voce_id) REFERENCES voce(id) ON DELETE CASCADE,
    FOREIGN KEY (contatore_id) REFERENCES contatore_aggregato(id) ON DELETE CASCADE
);

-- Allergeni
CREATE TABLE allergene (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descr VARCHAR(255)
);

-- Associazione voce <-> allergene
CREATE TABLE voce_allergene (
    voce_id INT NOT NULL,
    allergene_id INT NOT NULL,
    PRIMARY KEY (voce_id, allergene_id),
    FOREIGN KEY (voce_id) REFERENCES voce(id) ON DELETE CASCADE,
    FOREIGN KEY (allergene_id) REFERENCES allergene(id) ON DELETE CASCADE
);

-- Note preimpostate per voce
CREATE TABLE nota_preimpostata (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voce_id INT NOT NULL,
    testo VARCHAR(255) NOT NULL,
    costo_aggiuntivo DECIMAL(5,2) DEFAULT 0.00,
    FOREIGN KEY (voce_id) REFERENCES voce(id) ON DELETE CASCADE
);

-- Stampanti fisiche
CREATE TABLE stampante (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reparto VARCHAR(50) NOT NULL,
    indirizzo_ip VARCHAR(50) NOT NULL,
    porta INT NOT NULL DEFAULT 9100,
    stato VARCHAR(20) DEFAULT 'sconosciuto'
);

-- Ordini
CREATE TABLE ordine (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tavolo INT,
    stato ENUM('in_composizione', 'confermato', 'annullato') NOT NULL DEFAULT 'in_composizione',
    asporto TINYINT(1) NOT NULL DEFAULT 0,
    sconto DECIMAL(5,2) DEFAULT 0.00,
    tipo_sconto ENUM('percentuale', 'fisso') DEFAULT 'percentuale',
    totale DECIMAL(8,2) DEFAULT 0.00,
    importo_pagato DECIMAL(8,2),
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    utente_id INT,
    FOREIGN KEY (utente_id) REFERENCES utente(id)
);

-- Righe dell'ordine (voce + quantita + note)
CREATE TABLE ordine_riga (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ordine_id INT NOT NULL,
    voce_id INT NOT NULL,
    quantita INT NOT NULL DEFAULT 1,
    FOREIGN KEY (ordine_id) REFERENCES ordine(id) ON DELETE CASCADE,
    FOREIGN KEY (voce_id) REFERENCES voce(id)
);

-- Note per singola porzione di una riga
CREATE TABLE ordine_riga_nota (
    id INT AUTO_INCREMENT PRIMARY KEY,
    riga_id INT NOT NULL,
    numero_porzione INT NOT NULL DEFAULT 1,
    testo VARCHAR(255),
    costo_aggiuntivo DECIMAL(5,2) DEFAULT 0.00,
    FOREIGN KEY (riga_id) REFERENCES ordine_riga(id) ON DELETE CASCADE
);

-- Dati di esempio per sviluppo
INSERT INTO utente (username, password_hash, ruolo) VALUES
('admin', '$2b$10$placeholder_hash_admin', 'admin'),
('cassa1', '$2b$10$placeholder_hash_cassa', 'cassiere');

INSERT INTO voce (codice, nome, prezzo, categoria, settore_visualizzazione, settore_stampa, colore_tasto, ordine_schermo) VALUES
('P001', 'Risotto ai funghi', 9.00, 'Primo', 'Primi', 'cucina', '#E8A838', 1),
('P002', 'Polenta taragna', 8.00, 'Primo', 'Primi', 'cucina', '#E8A838', 2),
('S001', 'Costine alla griglia', 12.00, 'Secondo', 'Secondi', 'griglia', '#C0392B', 1),
('B001', 'Birra media', 3.50, 'Bevanda', 'Bar', 'bar', '#2980B9', 1),
('B002', 'Acqua', 1.00, 'Bevanda', 'Bar', 'bar', '#2980B9', 2);

INSERT INTO allergene (nome, descr) VALUES
('Glutine', 'Cereali contenenti glutine'),
('Lattosio', 'Latte e derivati'),
('Frutta a guscio', 'Noci, mandorle, nocciole');

INSERT INTO stampante (reparto, indirizzo_ip, porta) VALUES
('cucina', '192.168.1.101', 9100),
('bar', '192.168.1.102', 9100),
('griglia', '192.168.1.103', 9100);
