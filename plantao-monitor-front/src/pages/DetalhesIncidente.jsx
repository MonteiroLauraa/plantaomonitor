import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Incidentes.css';

const DetalhesIncidente = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incidente, setIncidente] = useState(null);
  const [regra, setRegra] = useState(null);

  const usuarioLogado = sessionStorage.getItem('user_email') || sessionStorage.getItem('user_name');

  useEffect(() => {
    carregarDados();
  }, [id]);

  const carregarDados = async () => {
    try {
      const resInc = await api.get(`/incidentes/${id}`);
      setIncidente(resInc.data);

      if (resInc.data.id_regra) {

        const resRegra = await api.get('/regras');
        const r = resRegra.data.find(x => (x.id || x.id_regra) === resInc.data.id_regra);
        setRegra(r);
      }
    } catch (error) {
      console.error("Erro ao carregar:", error);

    }
  };

  const handleAcao = async (tipoAcao) => {
    try {
      let endpoint = '';
      const body = { usuario: usuarioLogado || 'Admin' };

      if (tipoAcao === 'ACK') {
        endpoint = `/incidentes/${id}/ack`;
      }

      if (tipoAcao === 'CLOSE') {
        const motivo = window.prompt("Deseja adicionar um comentário de fechamento? (Opcional)");
        if (motivo === null) return;

        endpoint = `/incidentes/${id}/close`;
        body.comentario = motivo;
      }

      if (tipoAcao === 'REEXECUTE') {
        endpoint = `/incidentes/${id}/reexecute`;
      }

      await api.post(endpoint, body);

      alert(`Ação ${tipoAcao} realizada com sucesso!`);
      carregarDados();
    } catch (e) {
      console.error(e);
      alert("Erro na ação: " + (e.response?.data?.error || e.message));
    }
  };

  if (!incidente) {
    return (
      <div className="incidentes-container">
        <h2 style={{ color: 'white' }}>Carregando incidente...</h2>
        <button className="btn-voltar" onClick={() => navigate('/admin/incidentes')}>
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="incidentes-container">
      <h1>Detalhes do Incidente #{incidente.id_incidente}</h1>

      <div className="detalhes-card">
        <h2>{regra ? regra.nome : `Regra ID ${incidente.id_regra}`}</h2>
        <hr style={{ borderColor: '#333' }} />

        <h3>Descrição Detalhada / Log</h3>
        <p>{incidente.detalhes}</p>

        <h3>Status Atual</h3>
        <p className={`status-${incidente.status ? incidente.status.toLowerCase() : 'open'}`}>
          {incidente.status}
        </p>
        {incidente.comentario_resolucao && (
          <div style={{ marginTop: '20px', background: '#2c2c3e', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #0f7436' }}>
            <strong> Notas:</strong>
            <p style={{ margin: '5px 0 0 0', color: '#ccc' }}>{incidente.comentario_resolucao}</p>
          </div>
        )}

        <div className="actions-footer">
          <h3>Ações:</h3>

          {incidente.status === 'OPEN' && (
            <button className="btn-ack" onClick={() => handleAcao('ACK')}>ACK (Reconhecer)</button>
          )}

          {incidente.status !== 'CLOSED' && (
            <button className="btn-close" onClick={() => handleAcao('CLOSE')}>CLOSE (Fechar)</button>
          )}

          <button className="btn-reexecute" onClick={() => handleAcao('REEXECUTE')}>REEXECUTE (Robô)</button>
        </div>
      </div>

      <button className="btn-voltar" onClick={() => navigate('/admin/incidentes')}>
        Voltar ao Painel
      </button>
    </div>
  );
};

export default DetalhesIncidente;