FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./

RUN npm ci

COPY . .

RUN npm run build && npm run --silent sbom > sbom.cdx.json && npm prune --omit=dev

FROM node:24-alpine AS runtime

# pg_dump and pg_restore for the backup and restore commands of the CLI.
RUN apk add --no-cache postgresql17-client

# The app enforces its own body limits (5 MB, uploads up to UPLOAD_MAX_BYTES) in hooks.server.ts.
# Temporary backup files go to the volume, so large archives do not have to fit into memory.
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000 \
	UPLOAD_DIR=/data/uploads \
	BODY_SIZE_LIMIT=Infinity \
	TMPDIR=/data/tmp

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
		/usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
		/usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
	&& mkdir -p /data/uploads /data/backups /data/tmp \
	&& chown -R node:node /data

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/build-cli/cli.js ./cli.js
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/sbom.cdx.json ./sbom.cdx.json
COPY docker/healthcheck.mjs ./healthcheck.mjs

USER node

VOLUME /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "healthcheck.mjs"]

CMD ["node", "build/server.js"]
