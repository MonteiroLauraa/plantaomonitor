import { useState, useEffect } from 'react';
import api from '../services/api';
import './Incidentes.css';

const LogAuditoria = () => {
  const [logs, setLogs] = useState([]);

  const [filtros, setFiltros] = useState({ responsavel: '', alvo: '', incidente: '' });

  useEffect(() => {
    carregarLogs();
  }, []);

  const carregarLogs = async () => {
    try {
      const params = {};
      if (filtros.responsavel) params.responsavel = filtros.responsavel;
      if (filtros.alvo) params.alvo = filtros.alvo;
      if (filtros.incidente) params.incidente = filtros.incidente;

      const res = await api.get('/logs', { params });
      setLogs(res.data);
    } catch (e) {
      console.error("Erro ao carregar logs", e);
    }
  };

  const handleChange = (e) => {
    setFiltros({ ...filtros, [e.target.name]: e.target.value });
  };

  const handleFiltrar = (e) => {
    e.preventDefault();
    carregarLogs();
  };

  return (
    <div className="incidentes-container">
      <h1>Log de Auditoria e Rastreabilidade</h1>
      <p style={{ color: '#aaa', marginBottom: '20px' }}>
        Histórico completo de ações realizadas no sistema (Admin, Operadores e Robôs).
      </p>

      <form onSubmit={handleFiltrar} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          name="responsavel"
          placeholder="Filtrar por Responsável..."
          value={filtros.responsavel}
          onChange={handleChange}
          className="form-control"
          style={{ flex: 1, minWidth: '200px' }}
        />
        <input
          type="text"
          name="alvo"
          placeholder="Filtrar por Alvo/Regra..."
          value={filtros.alvo}
          onChange={handleChange}
          className="form-control"
          style={{ flex: 1, minWidth: '200px' }}
        />
        <input
          type="text"
          name="incidente"
          placeholder="ID ou Detalhes do Incidente..."
          value={filtros.incidente}
          onChange={handleChange}
          className="form-control"
          style={{ flex: 1, minWidth: '200px' }}
        />
        <button type="submit" className="btn-save" style={{ padding: '10px 20px', height: '42px' }}>
          Filtrar
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Data/Hora</th>
            <th>Responsável</th>
            <th>Ação</th>
            <th>Alvo</th>
            <th>Detalhes</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id}>
              <td data-label="ID">#{log.id}</td>
              <td data-label="Data/Hora">{new Date(log.timestamp).toLocaleString()}</td>
              <td data-label="Responsável" style={{ color: '#fff', fontWeight: 'bold' }}>{log.responsavel || '-'}</td>
              <td data-label="Ação">
                <span style={{
                  color: (log.acao || '').includes('CRIAR') ? '#28a745' : ((log.acao || '').includes('INCIDENTE') ? '#ffc107' : '#0d6efd'),
                  fontWeight: 'bold'
                }}>
                  {log.acao || 'N/A'}
                </span>
              </td>
              <td data-label="Alvo">{log.alvo || '-'}</td>
              <td data-label="Detalhes" style={{ color: '#ccc', fontSize: '0.9rem' }}>{log.detalhes || '-'}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan="6" style={{ textAlign: 'center' }}>Nenhum registro encontrado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LogAuditoria;