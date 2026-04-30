# Use Node.js for building and running
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Final production image
FROM node:20-slim

WORKDIR /app

# Install native ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Copy built assets and server files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm install --production

# Expose port 80 (to match your existing nginx setup)
ENV PORT=80
EXPOSE 80

# Run the server
CMD ["node", "server.js"]
