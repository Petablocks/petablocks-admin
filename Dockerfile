# Multi-stage Dockerfile for PETABLOCKS Admin Panel
# Stage 1: Build the Vite React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production image — Express backend serves the built frontend
FROM node:20-alpine AS production
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/ ./server/
COPY --from=frontend-build /app/dist ./dist

EXPOSE 3000
CMD ["node", "server/index.js"]
