# Build from the repository root so the shared types are available:
#   docker build -f backend/Dockerfile -t smart-food-tracker-backend .
FROM node:20-alpine AS build
WORKDIR /app
COPY shared ./shared
COPY backend/package*.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
RUN cd backend && npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY backend/package.json ./
EXPOSE 4000
CMD ["node", "dist/server.js"]
