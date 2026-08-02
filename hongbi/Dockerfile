# 红笔 HONGBI · Node.js 生产镜像
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server/ ./server/
COPY js/ ./js/
COPY css/ ./css/
COPY index.html ./
COPY examples/ ./examples/

ENV PORT=8712
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 8712
VOLUME ["/app/server/data"]

CMD ["node", "server/server.js"]
