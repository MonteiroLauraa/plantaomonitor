import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import './Login.css';
import api from '../services/api';

const PaginaVisitante = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const checkStatus = async () => {
            const uid = sessionStorage.getItem('user_uid');
            if (!uid) return;

            try {
                const response = await api.get(`/check-user?uid=${uid}`);
                const user = response.data;

                // Se o papel mudou para algo aprovado
                if (user.role && user.role !== 'viewer' && user.role !== 'visitante') {
                    console.log("Papel atualizado! Redirecionando...", user.role);

                    // Atualiza Sessão
                    sessionStorage.setItem('user_role', user.role);
                    sessionStorage.setItem('user_name', user.nome);
                    sessionStorage.setItem('user_id', user.id);

                    // Notifica mudança global (se houver listeners)
                    window.dispatchEvent(new Event('session-update'));

                    // Redireciona
                    if (user.role === 'admin') navigate('/admin');
                    else navigate('/operador');
                }
            } catch (error) {
                console.error("Erro ao verificar status:", error);
            }
        };

        // Verifica imediatamente ao carregar
        checkStatus();

        // Verifica a cada 5 segundos (Polling)
        const interval = setInterval(checkStatus, 5000);

        return () => clearInterval(interval);
    }, [navigate]);

    return (
        <div className="login-wrapper">
            <div className="login-card" style={{ maxWidth: '600px' }}>
                <img src={logo} alt="Logo" className="login-logo" />

                <h1 style={{ color: '#0f7436' }}>Cadastro Realizado!</h1>

                <div style={{ margin: '30px 0', fontSize: '1.1rem', color: '#555' }}>
                    <p>Sua conta foi criada e está em <strong>análise</strong>.</p>
                    <p>Um administrador precisa aprovar seu cadastro e definir seu perfil de acesso.</p>
                    <p>Você receberá uma notificação por email assim que seu acesso for liberado.</p>
                    <p style={{ marginTop: '15px', fontSize: '0.9rem', color: '#888' }}>
                        <span className="loading-dots">Verificando liberação automaticamente...</span>
                    </p>
                </div>

                <hr className="divider" />

                <button onClick={() => window.location.reload()} className="btn" style={{ marginBottom: '10px', backgroundColor: '#007bff', color: 'white' }}>
                    Verificar Agora
                </button>

                <Link to="/" className="btn btn-login" style={{ backgroundColor: '#6c757d' }}>
                    Voltar para o Login
                </Link>
            </div>
        </div>
    );
};

export default PaginaVisitante;
