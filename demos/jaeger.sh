#!/usr/bin/env bash
# C6: Jaeger with an OTLP/HTTP receiver on 4318 and the UI on 16686.
#
#   bash demos/jaeger.sh          start it
#   docker rm -f jaeger           stop it (it keeps traces in memory only)
set -euo pipefail
docker run --rm -d --name jaeger -p 16686:16686 -p 4318:4318 jaegertracing/jaeger:2.21.0
echo "Jaeger UI: http://localhost:16686  (then: npm run maintainer -- <subcommand> --otel)"
