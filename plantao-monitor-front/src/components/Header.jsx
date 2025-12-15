import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Header.css';
import { auth } from '../firebaseConfig';
import { signOut } from "firebase/auth";

const Header = ({ role, onToggleSidebar }) => {
  const [notificacoes, setNotificacoes] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    buscaNotificacoes();
    const interval = setInterval(buscaNotificacoes, 10000);
    return () => clearInterval(interval);
  }, []);

  const buscaNotificacoes = async () => {
    try {
      const userId = sessionStorage.getItem('user_id');
      if (!userId) return;
      const res = await api.get(`/notificacoes/pendentes?id_usuario=${userId}`);
      setNotificacoes(res.data);
    } catch (e) {
      console.error("Erro ao buscar notificações");
    }
  };

  const handleClickNotificacao = async (notif) => {
    await api.put(`/notificacoes/${notif.id}/ler`);
    setNotificacoes(prev => prev.filter(n => n.id !== notif.id));
    if (notif.id_incidente) {
      const basePath = role === 'admin' ? '/admin' : '/operador';
      navigate(`${basePath}/incidentes/${notif.id_incidente}`);
    } else {
      console.log("Notificação de sistema (sem incidente linked)");
    }
    setShowMenu(false);
  };

  const [userName, setUserName] = useState('Usuário');
  const [userRole, setUserRole] = useState(role);
  const [userPhoto, setUserPhoto] = useState(null);

  useEffect(() => {

    const fetchUserData = async () => {
      const uid = sessionStorage.getItem('user_uid') || auth.currentUser?.uid;
      if (uid) {
        try {
          const res = await api.get(`/check-user?uid=${uid}`);
          if (res.data.foto_url) setUserPhoto(res.data.foto_url);
          setUserName(res.data.nome || 'Usuário');
        } catch (error) {
          console.error("Erro loading user header:", error);
        }
      }
    };

    fetchUserData();
    const storedName = sessionStorage.getItem('user_name');
    const storedRole = sessionStorage.getItem('user_role');

    if (storedName) setUserName(storedName);
    if (storedRole) setUserRole(storedRole);

    const handleStorageChange = () => {
      setUserName(sessionStorage.getItem('user_name') || 'Usuário');
      setUserRole(sessionStorage.getItem('user_role') || role);
      fetchUserData();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('session-update', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('session-update', handleStorageChange);
    };
  }, [role]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro logout firebase:", error);
    }
    sessionStorage.clear();
    navigate('/');
  };

  return (
    <header className="app-header">
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button
          className="menu-toggle-btn"
          onClick={onToggleSidebar}
          aria-label="Abrir menu"
        >
          ☰
        </button>
        <h3>Plantão Monitor <span style={{ fontSize: '0.8rem', color: '#aaa' }}>({userRole})</span></h3>
      </div>

      <div className="header-right">
        <div className="notification-bell" onClick={() => setShowMenu(!showMenu)}>
          ⩍
          {notificacoes.length > 0 && (
            <span className="badge">{notificacoes.length}</span>
          )}
        </div>


        {showMenu && (
          <div className="dropdown-menu">
            <h4 style={{ padding: '10px', borderBottom: '1px solid #555', margin: 0 }}>Alertas Recentes</h4>
            {notificacoes.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#aaa' }}>Nada novo por aqui.</div>
            ) : (
              notificacoes.map(n => (
                <div key={n.id} className="notif-item notif-critico" onClick={() => handleClickNotificacao(n)}>
                  <strong>!!! {n.nome_regra || 'Incidente'}</strong>
                  <p style={{ margin: 0, color: '#ccc' }}>{n.mensagem}</p>
                  <small style={{ color: '#888' }}>Clique pra ver detalhes</small>
                </div>
              ))
            )}
          </div>
        )}

        <div className="user-info-container" style={{ position: 'relative' }}>


          <div
            className="user-avatar-trigger"
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '5px', borderRadius: '4px' }}
          >
            {userPhoto ? (
              <img
                src={userPhoto}
                alt="User"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #58a6ff'
                }}
              />
            ) : (
              <span style={{ fontSize: '1.2rem' }}>👤</span>
            )}
            <span className="user-name-display">{userName}</span>
            <span style={{ fontSize: '0.8rem', color: '#888' }}>▼</span>
          </div>


          {showUserMenu && (
            <div className="user-dropdown">
              <div style={{ padding: '15px', borderBottom: '1px solid #444', textAlign: "center" }}>
                {userPhoto && (
                  <img
                    src={userPhoto}
                    alt="User"
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      marginBottom: '10px',
                      objectFit: 'cover',
                      border: '2px solid #58a6ff'
                    }}
                  />
                )}
                <div><strong>{userName}</strong></div>
                <small style={{ color: '#aaa' }}>{userRole}</small>
              </div>

              <button
                className="dropdown-item"
                onClick={() => navigate(role === 'admin' ? '/admin/perfil' : '/operador/perfil')}
              >
                Meu Perfil
              </button>

              <button
                className="dropdown-item"
                onClick={() => navigate(role === 'admin' ? '/admin/notificacoes' : '/operador/notificacoes')}
              >
                Preferências
              </button>

              <button
                className="dropdown-item logout"
                onClick={handleLogout}
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;