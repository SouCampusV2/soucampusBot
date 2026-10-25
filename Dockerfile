# BoCampus bot image.
# Debian slim, not Alpine: better-sqlite3 ships prebuilt glibc binaries, so no compiler is needed.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY database/schema.sql ./database/schema.sql

# The database lives in a volume mounted at /app/data; the image itself stays stateless.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

CMD ["node", "src/index.js"]
