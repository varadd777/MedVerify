import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import ManufacturerSerialization from './components/ManufacturerSerialization';
import PharmacyHandoff from './components/PharmacyHandoff';
import ConsumerVerification from './components/ConsumerVerification';
import SupplyChainLedger from './components/SupplyChainLedger';
import TestRunner from './components/TestRunner';

export default function App() {
  const [activeTab, setActiveTab] = useState('manufacturer'); // 'manufacturer' | 'pharmacy' | 'consumer' | 'ledger'
  const [demoMode, setDemoMode] = useState(true);
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  
  // Navigation parameters passed between tabs
  const [targetSsccForPharmacy, setTargetSsccForPharmacy] = useState(null);
  const [targetItemForConsumer, setTargetItemForConsumer] = useState(null);

  // Auth form states
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    role: 'manufacturer'
  });
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize Auth safely with catch block to never hang if network/Supabase fails
  useEffect(() => {
    let isMounted = true;

    try {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (isMounted) {
            setSession(data?.session ?? null);
            setLoadingSession(false);
          }
        })
        .catch((err) => {
          console.warn('Supabase getSession fallback to local:', err);
          if (isMounted) {
            setLoadingSession(false);
          }
        });

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((_event, currentSession) => {
        if (isMounted) {
          setSession(currentSession ?? null);
          setLoadingSession(false);
        }
      });

      return () => {
        isMounted = false;
        subscription?.unsubscribe?.();
      };
    } catch (err) {
      console.warn('Supabase auth init exception:', err);
      setLoadingSession(false);
    }
  }, []);

  // Cross-page navigation handlers
  const navigateToPharmacy = (sscc) => {
    setTargetSsccForPharmacy(sscc);
    setActiveTab('pharmacy');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToConsumer = (sscc) => {
    setTargetItemForConsumer(sscc);
    setActiveTab('consumer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleVerifySpecificItem = (gtin, serial) => {
    setActiveTab('consumer');
    // Preload item
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Auth Handlers
  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');

    if (authForm.password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    if (authForm.password !== authForm.confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: authForm.email.trim(),
        password: authForm.password,
        options: { data: { role: authForm.role } }
      });
      setIsSubmitting(false);

      if (error) {
        setAuthError(error.message);
        return;
      }

      if (!data.session) {
        setAuthMessage('Account created! Check email or use Prototype Mode to explore immediately.');
      } else {
        setAuthMessage('Account created and signed in.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setAuthError(`Network error: ${err.message || 'Supabase host unreachable'}. Click "Switch to Prototype Mode" to test all pages right away.`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authForm.email.trim(),
        password: authForm.password
      });
      setIsSubmitting(false);

      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthMessage('Signed in successfully.');
    } catch (err) {
      setIsSubmitting(false);
      setAuthError(`Sign-in error: ${err.message || 'Supabase host unreachable'}. You can switch to Prototype Mode to access all pages without credentials.`);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setSession(null);
  };

  return (
    <div className="app-container">
      {/* Top Main Navigation Bar */}
      <header className="global-nav">
        <div className="nav-brand-group">
          <div className="nav-logo">🛡️</div>
          <div>
            <div className="nav-brand-title">
              MedVerify <span className="text-cyan">IoT</span>
            </div>
            <div className="nav-brand-sub">Decentralized Pharmaceutical Track & Trace</div>
          </div>
        </div>

        {/* Navigation Tabs - All Pages accessible */}
        <nav className="nav-tabs" aria-label="Main Navigation">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'manufacturer' ? 'active' : ''}`}
            onClick={() => setActiveTab('manufacturer')}
          >
            <span className="tab-icon">🏭</span>
            <span>Manufacturer</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'pharmacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('pharmacy')}
          >
            <span className="tab-icon">🏥</span>
            <span>Pharmacy Intake</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'consumer' ? 'active' : ''}`}
            onClick={() => setActiveTab('consumer')}
          >
            <span className="tab-icon">🛡️</span>
            <span>Consumer Verification</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setActiveTab('ledger')}
          >
            <span className="tab-icon">📊</span>
            <span>Supply Chain Ledger</span>
          </button>

          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'tests' ? 'active' : ''}`}
            onClick={() => setActiveTab('tests')}
          >
            <span className="tab-icon">🧪</span>
            <span>Automated Tests</span>
          </button>
        </nav>

        {/* Right Status & Controls */}
        <div className="nav-controls">
          <div className="system-pill" title="Autonomous hybrid storage engine active">
            <span className="status-dot-pulse"></span>
            <span className="pill-text">Prototype Engine Ready</span>
          </div>

          {!demoMode && session && (
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={handleLogout}
            >
              Sign out ({session.user.email})
            </button>
          )}

          <button
            type="button"
            className={`btn btn-xs ${demoMode ? 'btn-mode-active' : 'btn-outline'}`}
            onClick={() => setDemoMode(!demoMode)}
            title="Toggle between All-Pages Prototype mode and Role-Auth mode"
          >
            {demoMode ? '✨ Prototype Mode: All Pages' : '🔒 Auth Mode'}
          </button>
        </div>
      </header>

      {/* Main Viewport Content */}
      <main className="app-viewport">
        {/* If user is in Auth Mode and not logged in */}
        {!demoMode && !session ? (
          <div className="auth-card-container">
            <div className="card auth-card">
              <div className="card-header text-center">
                <h3>{authMode === 'login' ? 'Sign In to Portal' : 'Register Account'}</h3>
                <p className="text-muted text-sm">
                  Access role-specific dashboard with Supabase credentials.
                </p>
              </div>

              <div className="card-body">
                <form onSubmit={authMode === 'login' ? handleLogin : handleRegister}>
                  <label className="field-label">
                    Email
                    <input
                      type="email"
                      className="text-input"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                      required
                    />
                  </label>

                  <label className="field-label mt-3">
                    Password
                    <input
                      type="password"
                      className="text-input"
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                      required
                    />
                  </label>

                  {authMode === 'register' && (
                    <>
                      <label className="field-label mt-3">
                        Confirm Password
                        <input
                          type="password"
                          className="text-input"
                          value={authForm.confirmPassword}
                          onChange={(e) => setAuthForm({ ...authForm, confirmPassword: e.target.value })}
                          required
                        />
                      </label>

                      <label className="field-label mt-3">
                        Role
                        <select
                          className="select-input"
                          value={authForm.role}
                          onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}
                        >
                          <option value="manufacturer">Manufacturer</option>
                          <option value="pharmacy">Pharmacy</option>
                          <option value="consumer">Consumer</option>
                        </select>
                      </label>
                    </>
                  )}

                  {authError && <div className="notification-banner danger mt-3">{authError}</div>}
                  {authMessage && <div className="notification-banner success mt-3">{authMessage}</div>}

                  <button
                    type="submit"
                    className="btn btn-primary w-full mt-4"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                </form>

                <div className="auth-footer mt-4 flex justify-between items-center text-xs">
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => {
                      setAuthMode(authMode === 'login' ? 'register' : 'login');
                      setAuthError('');
                    }}
                  >
                    {authMode === 'login' ? "Don't have an account? Register" : 'Existing account? Sign in'}
                  </button>

                  <button
                    type="button"
                    className="btn-link font-bold text-cyan"
                    onClick={() => setDemoMode(true)}
                  >
                    Skip & Use Prototype Mode ➔
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Render Active Page Tab */
          <div className="tab-viewport-content">
            {activeTab === 'manufacturer' && (
              <ManufacturerSerialization onNavigateToPharmacy={navigateToPharmacy} />
            )}

            {activeTab === 'pharmacy' && (
              <PharmacyHandoff onNavigateToConsumer={navigateToConsumer} />
            )}

            {activeTab === 'consumer' && (
              <ConsumerVerification initialSscc={targetItemForConsumer} />
            )}

            {activeTab === 'ledger' && (
              <SupplyChainLedger onVerifyItem={handleVerifySpecificItem} />
            )}

            {activeTab === 'tests' && <TestRunner />}
          </div>
        )}
      </main>

      {/* Global Prototype Footer */}
      <footer className="global-footer">
        <div className="footer-content">
          <span>MedVerify IoT · Pharmaceutical Serialization & Cold Chain Integrity Prototype</span>
          <div className="footer-links">
            <span className="dot-sep">•</span>
            <span>GS1 Digital Link Compliant</span>
            <span className="dot-sep">•</span>
            <span>SHA-256 Single-Use Device Binding</span>
            <span className="dot-sep">•</span>
            <span>ColdGuard BLE IoT Sensor Emulation</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
