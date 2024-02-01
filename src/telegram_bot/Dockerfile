FROM node:18

# Create app directory
# RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

# Install ffmpeg for video processing
RUN apt-get -y update
RUN apt-get -y upgrade
RUN apt-get install -y ffmpeg

# Install NPM and Typescript
COPY package*.json ./
RUN npm install && npm install typescript -g

# RUN file="$(ls -1 /tmp)" && echo $file
# RUN tsc

EXPOSE 5000
EXPOSE 80
EXPOSE 443
EXPOSE 5222 

# ENV NODE_ENV=production
# CMD [ "npm", "run", "start-prod-server" ]