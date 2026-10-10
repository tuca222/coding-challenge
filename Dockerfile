FROM node:24-slim AS build
WORKDIR /app
# Tests do not run in the image: skip the mongod download of mongodb-memory-server
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /tmp/reports && chown node:node /tmp/reports
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
