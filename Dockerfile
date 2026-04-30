# Use Node.js for building and running
FROM node:20-slim AS builder

WORKDIR /app

# Build tools needed for native addons (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies (including native addon compilation)
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build

# Final production image
FROM node:20-slim

WORKDIR /app

# Install ffmpeg and sqlite3 runtime
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy built assets, server, and pre-compiled node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Data directory for SQLite DB and saved clips
ENV DATA_DIR=/data
VOLUME ["/data"]

# Expose port 80
ENV PORT=80
EXPOSE 80

# Run the server
CMD ["node", "server.js"]
