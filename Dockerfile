FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY db ./db
ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000
CMD ["node", "src/server.js"]
