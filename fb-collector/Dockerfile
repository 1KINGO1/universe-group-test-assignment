FROM node:18-alpine AS builder

WORKDIR /app

COPY ./package.json ./package-lock.json ./

RUN npm ci

COPY . .

RUN npm run prisma:generate
RUN npm run build


FROM node:18-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

RUN npm ci
RUN npm install -g @nestjs/cli

RUN npm run prisma:generate

COPY --from=builder /app/dist ./dist
RUN npm run prisma:generate

EXPOSE 3000
ENV NODE_ENV=production

RUN apk add --no-cache curl

CMD ["node", "dist/main.js"]
