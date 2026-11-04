FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Git checkouts and copyFile can preserve restrictive modes from a deploy umask.
# nginx workers must be able to read every public asset and traverse its folders.
RUN find /usr/share/nginx/html -type d -exec chmod 755 {} + \
    && find /usr/share/nginx/html -type f -exec chmod 644 {} +
COPY nginx.conf /etc/nginx/conf.d/default.conf
