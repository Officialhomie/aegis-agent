FROM node:22.14-slim

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

# Prisma 7 requires DATABASE_URL for `prisma generate` when prisma.config.ts is present.
# Use a dummy URL at build time; runtime uses the real DATABASE_URL from the environment.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
