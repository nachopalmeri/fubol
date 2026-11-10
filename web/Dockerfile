# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    FUBOL_DATA_DIR=/data

# ffmpeg is required, not optional: the live compatibility relay re-encodes
# every origin the browser cannot play natively, which is how the Argentine
# channels are served. ffprobe backs the subtitle audio-sync path.
RUN apk add --no-cache ffmpeg \
    && addgroup -g 1001 -S nodejs \
    && adduser -S fubol -u 1001

COPY --from=build /app/public ./public
COPY --from=build --chown=fubol:nodejs /app/.next/standalone ./
COPY --from=build --chown=fubol:nodejs /app/.next/static ./.next/static

RUN mkdir -p /data && chown fubol:nodejs /data
USER fubol

EXPOSE 3001
CMD ["node", "server.js"]
