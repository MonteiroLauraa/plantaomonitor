import time
import datetime
import schedule
import psycopg2
import logging
import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
import firebase_admin
from firebase_admin import credentials, messaging
from email.mime.multipart import MIMEMultipart
import json
import requests

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

DB_URL = os.getenv("DATABASE_URL")


if not firebase_admin._apps:
    try:
        cred_dict = json.loads(os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY"))
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        logging.info("Firebase Inicializado.")
    except Exception as e:
        logging.warning(f"Firebase Error: {e}")

def get_db_connection():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def get_destinatarios_tokens(role_target):
    if not role_target:
        return []
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    query = """
        SELECT DISTINCT d.push_token 
        FROM public.usuarios u
        JOIN public.usuarios_roles ur ON u.id = ur.id_usuario
        JOIN public.dispositivos_usuarios d ON u.id = d.id_usuario
        WHERE ur.role_name = %s
        AND u.enable_push = true
        AND (current_time BETWEEN u.start_time AND u.end_time)
    """
    
    cur.execute(query, (role_target,))
    tokens = [row['push_token'] for row in cur.fetchall()]
    
    cur.close()
    conn.close()
    return tokens

def send_push_notification(tokens, title, body, data_payload=None):
    try:
        if not tokens:
            logging.info(f"Nenhum destinatário elegível para: {title}")
            return

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data=data_payload,
            tokens=tokens,
        )
        response = messaging.send_multicast(message)
        logging.info(f"Push enviado para {len(tokens)} devices. Sucessos: {response.success_count}")
    except Exception as e:
        logging.error(f"Erro ao enviar Push: {e}")

def create_incident(cur, regra, linhas_afetadas):
    logging.warning(f"Regra '{regra['nome']}' acionada linhas: {linhas_afetadas}")
    cur.execute("SELECT id_incidente FROM incidentes WHERE id_regra = %s AND status IN ('OPEN', 'ACK')", (regra['id'],))
    existing = cur.fetchone()

    if existing:
     
        logging.info(f"Recorrência: Incidente {existing['id_incidente']} atualizado.")
        cur.execute("UPDATE incidentes SET data_ultima_ocorrencia = NOW(), detalhes = %s WHERE id_incidente = %s", 
                    (f"Recorrência em {datetime.datetime.now()}: {linhas_afetadas} itens.", existing['id_incidente']))
        return  
    cur.execute("""
        INSERT INTO incidentes (id_regra, status, prioridade, detalhes, data_ultima_ocorrencia)
        VALUES (%s, 'OPEN', %s, %s, NOW()) RETURNING id_incidente
    """, (regra['id'], regra['prioridade'], f"Regra {regra['nome']} detectou {linhas_afetadas} registros."))
    
    incidente_id = cur.fetchone()['id_incidente']
    canal_para_busca = regra.get('role_target') or regra.get('roles')
    plantonista = buscar_destinatario_ativo(cur, canal_para_busca)

    if plantonista:
        email_operador = plantonista['email']
        nome_operador = plantonista['nome']
     
        quer_email = plantonista.get('recebe_email', True)
        quer_push = plantonista.get('recebe_push', True)

        if quer_email:
            print(f"   [Email] Enviando para Operador: {nome_operador}")
            cur.execute("""
                INSERT INTO notificacoes (id_usuario, id_incidente, canal, destinatario, mensagem, status, lida, titulo, metadados)
                VALUES (%s, %s, 'EMAIL', %s, %s, 'PENDING', false, %s, %s)
            """, (plantonista['id'], incidente_id, email_operador, 
                  f"Sua vez: {regra.get('nome')}. Ação necessária.", 
                  f"Ação NECESSÁRIA #{incidente_id}", 
                  json.dumps({"rota": f"/operador/incidentes/{incidente_id}", "prioridade": "alta"})))
        else:
            print(f"   Usuário {nome_operador} desativou E-mails. Ignorando envio.")

        if quer_push:
            try:
                requests.post("http://localhost:8000/notify/push", json={
                    "titulo": f" AÇÃO NECESSÁRIA #{incidente_id}",
                    "mensagem": f"Você está de plantão! Falha em: {regra.get('nome')}",
                    "email_alvo": email_operador 
                }, timeout=1)
                print(f"   [Push] Direct Message para {nome_operador}")
            except:
                pass
        else:
            print(f"   Usuário {nome_operador} desativou Push. Ignorando envio.")
    else:
        print(f"   Sem plantonista ativo para {canal_para_busca}")
    try:
        print("   [Push] Disparando Broadcast para Admins...")
        requests.post("http://localhost:8000/notify/push", json={
            "titulo": f"Novo Incidente #{incidente_id}",
            "mensagem": f"Regra: {regra.get('nome')} | Operador: {plantonista['nome'] if plantonista else 'Ninguém'}",
            "target_role": "admin"
        }, timeout=1)
    except Exception as e:
        print(f"   Erro ao notificar Admins: {e}")
    email_extra = regra.get('email_notificacao')
    if email_extra and '@' in email_extra:
        print(f"   [Extra] Regra tem destinatário fixo: {email_extra}")
        enviar_email_smtp(
            email_extra, 
            f"Alerta Específico: {regra.get('nome')}",
            f"A regra '{regra.get('nome')}' falhou e você está configurado como receptor fixo.\nIncidente #{incidente_id}"
        )
        
        cur.execute("""
            INSERT INTO notificacoes (id_usuario, id_incidente, canal, destinatario, titulo, mensagem, status)
            VALUES (NULL, %s, 'EMAIL', %s, 'Alerta Fixo', 'Envio configurado na regra', 'enviado')
        """, (incidente_id, email_extra))



