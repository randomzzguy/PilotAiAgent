import React, { useState, useEffect } from 'react';
import './PasswordProtection.css';

interface PasswordProtectionProps {
  children: React.ReactNode;
}

const PasswordProtection: React.FC<PasswordProtectionProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if user is already authenticated on component mount
  useEffect(() => {
    const authStatus = sessionStorage.getItem('app_authenticated');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Get the password from environment variable
    const correctPassword = process.env.REACT_APP_ACCESS_PASSWORD || 'admin123';
    
    // Simple password check
    if (password === correctPassword) {
      setIsAuthenticated(true);
      sessionStorage.setItem('app_authenticated', 'true');
    } else {
      setError('Incorrect password. Please try again.');
    }
    
    setLoading(false);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('app_authenticated');
    setPassword('');
  };

  if (isAuthenticated) {
    return (
      <div>
        <div className="logout-header">
          <button onClick={handleLogout} className="logout-btn">
            🔒 Logout
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="password-protection">
      <div className="password-container">
        <div className="password-header">
          <h1>🔐 Secure Access</h1>
          <p>Please enter the access password to continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="password-form">
          <div className="input-group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="password-input"
              required
              disabled={loading}
            />
          </div>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
          
          <button 
            type="submit" 
            className="submit-btn"
            disabled={loading || !password.trim()}
          >
            {loading ? 'Verifying...' : 'Access Application'}
          </button>
        </form>
        
        <div className="security-notice">
          <p>🛡️ This application is protected for authorized users only</p>
        </div>
      </div>
    </div>
  );
};

export default PasswordProtection;