FROM node:22

WORKDIR /usr/src/app

COPY package.json .
COPY package-lock.json .

ARG NODE_ENV
RUN if [ "$NODE_ENV" = "development" ] || [ "$NODE_ENV" = "test" ]; \
      then npm ci -f; \
      else npm ci -f --only=production; \
      fi

COPY . .

EXPOSE 3000

CMD [ "npm", "start" ]