import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // I test risiedono in __tests__/
    include: ['__tests__/**/*.test.js'],

    // Timeout generoso per i test di integrazione HTTP
    testTimeout: 10_000,

    coverage: {
      // Provider basato su V8 (equivalente a c8)
      provider: 'v8',

      // Report: testo in console + HTML navigabile + lcov per CI/badge
      reporter: ['text', 'html', 'lcov'],

      // Misura la copertura solo sui file algoritmici principali testati
      include: [
        'src/services/smistatore.js',
        'src/services/predittore.js'
      ],

      // Escludi esplicitamente file che dipendono da I/O esterno o non algoritmici
      exclude: [
        'src/services/escpos-emulator.js',
        'src/services/printer-dispatcher.js',
        'src/services/formatter.js',
        'src/services/stampa/**'
      ],

      // Soglie minime: il CI fallisce se scende sotto queste percentuali
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },

      // Directory di output per il report HTML
      reportsDirectory: './coverage',
    },
  },
})
