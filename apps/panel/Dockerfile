FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache docker-cli openssh-client geoip sqlite \
  && addgroup -S mission \
  && adduser -S mission -G mission

COPY --from=build --chown=mission:mission /app/.next/standalone ./
COPY --from=build --chown=mission:mission /app/.next/static ./.next/static

ENV NODE_ENV=production
ENV PORT=3020
ENV HOSTNAME=0.0.0.0
EXPOSE 3020

USER mission
CMD ["node","server.js"]