def buscar_destinatario_ativo(cursor, canal_regra):
    canal_alvo = canal_regra if canal_regra else 'GERAL'
    print(f"   [Router] Procurando plantonista para '{canal_alvo}'...")
    query = """
        SELECT u.id, u.email, u.nome, 
               COALESCE(u.recebe_email, true) as recebe_email,
               COALESCE(u.recebe_push, true) as recebe_push
        FROM escalas e
        JOIN usuarios u ON e.id_usuario = u.id
        WHERE UPPER(e.canal) = UPPER(%s) 
          AND CURRENT_TIMESTAMP BETWEEN e.data_inicio AND e.data_fim
          AND (
              u.inicio_nao_perturbe IS NULL 
              OR 
              CURRENT_TIME::time NOT BETWEEN u.inicio_nao_perturbe AND u.fim_nao_perturbe
          )
        ORDER BY e.data_inicio DESC
        LIMIT 1
    """
    
    cursor.execute(query, (canal_alvo,))
    plantonista = cursor.fetchone()
    
    if plantonista:
        print(f"   Plantonista: {plantonista['nome']} | Email={plantonista['recebe_email']}, Push={plantonista['recebe_push']}")
        return plantonista
    
    print(f"   Ninguém de plantão para '{canal_alvo}'. Procurando admin .")
    
    cursor.execute("""
        SELECT id, email, nome, 
               COALESCE(recebe_email, true) as recebe_email,
               COALESCE(recebe_push, true) as recebe_push
        FROM usuarios WHERE role = 'admin' LIMIT 1
    """)
    admin_fallback = cursor.fetchone()
    
    if admin_fallback:
         print(f"   Fallback Admin: {admin_fallback['nome']}")
         return admin_fallback
    
    return {'id': None, 'email': os.getenv("EMAIL_USER"), 'recebe_email': True, 'recebe_push': True, 'nome': 'Admin System'}

def atualizar_heartbeat(conn):
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE sistema_status SET ultimo_batimento = NOW(), status = 'ONLINE' WHERE servico = 'RUNNER_PYTHON'")
        conn.commit()
    except Exception as e:
        print(f"Erro Heartbeat: {e}")

def job_escalonamento():
    conn = get_db_connection()
    if not conn: return
    
    try:
        cursor = conn.cursor()
        
        query = """
            SELECT i.id_incidente, r.nome as nome_regra
            FROM incidentes i
            JOIN regras r ON i.id_regra = r.id
            WHERE i.status = 'OPEN' 
              AND i.data_abertura < NOW() - INTERVAL '2 HOURS'
              AND i.prioridade < 1
        """
        cursor.execute(query)
        atrasados = cursor.fetchall()
        
        for inc in atrasados:
            print(f"   ESCALANDO Incidente #{inc['id_incidente']}")
            
            cursor.execute("UPDATE incidentes SET prioridade = 1 WHERE id_incidente = %s", (inc['id_incidente'],))
            
            cursor.execute("""
                INSERT INTO notificacoes (id_incidente, canal, destinatario, mensagem, status, titulo, metadados)
                VALUES (%s, 'EMAIL', 'admin@empresa.com', 'ESCALATION: Operador não respondeu em 2h!', 'PENDING', 'ESCALATION ALERT', %s)
            """, (inc['id_incidente'], json.dumps({"rota": f"/admin/incidentes/{inc['id_incidente']}", "prioridade": "critica"})))
            
        conn.commit()
    except Exception as e:
        print(f"Erro no escalonamento: {e}")
        conn.rollback()
    finally:
        conn.close()

