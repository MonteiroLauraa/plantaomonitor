
import os
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import time
import datetime

load_dotenv()
db_url = os.getenv("DATABASE_URL").replace("postgresql://", "postgresql+pg8000://")
engine = create_engine(db_url)

def calcular_metricas():
    print(f"\niniciodos graficos {datetime.datetime.now()}...")
    
    try:
        print(" try ler")
        
        df_exec = pd.read_sql("""
            SELECT id_regra, data_inicio, data_fim, sucesso 
            FROM execucoes_regras 
            WHERE data_inicio >= CURRENT_DATE - INTERVAL '30 days'
        """, engine)
        
        df_inc = pd.read_sql("""
            SELECT id_incidente, id_regra, data_abertura, status 
            FROM incidentes 
            WHERE data_abertura >= CURRENT_DATE - INTERVAL '30 days'
        """, engine)
        
    
        df_evt = pd.read_sql("""
            SELECT id_incidente, tipo, timestamp 
            FROM eventos_incidente
        """, engine)

        
        if df_exec.empty:
            print("    Sem dados de execução para processar.")

            return

     
        df_exec['data_inicio'] = pd.to_datetime(df_exec['data_inicio'], errors='coerce')
        df_exec['data_fim'] = pd.to_datetime(df_exec['data_fim'], errors='coerce')
        df_exec['duracao_ms'] = (df_exec['data_fim'] - df_exec['data_inicio']).dt.total_seconds() * 1000
        
     
        metrics_exec = df_exec.groupby('id_regra').agg(
            total_execucoes=('id_regra', 'count'),
            total_erros=('sucesso', lambda x: (~x).sum()),
            tempo_medio_execucao_ms=('duracao_ms', 'mean')
        ).reset_index()

        
        mtta_por_regra = pd.DataFrame(columns=['id_regra', 'mtta_minutos'])
        mttr_por_regra = pd.DataFrame(columns=['id_regra', 'mttr_minutos'])
        incidentes_abertos = pd.DataFrame(columns=['id_regra', 'incidentes_abertos'])

        if not df_inc.empty:
        
            incidentes_abertos = df_inc[df_inc['status'] == 'OPEN'].groupby('id_regra').size().reset_index(name='incidentes_abertos')

            if not df_evt.empty:
                full_inc = df_inc.merge(df_evt, on='id_incidente', how='left')
                
                
                acks = full_inc[full_inc['tipo'] == 'ACK'].copy()
                if not acks.empty:
                    acks['data_abertura'] = pd.to_datetime(acks['data_abertura'])
                    acks['timestamp'] = pd.to_datetime(acks['timestamp'])
                    acks['tempo_ack_min'] = (acks['timestamp'] - acks['data_abertura']).dt.total_seconds() / 60
                    mtta_por_regra = acks.groupby('id_regra')['tempo_ack_min'].mean().reset_index().rename(columns={'tempo_ack_min': 'mtta_minutos'})
                
            
                closes = full_inc[full_inc['tipo'] == 'CLOSE'].copy()
                if not closes.empty:
                    closes['data_abertura'] = pd.to_datetime(closes['data_abertura'])
                    closes['timestamp'] = pd.to_datetime(closes['timestamp'])
                    closes['tempo_resolve_min'] = (closes['timestamp'] - closes['data_abertura']).dt.total_seconds() / 60
                    mttr_por_regra = closes.groupby('id_regra')['tempo_resolve_min'].mean().reset_index().rename(columns={'tempo_resolve_min': 'mttr_minutos'})

        
        final_df = metrics_exec
        final_df = final_df.merge(mtta_por_regra, on='id_regra', how='left')
        final_df = final_df.merge(mttr_por_regra, on='id_regra', how='left')
        final_df = final_df.merge(incidentes_abertos, on='id_regra', how='left')
        
      
        valid_ids_df = pd.read_sql("SELECT id FROM regras", engine)
        if not valid_ids_df.empty:
            valid_ids = valid_ids_df['id'].tolist()
            final_df = final_df[final_df['id_regra'].isin(valid_ids)]
        else:
            print(" nesse caso n tem regra no banco ")
            return

        if final_df.empty:
            return
            
        final_df = final_df.fillna(0)
        
        final_df['data_referencia'] = pd.Timestamp.now().date()
        
        with engine.connect() as conn:
            conn.execute(text("DELETE FROM metricas_diarias WHERE data_referencia = CURRENT_DATE"))
            conn.commit()

        final_df.to_sql('metricas_diarias', engine, if_exists='append', index=False, method='multi')
        
        print(" Análise concluída com sucesso!")

    except Exception as e:
        print(f"Erro : {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print(" iniciou ")
    while True:
        calcular_metricas()
        time.sleep(60)
