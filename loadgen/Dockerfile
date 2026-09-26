# Build context is the repo root, so the UI can import results/000-baseline.json and README.md.
FROM docker.io/library/node:24-alpine AS ui
WORKDIR /repo/loadgen/ui
COPY loadgen/ui/package*.json ./
RUN npm ci --no-audit --no-fund
COPY results/000-baseline.json /repo/results/000-baseline.json
COPY README.md /repo/README.md
COPY loadgen/ui ./
RUN npm run build

FROM docker.io/library/node:24-alpine AS dev
WORKDIR /app
COPY loadgen/package*.json ./
RUN npm ci --no-audit --no-fund
COPY loadgen/src ./src
COPY loadgen/tsconfig.json ./
COPY --from=ui /repo/loadgen/ui/dist ./ui/dist
EXPOSE 3200
CMD ["node", "src/server.ts"]

FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY loadgen/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY loadgen/src ./src
COPY loadgen/tsconfig.json ./
COPY --from=ui /repo/loadgen/ui/dist ./ui/dist
ENV NODE_ENV=production
EXPOSE 3200
CMD ["node", "src/server.ts"]
