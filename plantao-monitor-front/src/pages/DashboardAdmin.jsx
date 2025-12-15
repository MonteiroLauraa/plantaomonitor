import { useState, useEffect } from 'react';
import api from '../services/api';
import './DashboardAdmin.css';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { Activity, Server, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

const DashboardAdmin = () => {
    const [kpis, setKpis] = useState([]);
    const [statusSistema, setStatusSistema] = useState({ status: 'LOADING', ultima_vez: null });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        carregarDados();
        const interval = setInterval(carregarDados, 30000);
        return () => clearInterval(interval);
    }, []);

    const carregarDados = async () => {
        try {
            const [resKpi, resStatus] = await Promise.all([
                api.get('/dashboard/kpis'),
                api.get('/sistema/status')
            ]);
            setKpis(resKpi.data);
            setStatusSistema(resStatus.data);
        } catch (e) {
            console.error("Erro ao carregar dashboard:", e);
        } finally {
            setLoading(false);
        }
    };


    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    if (loading) return <div style={{ color: 'white', padding: '20px' }}>Carregando Dashboard...</div>;

    return (
        <div className="dashboard-container">
            <h1>Olá, Querolino !</h1>

            <div className="metrics-grid">

                <div className="metrica-card">
                    <div className="metrica-header">
                        <h3>Regras Monitoradas</h3>
                        <Activity color="#0f7436" size={20} />
                    </div>
                    <div>
                        <p className="metrica-value">{kpis.length}</p>
                        <p className="metrica-sub">Ativas no sistema</p>
                    </div>
                </div>

                <div className="metrica-card">
                    <div className="metrica-header">
                        <h3>Tempo Médio Resolução (MTTR)</h3>
                        <Clock color="#0f7436" size={20} />
                    </div>
                    <div>
                        <p className="metrica-value">
                            {kpis.length > 0
                                ? (kpis.reduce((acc, curr) => acc + (curr.mttr_minutos || 0), 0) / kpis.length).toFixed(1)
                                : 0} min
                        </p>
                        <p className="metrica-sub">Média Global</p>
                    </div>
                </div>

                <div className="metrica-card">
                    <div className="metrica-header">
                        <h3>Incidentes Hoje</h3>
                        <AlertTriangle color="#0f7436" size={20} />
                    </div>
                    <div>
                        <p className="metrica-value">
                            {kpis.reduce((acc, curr) => acc + (curr.incidentes_abertos || 0), 0)}
                        </p>
                        <p className="metrica-sub">Abertos no momento</p>
                    </div>
                </div>

            </div>


            <div className="chart-grid">

                <div className="chart-card">
                    <h3>Tempo Médio de Resolução (min)</h3>
                    <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={kpis}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="nome" stroke="#888" tick={{ fontSize: 12 }} />
                                <YAxis stroke="#888" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #333', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    cursor={{ fill: '#2a2a2a' }}
                                />
                                <Legend />
                                <Bar dataKey="mttr_minutos" name="Tempo Resolução (min)" fill="#0f7436" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="mtta_minutos" name="Tempo ACK (min)" fill="#ffc107" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-card">
                    <h3> Falhas de Execução (Query Errors)</h3>
                    <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={kpis} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis type="number" stroke="#888" />
                                <YAxis dataKey="nome" type="category" width={150} stroke="#888" tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #333', color: '#fff' }}
                                    cursor={{ fill: '#2a2a2a' }}
                                />
                                <Legend />
                                <Bar dataKey="total_erros" name="Erros" fill="#dc3545" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="total_execucoes" name="Total Execuções" fill="#0f7436" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default DashboardAdmin;
