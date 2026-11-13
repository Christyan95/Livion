import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteSupabaseServiceRole } from '@/infra/supabase/cliente-servidor';

/**
 * Seção 4.4: Cron Job Protegido (`/api/cron/manutencao`)
 * Exige validação estrita do cabeçalho `Authorization: Bearer <CRON_SECRET>`.
 * Mantém o projeto Supabase ativo no plano gratuito, processa escudos de ofensiva
 * à meia-noite e encerra a Liga da Semana às segundas-feiras (00:00 BRT).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: 'NAO_AUTORIZADO: Cabeçalho Authorization Bearer CRON_SECRET inválido ou ausente.',
      },
      { status: 401 }
    );
  }

  const supabaseAdmin = criarClienteSupabaseServiceRole();
  if (!supabaseAdmin) {
    return NextResponse.json({
      sucesso: true,
      modo: 'simulacao_sem_credenciais_supabase',
      executado_em: new Date().toISOString(),
    });
  }

  const { data, error } = await supabaseAdmin.rpc('rpc_sis_executar_manutencao');

  if (error) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    sucesso: true,
    resultado: data,
  });
}