def processar_notificacoes(conn):
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM notificacoes WHERE status ILIKE 'pending' OR status = 'pendente'")
        notificacoes = cursor.fetchall()

        for notif in notificacoes:
            destinatario = notif['destinatario']
            id_inc = notif['id_incidente']
            
            titulo_db = notif.get('titulo')
            assunto = titulo_db if titulo_db else (f"Plantão Monitor: Incidente #{id_inc}" if id_inc else "Plantão Monitor: Novo Aviso")
            titulo_push = titulo_db if titulo_db else (f"Incidente #{id_inc}" if id_inc else "Novo Aviso")

            if notif['canal'] == 'EMAIL':
                print(f"   Enviando e-mail para {destinatario}...")
                enviar_email_smtp(destinatario, assunto, notif['mensagem'])
            
            try:
          
                payload = {
                    "titulo": titulo_push,
                    "mensagem": notif['mensagem'],
                    "email_alvo": destinatario
                }
                import requests
                requests.post("http://localhost:8000/notify/push", json=payload, timeout=2)
            except:
                pass

            cursor.execute("UPDATE notificacoes SET status = 'enviado' WHERE id = %s", (notif['id'],))
        
        conn.commit()

    except Exception as e:
        print(f"Erro notificações: {e}")
        conn.rollback()


def get_tokens_for_notification(regra):
    conn = get_db_connection()
    cur = conn.cursor()
    owner_id = regra.get('usuario_id')
    query = "SELECT DISTINCT d.push_token FROM dispositivos_usuarios d JOIN usuarios u ON d.id_usuario = u.id WHERE u.role = 'admin' OR u.id = %s"
    cur.execute(query, (owner_id,))
    tokens = [row['push_token'] for row in cur.fetchall()]
    cur.close()
    conn.close()
    return tokens

def get_emails_for_notification(regra):
    conn = get_db_connection()
    cur = conn.cursor()
    owner_id = regra.get('usuario_id')
    query = "SELECT DISTINCT u.email FROM usuarios u WHERE (u.role = 'admin' OR u.id = %s) AND u.enable_email = true"
    cur.execute(query, (owner_id,))
    emails = [r['email'] for r in cur.fetchall()]
    specific = regra.get('email_notificacao')
    if specific and specific not in emails: emails.append(specific)
    cur.close()
    conn.close()
    return emails

def enviar_email_smtp(destinatarios, regra_nome, erro_detalhe):
    
    smtp_server = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("EMAIL_PORT", 587))
    smtp_user = os.getenv("EMAIL_USER")
    smtp_password = os.getenv("EMAIL_PASS")
    
    if not smtp_user or not smtp_password:
        logging.warning("Email não configurado.")
        return

    if isinstance(destinatarios, str):
        destinatarios = [destinatarios]

    assunto = regra_nome 
    corpo_html = f"""
    <html><body>
        <h2 style="color: #d9534f;">{regra_nome}</h2>
        <p>{erro_detalhe}</p>
        <hr>
        <p>Plantão Monitor</p>
    </body></html>
    """
    try:
        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_password)
        for email_destino in destinatarios:
            msg = MIMEMultipart()
            msg['From'] = smtp_user
            msg['To'] = email_destino
            msg['Subject'] = assunto
            msg.attach(MIMEText(corpo_html, 'html'))
            server.sendmail(smtp_user, email_destino, msg.as_string())
            logging.info(f"Enviado para: {email_destino}")
        server.quit()
    except Exception as e:
        logging.error(f"Erro Email: {e}")

