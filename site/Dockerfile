FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
# Repository files the pages render at build time (repoFile/repoJson in site/src/pages).
# test/site.test.js fails when a page reads a file that is not copied here or is excluded by .dockerignore.
COPY package.json CHANGELOG.md action.yml settlens.config.example.json ./
COPY examples/github-workflow.yml ./examples/
COPY schemas ./schemas
COPY src ./src
COPY scripts ./scripts
COPY site ./site
# Strict build: fails the image build on any broken link, missing page or CSP violation.
# Files stay root-owned so the runtime user can read but not modify the code or the site;
# chmod makes them readable even when the build context was checked out with a restrictive umask.
RUN node site/build.js \
  && chmod -R a+rX,go-w /app \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
USER node
EXPOSE 8080
CMD ["node", "site/server.js"]
