FROM node:22-alpine

WORKDIR /app
COPY server/ ./

ENV PORT=8080 \
    VIDEO_DIR=/videos

EXPOSE 8080

# Draait standaard als de Synology-gebruiker; overschrijfbaar via `user:` in compose
USER 1026:100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "server.mjs"]
