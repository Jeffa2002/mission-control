FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache docker-cli openssh-client geoip geoip-dev

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3020

CMD ["npm","run","start"]
