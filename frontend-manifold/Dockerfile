FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
# pg_dump and pg_restore for the backup and restore commands of the CLI.
RUN apk add --no-cache postgresql17-client
WORKDIR /app
ENV NODE_ENV=production
# The app enforces its own body limits (5 MB, uploads up to UPLOAD_MAX_BYTES) in hooks.server.ts.
ENV BODY_SIZE_LIMIT=Infinity
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/build-cli/cli.js ./cli.js
COPY --chown=node:node migrations ./migrations
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
CMD ["node", "build"]
