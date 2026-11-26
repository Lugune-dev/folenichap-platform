FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY --from=build /app/dist/browser /usr/share/nginx/html
