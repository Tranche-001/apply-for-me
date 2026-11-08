# Multi-stage build: Next.js standalone output + Prisma client.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 POSTING_BROWSER_PATH=/usr/bin/chromium-browser
# Chromium reads job pages that JavaScript draws (playwright-core downloads no browser of its own).
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# Whole package: the standalone trace leaves out its browsers.json and other non-JS files.
COPY --from=build /app/node_modules/playwright-core ./node_modules/playwright-core
# The Prisma CLI (same version as package.json) runs the migrations on start.
RUN npm install -g prisma@6.19.3 && npm cache clean --force
EXPOSE 3000
# Apply migrations, then start the server.
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
