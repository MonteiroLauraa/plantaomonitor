import { Link, useLocation } from 'react-router-dom';
import '../index.css';
import logo from '../assets/logo.png';
import { usePermissoes } from '../hooks/useAuth';

const Sidebar = ({ isOpen, role, onClose }) => {
  const location = useLocation();


  const { temPermissao, loading } = usePermissoes();

  const menuOptions = [
    { label: "Gestão de Usuários", path: "/admin/usuarios", permission: "GERIR_USUARIOS" },
    { label: "Gestão de Regras", path: "/admin/regras", permission: "GERIR_REGRAS" },
    { label: "Incidentes", path: role === 'operator' ? "/operador/incidentes" : "/admin/incidentes", permission: "VER_INCIDENTES" },
    { label: "Escalas", path: role === 'operator' ? "/operador/escalas" : "/admin/escalas", permission: role === 'operator' ? null : "GERIR_USUARIOS" },
    { label: "Notificações", path: role === 'operator' ? "/operador/notificacoes" : "/admin/notificacoes", permission: null },
    { label: "Log e Auditoria", path: "/admin/logs", permission: "GERIR_USUARIOS" },
  ];

  if (loading) return null;

  return (
    <>

      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
      />

      <aside className={`sidebar ${isOpen ? 'sidebar-visible' : ''}`}>
        <div className="sidebar-logo">
          <img src={logo} alt="Logo Plantão" style={{ maxHeight: '50px' }} />
        </div>

        <nav className="sidebar-menu">
          <ul className="menu-list">
            <li>
              <Link
                to={role === 'operator' ? "/operador" : "/admin"}
                className={`menu-link ${location.pathname === (role === 'operator' ? "/operador" : "/admin") ? 'active' : ''}`}
                onClick={() => window.innerWidth < 768 && onClose && onClose()}
              >
                Início
              </Link>
            </li>

            {menuOptions.filter(item => !item.permission || temPermissao(item.permission)).map((link, index) => (
              <li key={index}>
                <Link
                  to={link.path}
                  className={`menu-link ${location.pathname === link.path ? 'active' : ''}`}
                  onClick={() => window.innerWidth < 768 && onClose && onClose()}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
        </div>
      </aside>


      <style>{`
        .sidebar {
            width: 260px;
            background: var(--cor-sidebar-bg);
            padding: 16px;
            display: flex;
            flex-direction: column;
            transition: transform 0.3s ease;
            height: 100vh;
            flex-shrink: 0; 
            border-right: 1px solid var(--cor-borda);
        }
        .menu-link { display: block; padding: 12px; color: var(--cor-sidebar-texto); text-decoration: none; border-radius: 6px; margin-bottom: 5px;}
        .menu-link:hover { background: var(--cor-sidebar-hover); color: #fff; }
        .menu-link.active { background: var(--cor-primaria); color: #fff; font-weight: bold; }
        .sidebar-footer { border-top: 1px solid #333; padding-top: 10px; margin-top: auto; }
        
        @media (max-width: 768px) {
            .sidebar { 
              position: fixed; 
              top: 0; 
              left: 0; 
              height: 100%; 
              z-index: 1000; 
              transform: translateX(-100%); 
              box-shadow: 2px 0 10px rgba(0,0,0,0.5);
            }
            .sidebar.sidebar-visible { transform: translateX(0); }
            .sidebar-overlay.visible { 
              position: fixed; 
              inset: 0; 
              background: rgba(0,0,0,0.6); 
              z-index: 900; 
              backdrop-filter: blur(2px);
            }
        }
      `}</style>
    </>
  );
};

export default Sidebar;