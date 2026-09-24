FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.ts"]
