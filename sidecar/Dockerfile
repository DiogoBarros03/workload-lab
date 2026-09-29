FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
RUN npm test && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "src/server.ts"]
