import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import { messaging, auth } from '../firebaseConfig';
import { getToken, onMessage } from "firebase/messaging";
import { onAuthStateChanged } from "firebase/auth";
import api from '../services/api';
import { iniciarNotificacoes } from '../services/notificationService';

const MainLayout = ({ role }) => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        iniciarNotificacoes(user.uid);
      }
    });

    const unsubscribeOnMessage = onMessage(messaging, (payload) => {
      console.log('Mensagem recebida em primeiro plano:', payload);
      const { title, body, icon } = payload.notification || {};
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: icon || '/vite.svg' });
      } else {
        alert(`${title}\n${body}`);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeOnMessage();
    };
  }, []);

  const [sessionRole, setSessionRole] = useState(sessionStorage.getItem('user_role'));

  useEffect(() => {
    const current = sessionStorage.getItem('user_role');
    if (current && current !== sessionRole) setSessionRole(current);
  }, []);

  const effectiveRole = sessionRole || role;

  return (
    <div className="app-container">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        role={effectiveRole}
      />

      <main className="content">
        <Header
          role={effectiveRole}
          onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
          userEmail={sessionStorage.getItem('user_email') || `${effectiveRole}@plantao.com`}
        />

        <section className="page-content">
          <Outlet />
        </section>
      </main>
    </div>
  );
};

export default MainLayout;