FROM docker.io/library/node:24-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3200
CMD ["node", "src/server.ts"]

FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
ENV NODE_ENV=production
EXPOSE 3200
CMD ["node", "src/server.ts"]
