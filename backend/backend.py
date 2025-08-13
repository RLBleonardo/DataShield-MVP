from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import logging
from urllib.parse import urlparse

app = Flask(__name__)
CORS(app)

# Configurar logging para debug
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

@app.route('/audit', methods=['POST'])
def audit():
    try:
        data = request.json
        logger.debug(f"Dados recebidos: {data}")
        
        url = data.get('url')
        cookies = data.get('cookies', [])
        
        if not url:
            return jsonify({'error': 'URL não fornecida'}), 400
        
        logger.info(f"Analisando URL: {url}")
        logger.info(f"Cookies recebidos: {len(cookies)} cookies")
        
        risks = []
        warnings = []
        
        # Análise detalhada de cookies
        cookie_analysis = analyze_cookies(cookies)
        risks.extend(cookie_analysis['risks'])
        
        # Informações do domínio
        domain = urlparse(url).netloc
        
        # Tentar acessar o conteúdo da página
        page_content = None
        page_access_error = None
        
        try:
            # Headers mais completos para parecer um navegador real
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0',
            }
            
            # Criar sessão para manter cookies
            session = requests.Session()
            session.headers.update(headers)
            
            response = session.get(url, timeout=10, allow_redirects=True)
            response.raise_for_status()
            
            logger.info(f"Status da resposta: {response.status_code}")
            page_content = response.text
            
        except requests.HTTPError as e:
            if e.response.status_code == 403:
                page_access_error = "Site bloqueou acesso automatizado (403 Forbidden)"
                warnings.append("Não foi possível analisar o conteúdo da página devido a proteções do site")
            elif e.response.status_code == 401:
                page_access_error = "Site requer autenticação (401)"
            else:
                page_access_error = f"Erro HTTP: {e.response.status_code}"
            logger.warning(f"Erro ao acessar URL: {page_access_error}")
            
        except requests.RequestException as e:
            page_access_error = f"Erro de conexão: {str(e)}"
            logger.error(f"Erro ao acessar URL: {e}")
        
        # Se conseguiu acessar o conteúdo, analisar
        if page_content:
            content_analysis = analyze_page_content(page_content)
            risks.extend(content_analysis['risks'])
        
        # Análise baseada apenas na URL e cookies (sempre funciona)
        url_analysis = analyze_url_pattern(url, domain)
        risks.extend(url_analysis['risks'])
        
        # Criar relatório detalhado
        report = create_privacy_report(
            url=url,
            domain=domain,
            cookies=cookies,
            cookie_analysis=cookie_analysis,
            risks=risks,
            warnings=warnings,
            page_accessible=(page_content is not None)
        )
        
        return jsonify(report)
        
    except Exception as e:
        logger.error(f"Erro geral no audit: {e}", exc_info=True)
        return jsonify({
            'error': f'Erro no servidor: {str(e)}',
            'risks': [],
            'total': 0
        }), 500

def analyze_cookies(cookies):
    """Análise detalhada dos cookies"""
    risks = []
    cookie_types = {
        'tracking': [],
        'analytics': [],
        'advertising': [],
        'functional': [],
        'session': []
    }
    
    # Padrões conhecidos de cookies
    patterns = {
        # Analytics
        '_ga': ('Google Analytics', 'analytics', 'Alto'),
        '_gid': ('Google Analytics ID', 'analytics', 'Alto'),
        '_gcl_au': ('Google Ads Conversion', 'advertising', 'Alto'),
        '_ga_': ('Google Analytics 4', 'analytics', 'Alto'),
        
        # Social Media
        '_fbp': ('Facebook Pixel', 'advertising', 'Alto'),
        'fbm_': ('Facebook', 'advertising', 'Alto'),
        
        # Other trackers
        'ph_': ('PostHog Analytics', 'analytics', 'Médio'),
        'posthog': ('PostHog Analytics', 'analytics', 'Médio'),
        '__utm': ('UTM Campaign Tracking', 'tracking', 'Médio'),
        
        # Session/Auth
        'jwt': ('JSON Web Token', 'session', 'Baixo'),
        'auth': ('Authentication', 'session', 'Baixo'),
        'session': ('Session', 'session', 'Baixo'),
        '__client': ('Client Identification', 'functional', 'Médio'),
        '__clerk': ('Clerk Auth', 'session', 'Baixo'),
        
        # State
        'sidebar_state': ('UI State', 'functional', 'Baixo'),
        'arena-auth': ('Arena Authentication', 'session', 'Baixo')
    }
    
    analyzed_cookies = []
    
    for cookie in cookies:
        cookie_lower = cookie.lower() if isinstance(cookie, str) else str(cookie).lower()
        cookie_matched = False
        
        for pattern, (name, category, risk_level) in patterns.items():
            if pattern in cookie_lower:
                cookie_types[category].append(cookie)
                analyzed_cookies.append({
                    'cookie': cookie,
                    'type': name,
                    'category': category,
                    'risk': risk_level
                })
                
                if risk_level == 'Alto':
                    risks.append(f'Cookie de alto risco detectado: {name} ({cookie})')
                elif risk_level == 'Médio':
                    risks.append(f'Cookie de risco médio: {name}')
                
                cookie_matched = True
                break
        
        if not cookie_matched:
            analyzed_cookies.append({
                'cookie': cookie,
                'type': 'Desconhecido',
                'category': 'unknown',
                'risk': 'Baixo'
            })
    
    # Resumo
    total_tracking = len(cookie_types['tracking']) + len(cookie_types['analytics']) + len(cookie_types['advertising'])
    
    if total_tracking > 5:
        risks.append(f'Número elevado de cookies de rastreamento: {total_tracking}')
    
    return {
        'risks': risks,
        'cookie_types': cookie_types,
        'analyzed': analyzed_cookies,
        'total_tracking': total_tracking
    }

