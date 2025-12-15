import { useState, useEffect } from 'react';
import api from '../services/api';

export const usePermissoes = () => {
    const [permissoes, setPermissoes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const carregarPermissoes = async () => {
            const userId = sessionStorage.getItem('user_id');
            if (!userId) {
                setLoading(false);
                return;
            }

            try {

                const res = await api.get(`/usuarios/${userId}/permissoes-calculadas`);

                const listaAtiva = res.data
                    .filter(p => p.ativo_final === true)
                    .map(p => p.codigo);

                setPermissoes(listaAtiva);

                sessionStorage.setItem('user_permissions', JSON.stringify(listaAtiva));
            } catch (error) {
                console.error("Erro carregando permissões:", error);
            } finally {
                setLoading(false);
            }
        };

        carregarPermissoes();
    }, []);

    const temPermissao = (codigo) => {
        return permissoes.includes(codigo);
    };

    return { temPermissao, loading, permissoes };
};
