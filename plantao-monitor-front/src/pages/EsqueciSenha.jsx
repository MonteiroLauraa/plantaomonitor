import { useState } from 'react';
import api from '../services/api';
import './EsqueciSenha.css';

const EsqueciSenha = () => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSearch = async (e, type) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = type === 'username' ? { username } : { email };

            // Chama API que vai:
            // 1. Achar o user
            // 2. Gerar link Firebase
            // 3. Enviar email via runner
            await api.post('/auth/reset-password', payload);

            alert("Se os dados estiverem corretos, você receberá um email com instruções em breve.");
        } catch (error) {
            console.error(error);
            // Por segurança, não confirmamos erro de "usuário não existe"
            alert("Se os dados estiverem corretos, você receberá um email com instruções em breve.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="esqueci-senha-container">
            <div className="recuperar">
                <p>
                    Para redefinir sua senha, preencha seu usuário ou seu email abaixo. Se sua
                    conta for encontrada no banco de dados, um email será enviado para seu
                    endereço de email, com as instruções sobre como restabelecer seu acesso.
                </p>

                <h2>Buscar por identificação de usuário</h2>
                <form onSubmit={(e) => handleSearch(e, 'username')} className="recovery-form">
                    <label htmlFor="username">Identificação de <br /> usuário</label>
                    <input
                        type="text"
                        id="username"
                        name="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                    <button type="submit" className="btn" disabled={loading}>
                        {loading ? 'Buscando...' : 'Buscar'}
                    </button>
                </form>

                <h2 className="email-title">Buscar pelo endereço de email</h2>
                <form onSubmit={(e) => handleSearch(e, 'email')} className="recovery-form">
                    <label htmlFor="email">Endereço de <br /> email</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <button type="submit" className="btn" disabled={loading}>
                        {loading ? 'Buscando...' : 'Buscar'}
                    </button>
                </form>

                <hr className="divider" />
            </div>
        </div>
    );
};

export default EsqueciSenha;
