require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const admin = require("firebase-admin");

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const app = express();
app.use(express.json());
app.use(cors());

const PORT = 8000;
const DATABASE_URL = process.env.DATABASE_URL;

console.log("INICIANDO API...");

try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase: Start.");
} catch (e) {
  console.warn("Firebase não configurado:", e.message);
}


const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.connect().then(async client => {
  console.log("Banco de Dados: Conectado.");
  const res = await client.query("SELECT current_database(), current_user");
  console.log("DB Info:", res.rows[0]);
  client.release();
}).catch(e => {
  console.error("Erro Banco:", e.message);
});


const TABLES = {
  usuarios: { name: "usuarios", pk: "id", cols: ["firebase_uid", "nome", "email", "matricula", "role", "recebe_push", "recebe_email", "som_push", "som_email", "start_time", "end_time", "inicio_nao_perturbe", "fim_nao_perturbe", "foto_url", "profile_type"] },
  regras: { name: "regras", pk: "id", cols: ["nome", "descricao", "sql", "active", "minuto_atualizacao", "hora_inicio", "hora_final", "banco_alvo", "qtd_erro_max", "prioridade", "usuario_id", "role_target", "email_notificacao", "roles", "silenciado_ate"] },
  escalas: { name: "escalas", pk: "id", cols: ["id_usuario", "id_usuario_original", "canal", "data_inicio", "data_fim", "status_confirmacao"] },
  permissoes: { name: "permissoes", pk: "id", cols: ["codigo", "descricao"] },
  permissoes_roles: { name: "permissoes_roles", pk: "id", cols: ["role", "permissao_id", "ativo"] },
  permissoes_usuarios: { name: "permissoes_usuarios", pk: "id", cols: ["usuario_id", "permissao_id", "ativo", "is_customizado"] },
  usuarios_roles: { name: "usuarios_roles", pk: "id", cols: ["id_usuario", "role_name"] },
  execucoes_regras: { name: "execucoes_regras", pk: "id_execucao", cols: ["id_regra", "data_inicio", "data_fim", "sucesso", "resultado_json", "linhas_afetadas", "erro_mensagem"] },
  incidentes: { name: "incidentes", pk: "id_incidente", cols: ["id_regra", "status", "prioridade", "detalhes", "comentario_resolucao", "data_abertura", "data_ultima_ocorrencia", "id_execucao_origem"] },
  eventos_incidente: { name: "eventos_incidente", pk: "id", cols: ["id_incidente", "tipo", "usuario", "detalhes", "timestamp"] },
  fila_runner: { name: "fila_runner", pk: "id", cols: ["id_regra", "status", "agendado_para"] },
  dispositivos_usuarios: { name: "dispositivos_usuarios", pk: "id", cols: ["id_usuario", "push_token", "tipo_dispositivo", "ultimo_acesso", "ativo"] },
  notificacoes: { name: "notificacoes", pk: "id", cols: ["id_usuario", "id_incidente", "canal", "destinatario", "titulo", "mensagem", "status", "lida", "metadados"] },
  logs: { name: "logs_auditoria", pk: "id", cols: ["responsavel", "acao", "alvo", "detalhes", "timestamp"] },
  sistema_status: { name: "sistema_status", pk: "id", cols: ["servico", "ultimo_batimento", "status"] },
  metricas_diarias: { name: "metricas_diarias", pk: "id", cols: ["data_referencia", "id_regra", "total_execucoes", "total_erros", "tempo_medio_execucao_ms", "incidentes_abertos", "mttr_minutos", "mtta_minutos", "updated_at"] }
};

