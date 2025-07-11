FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache bash curl

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run prisma:generate
RUN npm run build

RUN apk add --no-cache bash
COPY wait-for-it.sh .
RUN chmod +x wait-for-it.sh

CMD ["node", "dist/index.js"]
