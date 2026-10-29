FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY server ./server
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node","server/server.mjs"]
