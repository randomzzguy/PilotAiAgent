import React from 'react';
import './App.css';
import PasswordProtection from './components/PasswordProtection';
import ContentGenerator from './components/ContentGenerator';

function App() {
  return (
    <PasswordProtection>
      <ContentGenerator />
    </PasswordProtection>
  );
}

export default App;
