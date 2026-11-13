#!/usr/bin/env bash
# ==============================================================================
# LIVION SMOKE TEST (Synthetic Post-Deploy Health Check)
# ==============================================================================
set -euo pipefail

TARGET_URL="${1:-http://localhost:3000}"
MAX_RETRIES=10
SLEEP_SECONDS=3

echo "🚀 Iniciando Smoke Test Sintético pós-deploy em: ${TARGET_URL}"

for ((i=1; i<=MAX_RETRIES; i++)); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "${TARGET_URL}" || true)
  
  if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ Sucesso: Endpoint respondeu HTTP 200 na tentativa ${i}."
    exit 0
  else
    echo "⚠️  Tentativa ${i}/${MAX_RETRIES}: Resposta HTTP ${HTTP_STATUS}. Aguardando ${SLEEP_SECONDS}s..."
    sleep "$SLEEP_SECONDS"
    SLEEP_SECONDS=$((SLEEP_SECONDS * 2))
    if [ "$SLEEP_SECONDS" -gt 20 ]; then
      SLEEP_SECONDS=20
    fi
  fi
done

echo "❌ ERRO CRÍTICO: Smoke Test falhou após ${MAX_RETRIES} tentativas. O deployment não está saudável."
exit 1

