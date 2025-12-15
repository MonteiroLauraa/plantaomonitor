import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { auth } from '../firebaseConfig';
import { updatePassword, updateEmail } from 'firebase/auth';
import './GestaoRegras.css';

const Perfil = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [userDbId, setUserDbId] = useState(null);

    const [formData, setFormData] = useState({
        nome: '',
        email: '',
        foto_url: '',
        nova_senha: ''
    });

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        try {
            const uid = sessionStorage.getItem('user_uid') || auth.currentUser?.uid;
            if (!uid) return;

            const res = await api.get(`/check-user?uid=${uid}`);
            const user = res.data;

            setUserDbId(user.id);
            setFormData({
                nome: user.nome || '',
                email: user.email || '',
                foto_url: user.foto_url || '',
                nova_senha: ''
            });
        } catch (error) {
            console.error("Erro ao carregar perfil:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSalvar = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/usuarios/${userDbId}`, {
                nome: formData.nome,
                email: formData.email,
                foto_url: formData.foto_url
            });

            const firebaseUser = auth.currentUser;
            if (firebaseUser) {
                const currentEmail = firebaseUser.email ? firebaseUser.email.trim().toLowerCase() : '';
                const newEmail = formData.email ? formData.email.trim().toLowerCase() : '';
                if (newEmail && currentEmail && newEmail !== currentEmail) {
                    try {
                        await updateEmail(firebaseUser, formData.email.trim());
                    } catch (firError) {
                        console.error("Erro updateEmail Firebase:", firError);
                        alert(`Atenção: Seus dados foram salvos no banco, mas não foi possível alterar o email de login (Firebase). Erro: ${firError.code}`);
                    }
                }

                if (formData.nova_senha) {
                    try {
                        await updatePassword(firebaseUser, formData.nova_senha);
                    } catch (passError) {
                        console.error("Erro updatePassword:", passError);
                        alert(`Atenção: Senha não alterada. Erro: ${passError.code}`);
                    }
                }
            }

            sessionStorage.setItem('user_name', formData.nome);
            window.dispatchEvent(new Event('session-update'));

            alert("Perfil atualizado com sucesso!");
            window.location.reload();

        } catch (error) {
            console.error(error);
            alert("Erro ao atualizar: " + (error.message || "Verifique os dados"));
        }
    };

    if (loading) return <div style={{ color: '#fff', padding: '20px' }}>Carregando perfil...</div>;

    return (
        <div className="regras-container" style={{ maxWidth: '600px' }}>
            <div className="header-flex">
                <h1>Meu Perfil</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    overflow: 'hidden',
                    border: '3px solid #58a6ff',
                    background: '#21262d',
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    {formData.foto_url ? (
                        <img src={formData.foto_url} alt="Perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <span style={{ fontSize: '3rem' }}>👤</span>
                    )}
                </div>
                <small style={{ color: '#8b949e', marginTop: '10px' }}>Preview da Foto</small>
            </div>

            <form className="form-regra" onSubmit={handleSalvar}>

                <div className="form-group full-width">
                    <label>Nome Completo:</label>
                    <input type="text" name="nome" value={formData.nome} onChange={handleChange} required />
                </div>

                <div className="form-group full-width">
                    <label>E-mail:</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required />
                </div>

                <div className="form-group full-width">
                    <label>Link da Foto (URL):</label>
                    <input
                        type="text"
                        name="foto_url"
                        value={formData.foto_url}
                        onChange={handleChange}
                        placeholder="sua foto url"
                    />
                    <small style={{ color: '#666' }}>Cole um link </small>
                </div>

                <div className="form-group full-width" style={{ borderTop: '1px solid #30363d', paddingTop: '20px', marginTop: '10px' }}>
                    <label style={{ color: '#ff7b72' }}>Trocar Senha (Opcional):</label>
                    <input
                        type="password"
                        name="nova_senha"
                        value={formData.nova_senha}
                        onChange={handleChange}
                        placeholder="ou nao"
                        minLength={6}
                    />
                </div>

                <div className="full-width actions" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                    <button type="submit" className="btn-modern btn-primary">Salvar Alterações</button>
                    <button type="button" className="btn-modern btn-danger" onClick={() => navigate(-1)}>Cancelar</button>
                </div>
            </form>
        </div>
    );
};

export default Perfil;
