# Stage 1: Build TypeScript artifacts
FROM node:20-alpine AS builder

WORKDIR /build

# Copy and install backend dependencies
COPY apps/api/package*.json ./apps/api/
WORKDIR /build/apps/api
RUN npm install

# Copy source code and configuration
WORKDIR /build
COPY packages/crypto ./packages/crypto
COPY apps/api ./apps/api

# Compile TypeScript for apps/api and packages/crypto
WORKDIR /build/apps/api
RUN npm run build

# Stage 2: Production Azure Functions Host
FROM mcr.microsoft.com/azure-functions/node:4-node20

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

WORKDIR /home/site/wwwroot

# Copy production package files and install production dependencies
COPY apps/api/package*.json ./
RUN npm install --omit=dev

# Copy compiled files and host configuration from builder
COPY --from=builder /build/apps/api/dist ./dist
COPY --from=builder /build/apps/api/host.json ./host.json

# Copy packages/crypto dist
COPY --from=builder /build/packages/crypto /packages/crypto

EXPOSE 80

