// App.js - Design moderno e profissional
import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    // Obter URL atual ao carregar
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const url = new URL(tabs[0].url);
        setCurrentUrl(url.hostname);
      }
    });
  }, []);

  const handleScan = async () => {
    setLoading(true);
    setError('');
    setReport(null);
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada');

      // Obter cookies da página
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.cookie
      });

      if (!results[0]?.result && results[0]?.result !== '') {
        throw new Error('Não foi possível acessar os cookies da página');
      }

      const cookieString = results[0].result;
      const cookies = cookieString ? cookieString.split('; ').map(c => c.split('=')[0].trim()) : [];

      // Enviar para análise no backend
      const auditResponse = await fetch('http://localhost:5000/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: tab.url, cookies })
      });

      if (!auditResponse.ok) {
        throw new Error('Erro ao conectar com o servidor de análise');
      }

      const auditData = await auditResponse.json();
      setReport(auditData);
      
    } catch (err) {
      setError(err.message || 'Erro ao escanear página');
      console.error('Erro no scan:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-scan ao abrir
  useEffect(() => {
    handleScan();
  }, []);

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const getRiskBadgeClass = (risk) => {
    if (risk === 'Alto') return 'badge-high';
    if (risk === 'Médio') return 'badge-medium';
    return 'badge-low';
  };

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header">
        <div className="logo-section">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7V12C2 16.5 4.5 20.7 8.5 22.2L12 23.5L15.5 22.2C19.5 20.7 22 16.5 22 12V7L12 2Z" 
                    fill="url(#gradient1)" />
              <path d="M12 2V23.5L8.5 22.2C4.5 20.7 2 16.5 2 12V7L12 2Z" 
                    fill="url(#gradient2)" opacity="0.7"/>
              <defs>
                <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
                <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#9f7aea" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="app-title">DataShield</h1>
            <div className="current-site">{currentUrl || 'Carregando...'}</div>
          </div>
        </div>
        <button 
          className="refresh-btn" 
          onClick={handleScan} 
          disabled={loading}
          title="Escanear novamente"
        >
          <svg className={loading ? 'spinning' : ''} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" 
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Analisando privacidade...</p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="error-container">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p>{error}</p>
          <button className="retry-btn" onClick={handleScan}>
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Results */}
      {report && !loading && (
        <div className="results">
          {/* Privacy Score Card */}
          <div className="score-card">
            <div className="score-circle" style={{ '--score-color': getScoreColor(report.privacy_score) }}>
              <svg className="score-ring" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="12"/>
                <circle 
                  cx="60" cy="60" r="54" 
                  fill="none" 
                  stroke="var(--score-color)" 
                  strokeWidth="12"
                  strokeDasharray={`${(report.privacy_score / 100) * 339.292} 339.292`}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="score-value">
                <span className="score-number">{report.privacy_score}</span>
                <span className="score-label">Score</span>
              </div>
            </div>
            <div className="score-info">
              <h2 className="score-title">{report.classification}</h2>
              <p className="score-description">
                {report.privacy_score >= 80 
                  ? 'Este site tem boas práticas de privacidade'
                  : report.privacy_score >= 50
                  ? 'Atenção moderada recomendada'
                  : 'Alto nível de rastreamento detectado'}
              </p>
            </div>
          </div>

          {/* Warnings */}
          {report.warnings && report.warnings.length > 0 && (
            <div className="alert alert-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 9v4m0 4h.01M5.07 19h13.86c1.87 0 2.81-2.26 1.49-3.58L13.49 4.79c-1.32-1.32-3.66-.38-3.66 1.49v0L5.07 15.42C3.75 16.74 4.69 19 6.56 19z" 
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div>
                {report.warnings.map((warning, i) => (
                  <p key={i}>{warning}</p>
                ))}
              </div>
            </div>
          )}

          {/* Cookie Summary */}
          <div className="section">
            <h3 className="section-title">
              <span className="icon">🍪</span>
              Cookies Detectados
            </h3>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{report.cookies.total}</div>
                <div className="stat-label">Total</div>
              </div>
              <div className="stat-card danger">
                <div className="stat-value">{report.cookies.tracking}</div>
                <div className="stat-label">Rastreamento</div>
              </div>
              <div className="stat-card success">
                <div className="stat-value">
                  {report.cookies.total - report.cookies.tracking}
                </div>
                <div className="stat-label">Funcionais</div>
              </div>
            </div>

            {/* Cookie Details */}
            {report.cookies.details && report.cookies.details.length > 0 && (
              <div className="cookie-list">
                {report.cookies.details.slice(0, 5).map((cookie, i) => (
                  <div key={i} className="cookie-item">
                    <div className="cookie-info">
                      <span className="cookie-name">{cookie.cookie}</span>
                      <span className="cookie-type">{cookie.type}</span>
                    </div>
                    <span className={`badge ${getRiskBadgeClass(cookie.risk)}`}>
                      {cookie.risk}
                    </span>
                  </div>
                ))}
                {report.cookies.details.length > 5 && (
                  <div className="more-items">
                    +{report.cookies.details.length - 5} outros cookies
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Risks */}
          {report.risks && report.risks.length > 0 && (
            <div className="section">
              <h3 className="section-title">
                <span className="icon">⚠️</span>
                Riscos Identificados
              </h3>
              <div className="risk-list">
                {report.risks.map((risk, i) => (
                  <div key={i} className="risk-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2L2 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" 
                            stroke="#ef4444" strokeWidth="2"/>
                    </svg>
                    <span>{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {report.recommendations && report.recommendations.length > 0 && (
            <div className="section">
              <h3 className="section-title">
                <span className="icon">💡</span>
                Recomendações
              </h3>
              <div className="recommendation-list">
                {report.recommendations.map((rec, i) => (
                  <div key={i} className="recommendation-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M9 11l3 3L22 4" stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" 
                            stroke="#10b981" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span>{rec}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <div className="footer-text">
          Protegendo sua privacidade online
        </div>
        <div className="footer-actions">
          <button className="text-btn" onClick={() => window.open('https://github.com/seu-repo', '_blank')}>
            Sobre
          </button>
          <button className="text-btn" onClick={() => window.open('https://privacy-policy.com', '_blank')}>
            Ajuda
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;