def check_rules():
    logging.info("--- Ciclo de Monitoramento ---")
    try:
        conn = get_db_connection()
        if not conn: return
        
        atualizar_heartbeat(conn) 
        
        cur = conn.cursor()
        cur.execute("SELECT * FROM regras WHERE active = true")
        regras = cur.fetchall()
        
        for r in regras:
            silenciado_ate = r.get('silenciado_ate')
            if silenciado_ate:
                agora = datetime.datetime.now()
               
                if hasattr(silenciado_ate, 'replace'):
                    silenciado_ate = silenciado_ate.replace(tzinfo=None)

                
                if silenciado_ate > agora:
                    logging.info(f" Regra '{r['nome']}' silenciada até {silenciado_ate}. Pulando.")
                    continue

            try:
                logging.info(f"Executando: {r['nome']}")
                
                start_time = datetime.datetime.now()
                erro_msg = None
                sucesso = True
                valor = 0

                try:
                    cur.execute(r['sql'])
                    result = cur.fetchone()
                    valor = list(result.values())[0] if result else 0
                    
                    if valor >= r['qtd_erro_max']:
                        create_incident(cur, r, valor)
                    
                    conn.commit()
                except Exception as execution_err:
                    sucesso = False
                    erro_msg = str(execution_err)
                    raise execution_err
                finally:
                    end_time = datetime.datetime.now()
                    
                    if not sucesso:
                        try:
                            conn.rollback()
                        except:
                            pass

                    try:
                        cur.execute("""
                            INSERT INTO execucoes_regras (id_regra, data_inicio, data_fim, sucesso, linhas_afetadas, erro_mensagem)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, (r['id'], start_time, end_time, sucesso, valor, erro_msg))
                        conn.commit()
                    except Exception as log_err:
                        logging.error(f"Erro ao salvar log de execução: {log_err}")

            except Exception as e:
                logging.error(f"Erro na regra {r['nome']}: {e}")
                conn.rollback()
        cur.close()
        conn.close()
    except Exception as e:
        logging.error(f"Erro Geral no Runner: {e}")


def job_notificacoes():
    logging.info("Processando Notificações Fila")
    conn = get_db_connection()
    if conn:
        processar_notificacoes(conn)
        conn.close()

def job_verificar_acks_escalas():
    logging.info("Verificando confirmações de presença...")
    conn = get_db_connection()
    if not conn: return

    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        query_criticos = """
            SELECT e.id, e.id_usuario, e.data_inicio, e.canal, u.nome, u.email
            FROM escalas e
            JOIN usuarios u ON e.id_usuario = u.id
            WHERE (e.status_confirmacao = 'PENDING' OR e.status_confirmacao IS NULL)
              AND e.data_inicio BETWEEN NOW() AND (NOW() + INTERVAL '5 MINUTES')
        """
        cursor.execute(query_criticos)
        escalas_sem_ack = cursor.fetchall()

        for escala in escalas_sem_ack:
            logging.warning(f"   ALERTA: {escala['nome']} não confirmou plantão de {escala['data_inicio']}!")

            query_proximo = """
                SELECT id_usuario, data_inicio 
                FROM escalas 
                WHERE canal = %s 
                  AND data_inicio > %s 
                ORDER BY data_inicio ASC 
                LIMIT 1
            """
            cursor.execute(query_proximo, (escala['canal'], escala['data_inicio']))
            proximo = cursor.fetchone()

            novo_id_usuario = None
            
            if proximo:
                novo_id_usuario = proximo['id_usuario']
                logging.info(f"   Redirecionando para o próximo da fila: ID {novo_id_usuario}")
            else:
                logging.warning("   Ninguém na fila. Escalando Admin.")
                cursor.execute("SELECT id, email, nome FROM usuarios WHERE role='admin' LIMIT 1")
                admin = cursor.fetchone()
                if admin: novo_id_usuario = admin['id']

            if novo_id_usuario:
                update_query = """
                    UPDATE escalas 
                    SET id_usuario = %s, 
                        id_usuario_original = %s,
                        status_confirmacao = 'PENDING' 
                    WHERE id = %s
                """
                cursor.execute(update_query, (novo_id_usuario, escala['id_usuario'], escala['id']))

                cursor.execute("SELECT email, nome FROM usuarios WHERE id = %s", (novo_id_usuario,))
                dados_novo = cursor.fetchone()
                
                if dados_novo:
                    msg_novo = f"URGENTE: Você assumiu o plantão de {escala['data_inicio']} pois {escala['nome']} não confirmou."
                    
     
                    try:
                        requests.post("http://localhost:8000/notify/push", json={
                            "titulo": "PLANTÃO REAGENDADO PARA VOCÊ",
                            "mensagem": msg_novo,
                            "email_alvo": dados_novo['email']
                        }, timeout=2)
                    except: pass
         
                    cursor.execute("""
                        INSERT INTO notificacoes (id_usuario, destinatario, canal, mensagem, status, titulo)
                        VALUES (%s, %s, 'EMAIL', %s, 'PENDING', 'Plantão Transferido')
                    """, (novo_id_usuario, dados_novo['email'], msg_novo))

                msg_antigo = f"Você perdeu o plantão de {escala['data_inicio']} por falta de ACK."
                cursor.execute("""
                    INSERT INTO notificacoes (id_usuario, destinatario, canal, mensagem, status, titulo, id_incidente)
                    VALUES (%s, %s, 'EMAIL', %s, 'PENDING', 'Plantão Cancelado (No-Show)', NULL)
                """, (escala['id_usuario'], escala['email'], msg_antigo))

        conn.commit()
    except Exception as e:
        logging.error(f"Erro ao verificar ACKs: {e}")
        conn.rollback()
    finally:
        conn.close()

schedule.every(30).seconds.do(check_rules)
schedule.every(5).minutes.do(job_verificar_acks_escalas) 
schedule.every(15).seconds.do(job_notificacoes)
schedule.every(5).minutes.do(job_escalonamento)

if __name__ == "__main__":
    print("Runner rodandoo")
    while True:
        schedule.run_pending()
        time.sleep(1)

