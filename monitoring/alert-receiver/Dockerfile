FROM node:22-alpine
WORKDIR /app
COPY server.js .
USER node
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5001/health || exit 1
CMD ["node", "server.js"]
