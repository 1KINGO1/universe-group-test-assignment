FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache bash curl

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run prisma:generate
RUN npm run build

CMD ["node", "dist/index.js"]
