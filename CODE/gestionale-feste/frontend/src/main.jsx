import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Cassa from './pages/Cassa'
import Admin from './pages/Admin'
import Simulazione from './pages/Simulazione'
import Predittore from './pages/Predittore'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/cassa" replace />} />
        <Route path="/cassa" element={<Cassa />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/simulazione" element={<Simulazione />} />
        <Route path="/predittore" element={<Predittore />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
