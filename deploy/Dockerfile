FROM node:24-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install --global pnpm@11.25.0 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build && pnpm prune --prod

FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8877
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/source ./source
COPY --from=build --chown=node:node /app/package.json /app/ai-server.cjs /app/server.cjs /app/tutor-service.cjs /app/session-store.cjs /app/provider-config.cjs /app/setup-page.cjs /app/report-service.cjs ./
RUN mkdir -p /app/.local && chown node:node /app/.local
USER node
EXPOSE 8877
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8877/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "ai-server.cjs"]