app.get('/notificacoes/pendentes', async (req, res) => {
  const { id_usuario } = req.query;
  if (!id_usuario) return res.json([]);

  const client = await pool.connect();
  try {
    const q = `

            SELECT n.*, r.nome as nome_regra
            FROM notificacoes n
            JOIN usuarios u ON n.id_usuario = u.id 
            LEFT JOIN incidentes i ON n.id_incidente = i.id_incidente
            LEFT JOIN regras r ON i.id_regra = r.id
            WHERE n.id_usuario = $1
              AND n.lida = false
              AND COALESCE(u.recebe_push, true) = true -- VISIBILIDADE NA UI SEGUE O PUSH
            ORDER BY n.created_at DESC
        `;
    const { rows } = await client.query(q, [id_usuario]);
    res.json(rows);
  } catch (e) {
    console.error("Erro busca notificacoes:", e);
    res.status(500).json({ error: e.message });
  }
  finally { client.release(); }
});

app.put('/notificacoes/:id/ler', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("UPDATE notificacoes SET lida = true WHERE id = $1", [req.params.id]);
    res.json({ message: "Lida" });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get("/check-user", async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).json({ error: "UID obrigatório" });
  const client = await pool.connect();
  try {
    const result = await client.query("SELECT * FROM usuarios WHERE firebase_uid = $1", [uid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Não encontrado" });
    res.json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/incidentes/:id/ack', async (req, res) => {
  const client = await pool.connect();
  try {
    const { usuario } = req.body;
    await client.query("UPDATE incidentes SET status = 'ACK' WHERE id_incidente = $1", [req.params.id]);
    await client.query("INSERT INTO eventos_incidente (id_incidente, tipo, usuario, detalhes) VALUES ($1, 'ACK', $2, 'Incidente reconhecido')", [req.params.id, usuario || 'Operador']);
    await logAudit(client, usuario, 'INCIDENTE_ACK', `Incidente ${req.params.id}`, 'Reconhecido pelo operador');
    res.json({ message: "OK" });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/incidentes/:id/close', async (req, res) => {
  const client = await pool.connect();
  try {
    const { usuario, comentario } = req.body;
    await client.query(
      "UPDATE incidentes SET status = 'CLOSED', comentario_resolucao = $2 WHERE id_incidente = $1",
      [req.params.id, comentario]
    );

    await client.query(
      "INSERT INTO eventos_incidente (id_incidente, tipo, usuario, detalhes) VALUES ($1, 'CLOSE', $2, $3)",
      [req.params.id, usuario || 'Operador', `Fechado: ${comentario || 'Sem detalhes'}`]
    );
    await logAudit(client, usuario || 'Admin', 'INCIDENTE_CLOSE', `Incidente #${req.params.id}`, 'Status CLOSED');

    res.json({ message: "OK" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/incidentes/:id/reexecute', async (req, res) => {
  const client = await pool.connect();
  try {
    const resInc = await client.query("SELECT id_regra FROM incidentes WHERE id_incidente = $1", [req.params.id]);
    if (resInc.rows.length === 0) return res.status(404).json({ error: "Incidente não achado" });
    const idRegra = resInc.rows[0].id_regra;
    await client.query("INSERT INTO fila_runner (id_regra, status, agendado_para) VALUES ($1, 'pendente', NOW())", [idRegra]);
    await logAudit(client, req.body.usuario || 'Operador', 'INCIDENTE_REEXECUTE', `Incidente ${req.params.id}`, 'Solicitada reexecução');
    res.json({ message: "Agendado" });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/sistema/matriz-permissoes', async (req, res) => {
  const client = await pool.connect();
  try {
    const perms = await client.query("SELECT * FROM permissoes ORDER BY id");
    const configs = await client.query("SELECT role, permissao_id, ativo FROM permissoes_roles");
    res.json({ permissoes: perms.rows, configuracoes: configs.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/sistema/toggle-permissao', async (req, res) => {
  const { role, permissao_id, ativo } = req.body;
  const client = await pool.connect();
  try {
    await client.query(`INSERT INTO permissoes_roles (role, permissao_id, ativo) VALUES ($1, $2, $3) ON CONFLICT (role, permissao_id) DO UPDATE SET ativo = $3`, [role, permissao_id, ativo]);
    await logAudit(client, 'Admin', 'PERMISSAO_ROLE_CHANGE', `Role: ${role}`, `Permissão ID ${permissao_id} set to ${ativo}`);
    res.json({ message: "OK" });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/usuarios/:id/permissoes-calculadas', async (req, res) => {
  const client = await pool.connect();
  try {
    const uRes = await client.query("SELECT role FROM usuarios WHERE id = $1", [req.params.id]);
    if (uRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const userRole = uRes.rows[0].role;
    const q = `SELECT p.id as permissao_id, p.codigo, p.descricao, COALESCE(pu.ativo, pr.ativo, false) as ativo_final, COALESCE(pu.is_customizado, false) as is_customizado FROM permissoes p LEFT JOIN permissoes_roles pr ON pr.permissao_id = p.id AND pr.role = $1 LEFT JOIN permissoes_usuarios pu ON pu.permissao_id = p.id AND pu.usuario_id = $2 ORDER BY p.id`;
    const result = await client.query(q, [userRole, req.params.id]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/usuarios/:id/toggle-permissao', async (req, res) => {
  const { permissao_id, ativo } = req.body;
  const client = await pool.connect();
  try {
    await client.query(`INSERT INTO permissoes_usuarios (usuario_id, permissao_id, ativo, is_customizado) VALUES ($1, $2, $3, true) ON CONFLICT (usuario_id, permissao_id) DO UPDATE SET ativo = $3, is_customizado = true`, [req.params.id, permissao_id, ativo]);
    await logAudit(client, 'Admin', 'PERMISSAO_USER_CHANGE', `User ID: ${req.params.id}`, `Permissão ID ${permissao_id} set to ${ativo}`);
    res.json({ message: "OK" });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/usuarios/:id/roles', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT role_name FROM usuarios_roles WHERE id_usuario = $1", [req.params.id]);
    res.json(rows.map(r => r.role_name));
  } catch (e) {
    console.error("ERRO GET ROLES:", e);
    res.status(500).json({ error: e.message });
  }
  finally { client.release(); }
});

app.post('/usuarios/:id/roles', async (req, res) => {
  const client = await pool.connect();
  try {
    const { roles } = req.body;
    if (!Array.isArray(roles)) return res.status(400).json({ error: "Roles deve ser um array." });

    await client.query("BEGIN");
    await client.query("DELETE FROM usuarios_roles WHERE id_usuario = $1", [req.params.id]);

    for (const role of roles) {
      await client.query("INSERT INTO usuarios_roles (id_usuario, role_name) VALUES ($1, $2)", [req.params.id, role]);
    }

    await client.query("COMMIT");
    await logAudit(client, req.body.usuario_responsavel || 'Admin', 'USER_ROLES_UPDATE', `User ID ${req.params.id}`, `Roles: ${roles.join(', ')}`);
    res.json({ message: "Roles atualizadas" });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: e.message });
  }
  finally { client.release(); }
});

async function checarPermissaoUsuario(client, userId, codigoPermissao) {
  try {
    const userRes = await client.query("SELECT role, email FROM usuarios WHERE id = $1", [userId]);
    if (userRes.rows.length === 0) return false;

    const userRole = userRes.rows[0].role;

    const q = `
            SELECT 
                p.codigo,
                COALESCE(pu.ativo, pr.ativo, false) as tem_permissao
            FROM permissoes p
            LEFT JOIN permissoes_roles pr ON p.id = pr.permissao_id AND pr.role = $1
            LEFT JOIN permissoes_usuarios pu ON p.id = pu.permissao_id AND pu.usuario_id = $2
            WHERE p.codigo = $3
        `;

    const result = await client.query(q, [userRole, userId, codigoPermissao]);
    return result.rows.length > 0 && result.rows[0].tem_permissao;

  } catch (e) {
    console.error("Erro checando permissão interna:", e);
    return false;
  }
}

app.post('/db-test', async (req, res) => {
  const { sql_query } = req.body;
  const userId = req.headers['x-user-id'];

  if (!userId) return res.status(401).json({ status: 'erro', mensagem: "Usuário não identificado" });

  const client = await pool.connect();
  try {
    const comando = sql_query.trim().split(/\s+/)[0].toUpperCase();
    let permissaoNecessaria = '';
    if (['SELECT', 'SHOW', 'EXPLAIN'].includes(comando)) {
      permissaoNecessaria = 'SQL_SELECT';
    }
    else if (['DELETE', 'DROP', 'TRUNCATE', 'ALTER'].includes(comando)) {
      permissaoNecessaria = 'SQL_DELETE';
    }
    else if (['INSERT'].includes(comando)) {
      permissaoNecessaria = 'SQL_INSERT';
    }
    else if (['UPDATE'].includes(comando)) {
      permissaoNecessaria = 'SQL_UPDATE';
    }
    else {
      permissaoNecessaria = 'SQL_DELETE';
    }

    const podeExecutar = await checarPermissaoUsuario(client, userId, permissaoNecessaria);

    if (!podeExecutar) {
      return res.status(403).json({
        status: 'erro',
        mensagem: ` Você precisa da permissão '${permissaoNecessaria}' para rodar comandos ${comando}.`
      });
    }

    const result = await client.query(sql_query);

    if (permissaoNecessaria === 'SQL_DELETE') {
      await logAudit(client, `User ${userId}`, 'SQL_EXEC_DANGER', 'Banco de Dados', `Executou: ${sql_query.substring(0, 50)}...`);
    }

    res.json({ status: 'sucesso', rowCount: result.rowCount, rows: result.rows });

  } catch (e) {
    res.status(400).json({ status: 'erro', mensagem: e.message });
  } finally {
    client.release();
  }
});

app.post("/save-token", async (req, res) => {
  const client = await pool.connect();
  try {
    const { uid, token, tipo_dispositivo } = req.body;

    const q = `
      INSERT INTO dispositivos_usuarios (id_usuario, push_token, tipo_dispositivo, ultimo_acesso, ativo) 
      VALUES ($1, $2, $3, NOW(), true) 
      ON CONFLICT (push_token) 
      DO UPDATE SET id_usuario = $1, ultimo_acesso = NOW(), ativo = true
    `;

    await client.query(q, [uid, token, tipo_dispositivo || 'WEB']);
    res.json({ message: "Token vinculado ao usuário com sucesso" });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});


app.post("/notify/push", async (req, res) => {
  const { titulo, mensagem, email_alvo, target_role } = req.body;

  const client = await pool.connect();
  try {
    let q = "";
    let params = [];

    if (email_alvo) {
      console.log(`[Push] Alvo Específico: ${email_alvo}`);
      q = `
            SELECT d.push_token, u.nome, u.recebe_push
            FROM dispositivos_usuarios d
            JOIN usuarios u ON d.id_usuario = u.id
            WHERE u.email = $1
              AND COALESCE(u.recebe_push, true) = true
        `;
      params = [email_alvo];
    }

    else if (target_role === 'admin') {
      console.log(` Broadcast para ADMINS`);
      q = `
            SELECT d.push_token, u.nome, u.recebe_push
            FROM dispositivos_usuarios d
            JOIN usuarios u ON d.id_usuario = u.id
            WHERE LOWER(u.role) = 'admin'
              AND COALESCE(u.recebe_push, true) = true
      `;
    } else {
      console.log(`[Push] Broadcast Geral (Fallback)`);
      q = `
            SELECT d.push_token, u.nome 
            FROM dispositivos_usuarios d
            JOIN usuarios u ON d.id_usuario = u.id
            WHERE COALESCE(u.recebe_push, true) = true
      `;
    }

    const result = await client.query(q, params);

    if (result.rows.length === 0) {
      console.log("[Push] Bloqueado ou Vazio. (Motivo: Nenhum usuário com Push Habilitado encontrado no filtro).");
      return res.json({ message: "Nenhum dispositivo encontrado (Preferência do usuário respeitada ou nenhum usuário cadastrado)." });
    }

    const tokens = [...new Set(result.rows.map(r => r.push_token))];
    console.log(`[Push] Destinatários Válidos (${tokens.length}): ${result.rows.map(r => r.nome).join(', ')}`);

    if (admin.apps.length > 0) {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokens,
        notification: { title: titulo, body: mensagem }
      });
      console.log(`[Push] Enviado Firebase. Sucessos: ${response.successCount}`);
      res.json({ success: response.successCount });
    } else {
      res.status(503).json({ error: "Firebase not initialized" });
    }
  } catch (e) {
    console.error("Erro Push:", e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

async function logAudit(client, responsavel, acao, alvo, detalhes) {
  try {
    await client.query(
      "INSERT INTO logs_auditoria (responsavel, acao, alvo, detalhes, timestamp) VALUES ($1, $2, $3, $4, NOW())",
      [responsavel || 'Sistema', acao, alvo, detalhes]
    );
  } catch (e) { console.error("Erro logAudit:", e); }
}

async function notifyAdmins(client, title, message) {
  try {
    console.log("[NotifyAdmins] Buscando tokens de administradores...");

    const q = `
      SELECT d.push_token, u.email
      FROM dispositivos_usuarios d
      JOIN usuarios u ON d.id_usuario = u.id
      WHERE LOWER(u.role) = 'admin'
        AND COALESCE(u.recebe_push, true) = true
    `;
    const res = await client.query(q);

    if (res.rows.length === 0) {
      console.log("[NotifyAdmins] Nenhum admin disponível para Push (ou todos desativaram).");
      return;
    }

    const tokens = res.rows.map(r => r.push_token);
    console.log(`[NotifyAdmins] Enviando para ${tokens.length} admins:`, res.rows.map(r => r.email));

    if (admin.apps.length > 0) {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokens,
        notification: { title, body: message }
      });
      console.log(`[NotifyAdmins] Sucessos: ${response.successCount}, Falhas: ${response.failureCount}`);
    }
  } catch (e) {
    console.error("Erro fatal em notifyAdmins:", e);
  }
}

app.get('/escalas', async (req, res) => {
  const client = await pool.connect();
  try {
    const q = `
            SELECT e.*, u.nome, u.email, u.id as id_usuario_real 
            FROM escalas e
            JOIN usuarios u ON e.id_usuario = u.id
            ORDER BY e.data_inicio ASC
        `;
    const { rows } = await client.query(q);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.post('/escalas', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id_usuario, canal, data_inicio, data_fim } = req.body;

    if (new Date(data_inicio) >= new Date(data_fim)) {
      return res.status(400).json({ error: "Data final deve ser maior que inicial" });
    }
    const q = `INSERT INTO escalas (id_usuario, canal, data_inicio, data_fim) VALUES ($1, $2, $3, $4) RETURNING *`;
    const { rows } = await client.query(q, [id_usuario, canal, data_inicio, data_fim]);

    const resUser = await client.query("SELECT email, nome FROM usuarios WHERE id = $1", [id_usuario]);
    const user = resUser.rows[0];

    if (user) {
      const msg = `Olá ${user.nome}, você foi escalado para ${canal} de ${data_inicio} até ${data_fim}.`;
      const titulo = `Nova Escala: ${canal}`;
      await client.query(`
            INSERT INTO notificacoes (id_usuario, destinatario, Canal, mensagem, status, titulo, metadados) 
            VALUES ($1, $2, 'EMAIL', $3, 'PENDING', $4, $5)
        `, [id_usuario, user.email, msg, titulo, JSON.stringify({ tipo: 'escala', id_escala: rows[0].id })]);
    }

    await logAudit(client, 'Admin', 'ESCALA_CRIAR', `User ${id_usuario}`, `Escala criada para ${canal}`);
    res.json(rows[0]);

  } catch (e) {
    console.error("Erro POST /escalas:", e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.delete('/escalas/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("DELETE FROM escalas WHERE id = $1", [req.params.id]);
    res.json({ message: "Escala removida" });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.put('/escalas/:id/ack', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id_usuario } = req.body;

    const result = await client.query(
      "UPDATE escalas SET status_confirmacao = 'ACK_OK' WHERE id = $1 AND id_usuario = $2 RETURNING *",
      [req.params.id, id_usuario]
    );

    if (result.rowCount === 0) {
      return res.status(403).json({ error: "Escala não encontrada ou não pertence a você." });
    }

    await logAudit(client, `User ${id_usuario}`, 'ESCALA_ACK', `Escala ${req.params.id}`, 'Confirmou presença no plantão');
    res.json({ message: "Plantão confirmado com sucesso!", escala: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

app.delete('/usuarios/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const uid = req.params.id;
    await client.query("DELETE FROM usuarios_roles WHERE id_usuario = $1", [uid]);
    await client.query("DELETE FROM dispositivos_usuarios WHERE id_usuario = $1", [uid]);
    await client.query("DELETE FROM escalas WHERE id_usuario = $1", [uid]);
    await client.query("DELETE FROM permissoes_usuarios WHERE usuario_id = $1", [uid]);
    await client.query("DELETE FROM usuarios WHERE id = $1", [uid]);
    await logAudit(client, 'Admin', 'DELETE_USER', `ID ${uid}`, 'Usuário excluído com dependências');
    res.json({ message: "Usuário e dados vinculados removidos com sucesso." });
  } catch (e) {
    console.error("Erro delete user:", e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.put('/usuarios/:id/preferencias', async (req, res) => {
  const client = await pool.connect();
  try {
    const { recebe_push, recebe_email, inicio_nao_perturbe, fim_nao_perturbe } = req.body;

    await client.query(`
            UPDATE usuarios 
            SET recebe_push = $1, 
                recebe_email = $2, 
                inicio_nao_perturbe = $3, 
                fim_nao_perturbe = $4
            WHERE id = $5
        `, [recebe_push, recebe_email, inicio_nao_perturbe, fim_nao_perturbe, req.params.id]);

    console.log(`Preferências atualizadas para User ${req.params.id}: Push=${recebe_push}, Email=${recebe_email}`);
    await logAudit(client, 'Usuario', 'UPDATE_PREFS', `ID ${req.params.id}`, 'Preferências de notificação atualizadas');
    res.json({ message: "Preferências atualizadas com sucesso!" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao salvar preferências" });
  } finally { client.release(); }
});

app.get('/logs', async (req, res) => {
  const client = await pool.connect();
  try {
    const { responsavel, alvo, incidente } = req.query;
    let q = "SELECT * FROM logs_auditoria WHERE 1=1";
    const params = [];
    let count = 1;

    if (responsavel) {
      q += ` AND responsavel ILIKE $${count}`;
      params.push(`%${responsavel}%`);
      count++;
    }
    if (alvo) {
      q += ` AND alvo ILIKE $${count}`;
      params.push(`%${alvo}%`);
      count++;
    }
    if (incidente) {
      q += ` AND (alvo ILIKE $${count} OR detalhes ILIKE $${count})`;
      params.push(`%${incidente}%`);
      count++;
    }

    q += " ORDER BY id DESC LIMIT 200";

    const { rows } = await client.query(q, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

app.get('/dashboard/kpis', async (req, res) => {
  const client = await pool.connect();
  try {

    const q = `
            SELECT m.*, r.nome 
            FROM metricas_diarias m
            JOIN regras r ON m.id_regra = r.id
            WHERE m.data_referencia = CURRENT_DATE
            ORDER BY m.total_erros DESC
        `;
    const { rows } = await client.query(q);
    res.json(rows);
  } catch (e) {
    console.error("Erro KPI:", e);
    res.status(500).json({ error: e.message });
  }
  finally { client.release(); }
});


app.get('/sistema/status', async (req, res) => {
  const client = await pool.connect();
  try {
    const q = "SELECT * FROM sistema_status WHERE servico = 'RUNNER_PYTHON'";
    const { rows } = await client.query(q);

    if (rows.length === 0) return res.json({ status: 'OFFLINE', ultima_vez: null });

    const ultimo = new Date(rows[0].ultimo_batimento);
    const agora = new Date();
    const diffSegundos = (agora - ultimo) / 1000;
    const statusReal = diffSegundos < 120 ? 'ONLINE' : 'OFFLINE';

    res.json({ status: statusReal, ultima_vez: rows[0].ultimo_batimento });
  } finally { client.release(); }
});

app.put('/regras/:id/silenciar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { minutos } = req.body;

    const q = `
            UPDATE regras 
            SET silenciado_ate = NOW() + ($1 || ' minutes')::INTERVAL 
            WHERE id = $2
        `;
    await client.query(q, [minutos, req.params.id]);
    await logAudit(client, req.body.usuario || 'Usuario', 'REGRA_SILENCIAR', `Regra ID ${req.params.id}`, `Silenciada por ${minutos} min`);
    res.json({ message: `Regra silenciada por ${minutos} minutos.` });
  } catch (e) { res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

Object.keys(TABLES).forEach(tableKey => {
  const table = TABLES[tableKey];

  app.get(`/${tableKey}`, async (req, res) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT * FROM ${table.name} ORDER BY ${table.pk} DESC LIMIT 200;`);
      res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
  });

  app.get(`/${tableKey}/:id`, async (req, res) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(`SELECT * FROM ${table.name} WHERE ${table.pk} = $1`, [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: "404" });
      res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
  });

  app.post(`/${tableKey}`, async (req, res) => {
    const client = await pool.connect();
    try {
      let data = { ...req.body };
      if (tableKey === 'regras') {
        if (data.sql_query) data.sql = data.sql_query;
        if (data.intervalo_minutos) data.minuto_atualizacao = data.intervalo_minutos;
        if (data.ativo !== undefined) data.active = data.ativo;
        if (data.usuario_id === '') data.usuario_id = null;
      }
      const validCols = table.cols.filter(col => data[col] !== undefined);
      if (validCols.length === 0) return res.status(400).json({ error: "Dados inválidos" });

      const q = `INSERT INTO ${table.name} (${validCols.join(", ")}) VALUES (${validCols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *;`;
      const { rows } = await client.query(q, validCols.map(c => data[c]));

      if (tableKey === 'usuarios') {
        const novoUser = rows[0];
        await notifyAdmins(client, "Novo Cadastro", `Usuário ${novoUser.nome} (${novoUser.email}) solicitou acesso.`);
        await logAudit(client, 'Sistema', 'USUARIO_CRIAR', novoUser.email, `Novo usuário criado: ${novoUser.nome}`);
      } else if (tableKey === 'regras') {
        await logAudit(client, req.body.usuario_responsavel || 'Admin', 'REGRA_CRIAR', rows[0].nome, 'Nova regra criada');
      }
      res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
  });

  app.put(`/${tableKey}/:id`, async (req, res) => {
    const client = await pool.connect();
    try {
      let data = { ...req.body };
      console.log(`[DEBUG PUT] Table: ${tableKey}, ID: ${req.params.id}`);
      console.log(`[DEBUG PUT] Body keys:`, Object.keys(data));

      if (tableKey === 'regras') {
        if (data.sql_query) data.sql = data.sql_query;
        if (data.intervalo_minutos) data.minuto_atualizacao = data.intervalo_minutos;
        if (data.ativo !== undefined) data.active = data.ativo;
        if (data.usuario_id === '') data.usuario_id = null;
      }
      const validCols = table.cols.filter(col => data[col] !== undefined);
      console.log(`[DEBUG PUT] Valid Cols:`, validCols);

      if (validCols.length === 0) return res.status(400).json({ error: "Sem dados" });

      const setClause = validCols.map((col, i) => `${col} = $${i + 2}`).join(", ");
      const q = `UPDATE ${table.name} SET ${setClause} WHERE ${table.pk} = $1 RETURNING *`;

      const { rows } = await client.query(q, [req.params.id, ...validCols.map(c => data[c])]);
      if (rows.length === 0) return res.status(404).json({ error: "404" });

      console.log(`[DEBUG PUT] Updated Row:`, rows[0]);

      if (tableKey === 'usuarios') {
        await logAudit(client, req.body.usuario_responsavel || 'Admin', 'USUARIO_UPDATE', rows[0].email, 'Dados de usuário atualizados');
      } else if (tableKey === 'regras') {
        await logAudit(client, req.body.usuario_responsavel || 'Admin', 'REGRA_UPDATE', rows[0].nome, 'Regra atualizada');
      }

      res.json(rows[0]);
    } catch (err) {
      console.error(`[DEBUG PUT ERROR]`, err);
      res.status(500).json({ error: err.message });
    }
    finally { client.release(); }
  });

  app.delete(`/${tableKey}/:id`, async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query(`DELETE FROM ${table.name} WHERE ${table.pk} = $1`, [req.params.id]);
      await logAudit(client, (req.body && req.body.usuario) || 'Admin', 'DELETE_GENERIC', `${tableKey} ID ${req.params.id}`, 'Registro deletado');
      res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { client.release(); }
  });
});


app.post('/auth/reset-password', async (req, res) => {
  const { username, email } = req.body;
  const client = await pool.connect();

  try {
    let user = null;

    if (email) {
      const r = await client.query("SELECT * FROM usuarios WHERE email = $1", [email]);
      if (r.rows.length > 0) user = r.rows[0];
    }
    else if (username) {

      if (!isNaN(username)) {
        const r = await client.query("SELECT * FROM usuarios WHERE id = $1", [username]);
        if (r.rows.length > 0) user = r.rows[0];
      }
      if (!user) {
        const r = await client.query("SELECT * FROM usuarios WHERE nome = $1", [username]);
        if (r.rows.length > 0) user = r.rows[0];
      }
    }

    if (user && user.email) {
      console.log(`[ResetPassword] Usuário encontrado: ${user.nome} (${user.email}). Gerando link...`);

      const link = await admin.auth().generatePasswordResetLink(user.email);
      const msgHtml = `
         <p>Olá, <strong>${user.nome}</strong>.</p>
         <p>Recebemos uma solicitação para redefinir sua senha.</p>
         <p>Clique no botão abaixo para prosseguir:</p>
         <div style="text-align: center; margin: 20px 0;">
            <a href="${link}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Redefinir Senha</a>
         </div>
         <p>Ou copie e cole o link: <br><small>${link}</small></p>
         <p>Se não foi você, ignore este email.</p>
       `;

      await client.query(`
          INSERT INTO notificacoes (id_usuario, destinatario, canal, titulo, mensagem, status, created_at)
          VALUES ($1, $2, 'EMAIL', 'Redefinição de Senha', $3, 'PENDING', NOW())
       `, [user.id, user.email, msgHtml]);

      console.log(`[ResetPassword] Email enfileirado para ${user.email}`);
    } else {
      console.log(`[ResetPassword] Usuário não encontrado para: ${email || username}`);
    }

    res.json({ message: "Solicitação processada." });

  } catch (e) {
    console.error("Erro ResetPassword:", e);
    res.status(500).json({ error: "Erro interno" });
  } finally {
    client.release();
  }
});

process.on('exit', (code) => {
  console.log(`About to exit with code: ${code}`);
});

const server = app.listen(PORT, () => {
  console.log(`API: http://localhost:${PORT}`);
});

server.on('close', () => {
  console.log('Server Closed!');
});
