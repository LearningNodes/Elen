# Elen hosted MCP (FX-3). Build order respects file: dependencies.
# better-sqlite3: node:20-slim includes build tooling via apt when needed;
# prebuilds usually satisfy linux/x64 so native compile is often unnecessary.
FROM node:20-slim AS build
WORKDIR /app

# Copy manifests + lockfiles first (no root package.json — monorepo packages only)
COPY packages/core/package.json packages/core/package-lock.json packages/core/
COPY packages/sdk-ts/package.json packages/sdk-ts/package-lock.json packages/sdk-ts/
COPY packages/consolidator/package.json packages/consolidator/package-lock.json packages/consolidator/
COPY packages/mcp-server/package.json packages/mcp-server/package-lock.json packages/mcp-server/

# Install in dependency order so file: links resolve
RUN cd packages/core && npm ci \
 && cd ../sdk-ts && npm ci \
 && cd ../consolidator && npm ci \
 && cd ../mcp-server && npm ci

COPY packages/core packages/core
COPY packages/sdk-ts packages/sdk-ts
COPY packages/consolidator packages/consolidator
COPY packages/mcp-server packages/mcp-server

RUN cd packages/core && npm run build \
 && cd ../sdk-ts && npm run build \
 && cd ../mcp-server && npm run build
# consolidator has no build step

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
RUN useradd -m -u 10001 elen
COPY --from=build /app/packages/core /app/packages/core
COPY --from=build /app/packages/sdk-ts /app/packages/sdk-ts
COPY --from=build /app/packages/consolidator /app/packages/consolidator
COPY --from=build /app/packages/mcp-server /app/packages/mcp-server
USER elen
ENV PORT=8787
EXPOSE 8787
CMD ["node", "packages/mcp-server/dist/index.js", "serve", "--http"]
