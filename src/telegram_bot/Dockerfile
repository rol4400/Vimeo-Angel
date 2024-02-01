FROM node:18

# Create app directory
RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

COPY package*.json ./

RUN npm run build

# Bundle app source

COPY ../ .
EXPOSE 5000
EXPOSE 80
EXPOSE 443
EXPOSE 5222 
# ENV NODE_ENV=production
CMD [ "npm", "run", "start-prod-server" ]