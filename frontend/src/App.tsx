import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Chat from './Chat';
import Admin from './Admin';
import { GlobalStyle } from './Chat';

function App() {
  return (
    <>
      <GlobalStyle />
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/join/:token" element={<Chat />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </>
  );
}

export default App;