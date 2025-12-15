import { useState, useEffect } from 'react';
import api from '../services/api';
import { auth } from '../firebaseConfig';
import './GestaoRegras.css';

const Preferencias = () => {
    const [formData, setFormData] = useState({
        recebe_email: true,
        recebe_push: true,
        som_email: 'default',
        som_push: 'default',
        inicio_nao_perturbe: '00:00',
        fim_nao_perturbe: '23:59'
    });
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        carregarPreferencias();
    }, []);

    const carregarPreferencias = async () => {
        try {
            const sessaoId = sessionStorage.getItem('user_id');

            if (!sessaoId) {
                console.warn("Sem ID de sessão. Redirecionando login...");
                return;
            }

            setUserId(sessaoId);
            const res = await api.get(`/usuarios/${sessaoId}`);

            if (res.data) {
                setFormData({
                    recebe_email: res.data.recebe_email ?? true,
                    recebe_push: res.data.recebe_push ?? true,
                    som_email: res.data.som_email || 'default',
                    som_push: res.data.som_push || 'default',
                    inicio_nao_perturbe: res.data.inicio_nao_perturbe || '00:00',
                    fim_nao_perturbe: res.data.fim_nao_perturbe || '23:59'
                });
            }
        } catch (e) {
            console.error("Erro ao carregar preferências", e);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSalvar = async (e) => {
        e.preventDefault();
        try {
            if (!userId) {
                alert("Erro: Usuário não identificado. Faça login novamente.");
                return;
            }
            await api.put(`/usuarios/${userId}/preferencias`, formData);
            alert("Preferências salvas com sucesso!");
        } catch (e) {
            alert("Erro ao salvar: " + e.message);
        }
    };

    if (loading) return <div>Carregando...</div>;

    return (
        <div className="regras-container">
            <div className="header-flex">
                <h1>Minhas Preferências de Notificação</h1>
            </div>

            <div className="form-container" style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
                <form onSubmit={handleSalvar}>

                    <fieldset style={{ border: '1px solid #444', padding: '15px', marginBottom: '20px', borderRadius: '6px' }}>
                        <legend style={{ padding: '0 5px', color: '#307c10ff' }}>Notificações por Email</legend>

                        <div style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    name="recebe_email"
                                    checked={formData.recebe_email}
                                    onChange={handleChange}
                                    style={{ width: '20px', height: '20px' }}
                                />
                                Habilitar notificações por email
                            </label>
                        </div>

                        <div className="form-group">
                            <label>Som da Notificação por email:</label>
                            <input
                                type="text"
                                name="som_email"
                                value={formData.som_email}
                                onChange={handleChange}
                                placeholder="default"
                            />
                        </div>
                    </fieldset>

                    <fieldset style={{ border: '1px solid #444', padding: '15px', marginBottom: '20px', borderRadius: '6px' }}>
                        <legend style={{ padding: '0 5px', color: '#307c10ff' }}>Notificações pelo sistema (Push)</legend>

                        <div style={{ marginBottom: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    name="recebe_push"
                                    checked={formData.recebe_push}
                                    onChange={handleChange}
                                    style={{ width: '20px', height: '20px' }}
                                />
                                Habilitar notificações pelo sistema
                            </label>
                        </div>

                        <div className="form-group">
                            <label>Som da Notificação pelo sistema:</label>
                            <input
                                type="text"
                                name="som_push"
                                value={formData.som_push}
                                onChange={handleChange}
                                placeholder="default"
                            />
                        </div>
                    </fieldset>

                    <fieldset style={{ border: '1px solid #444', padding: '15px', marginBottom: '20px', borderRadius: '6px' }}>
                        <legend style={{ padding: '0 5px', color: '#307c10ff' }}>Janela de Alerta (Não-Perturbe)</legend>
                        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '15px' }}>
                            As notificações só serão enviadas dentro deste intervalo de horário.
                        </p>

                        <div style={{ display: 'flex', gap: '20px' }}>
                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Hora de Início:</label>
                                <input
                                    type="time"
                                    name="inicio_nao_perturbe"
                                    value={formData.inicio_nao_perturbe}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group" style={{ flex: 1 }}>
                                <label>Hora de Fim:</label>
                                <input
                                    type="time"
                                    name="fim_nao_perturbe"
                                    value={formData.fim_nao_perturbe}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </fieldset>

                    <button type="submit" className="btn-modern btn-primary" style={{ width: '100%', padding: '15px' }}>
                        Salvar Preferências
                    </button>

                </form>
            </div>
        </div>
    );
};

export default Preferencias;