def analyze_page_content(html_content):
    """Analisa o conteúdo HTML da página"""
    risks = []
    
    try:
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Verificar scripts de terceiros
        scripts = soup.find_all('script', src=True)
        third_party_scripts = {
            'googletagmanager.com': 'Google Tag Manager',
            'google-analytics.com': 'Google Analytics',
            'facebook.com': 'Facebook',
            'doubleclick.net': 'Google Ads',
            'cloudflare.com': 'Cloudflare Analytics',
            'hotjar.com': 'Hotjar',
            'segment.com': 'Segment Analytics'
        }
        
        detected_scripts = []
        for script in scripts:
            src = script.get('src', '')
            for domain, name in third_party_scripts.items():
                if domain in src:
                    detected_scripts.append(name)
                    risks.append(f'Script de rastreamento encontrado: {name}')
        
        # Verificar iframes de terceiros
        iframes = soup.find_all('iframe')
        if iframes:
            risks.append(f'{len(iframes)} iframe(s) detectado(s) - possível conteúdo de terceiros')
        
    except Exception as e:
        logger.error(f"Erro ao analisar conteúdo: {e}")
    
    return {'risks': risks}

def analyze_url_pattern(url, domain):
    """Analisa padrões na URL"""
    risks = []
    
    # Verificar se é um site conhecido com problemas de privacidade
    high_risk_domains = {
        'facebook.com': 'Plataforma com histórico de problemas de privacidade',
        'tiktok.com': 'Coleta extensiva de dados',
        'amazon.com': 'Rastreamento extensivo de comportamento'
    }
    
    for risk_domain, reason in high_risk_domains.items():
        if risk_domain in domain:
            risks.append(f'Domínio de alto risco: {reason}')
    
    # Verificar se há IDs de rastreamento na URL
    if any(param in url.lower() for param in ['utm_', 'fbclid=', 'gclid=', 'tracking']):
        risks.append('Parâmetros de rastreamento detectados na URL')
    
    return {'risks': risks}

def create_privacy_report(url, domain, cookies, cookie_analysis, risks, warnings, page_accessible):
    """Cria relatório completo de privacidade"""
    
    # Calcular score de privacidade (0-100, onde 100 é mais privado)
    privacy_score = 100
    privacy_score -= cookie_analysis['total_tracking'] * 5  # -5 por cookie de tracking
    privacy_score -= len(risks) * 3  # -3 por cada risco
    privacy_score = max(0, privacy_score)  # Não deixar ficar negativo
    
    # Classificação
    if privacy_score >= 80:
        classification = "Boa proteção de privacidade"
        color = "green"
    elif privacy_score >= 50:
        classification = "Proteção moderada"
        color = "yellow"
    else:
        classification = "Proteção baixa - Atenção necessária"
        color = "red"
    
    return {
        'url': url,
        'domain': domain,
        'status': 'success',
        'page_accessible': page_accessible,
        'privacy_score': privacy_score,
        'classification': classification,
        'classification_color': color,
        'risks': risks if risks else ['Nenhum risco significativo detectado'],
        'warnings': warnings,
        'total_risks': len(risks),
        'cookies': {
            'total': len(cookies),
            'tracking': cookie_analysis['total_tracking'],
            'details': cookie_analysis['analyzed']
        },
        'recommendations': generate_recommendations(risks, cookie_analysis)
    }

def generate_recommendations(risks, cookie_analysis):
    """Gera recomendações baseadas nos riscos encontrados"""
    recommendations = []
    
    if cookie_analysis['total_tracking'] > 3:
        recommendations.append("Use uma extensão de bloqueio de cookies/trackers")
    
    if any('Google' in risk for risk in risks):
        recommendations.append("Considere usar alternativas ao Google para maior privacidade")
    
    if any('Facebook' in risk or 'Meta' in risk for risk in risks):
        recommendations.append("Limite o compartilhamento de dados com redes sociais")
    
    if len(risks) > 5:
        recommendations.append("Este site coleta muitos dados - leia a política de privacidade")
        recommendations.append("Considere usar modo incógnito ou navegador focado em privacidade")
    
    if not recommendations:
        recommendations.append("Continue monitorando regularmente")
    
    return recommendations

@app.route('/health', methods=['GET'])
def health():
    """Endpoint para verificar se o servidor está funcionando"""
    return jsonify({
        'status': 'healthy',
        'version': '2.0'
    })

if __name__ == '__main__':
    logger.info("Iniciando servidor Flask na porta 5000...")
    app.run(port=5000, debug=True, host='0.0.0.0')