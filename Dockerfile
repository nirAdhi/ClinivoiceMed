# ---- Build stage: install deps ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Install and build the React frontend
COPY desktop/package*.json ./desktop/
RUN cd desktop && npm ci

COPY . .
RUN chmod +x ./desktop/node_modules/.bin/vite
RUN cd desktop && npm run build

# ---- Production stage ----
FROM node:20-alpine

WORKDIR /app

# Copy backend deps and built frontend from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/desktop/dist ./desktop/dist
COPY . .

# Remove desktop source (only keep dist)
RUN rm -rf desktop/src desktop/node_modules

EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002

CMD ["node", "server.js"]
