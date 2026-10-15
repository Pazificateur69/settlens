FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS dependencies

ENV NODE_ENV=production

WORKDIR /opt/settlens
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS runtime

ENV NODE_ENV=production

RUN rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p /opt/settlens /workspace \
    && chown node:node /opt/settlens /workspace

WORKDIR /opt/settlens
COPY --from=dependencies --chown=node:node /opt/settlens/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node schemas ./schemas

WORKDIR /workspace
USER node

ENTRYPOINT ["node", "/opt/settlens/src/cli.js"]
CMD ["--help"]
