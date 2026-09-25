FROM docker.io/library/node:24-alpine AS ui
WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci --no-audit --no-fund
COPY ui ./
RUN npm run build

FROM docker.io/library/node:24-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
COPY --from=ui /ui/dist ./ui/dist
EXPOSE 3200
CMD ["node", "src/server.ts"]

FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY tsconfig.json ./
COPY --from=ui /ui/dist ./ui/dist
ENV NODE_ENV=production
EXPOSE 3200
CMD ["node", "src/server.ts"]
