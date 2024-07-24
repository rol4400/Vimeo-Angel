FROM node:18

# Create app directory
# RUN mkdir -p /usr/src/bot
WORKDIR /usr/src/bot

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)

# Install ffmpeg for video processing
RUN apt-get -y upgrade
RUN apt-get -y update
RUN apt-get install -y ffmpeg

# Auto subtitling stuff
RUN apt-get install pip3
RUN apt-get install python3
RUN pip install git+https://github.com/m1guelpf/auto-subtitle.git --break-system-packages --no-input
RUN pip install ffmpeg-python --break-system-packages --no-input

# Install NPM and Typescript
COPY package*.json ./
COPY ./telegram-bot-api-data /var/lib/telegram-bot-api
RUN npm install typescript -g
RUN npm install

# Install Puppeteer
RUN apt-get update && apt-get install gnupg wget -y && \
  wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt-get update && \
  apt-get install google-chrome-stable -y --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# RUN file="$(ls -1 /tmp)" && echo $file
# RUN tsc

EXPOSE 5000
EXPOSE 80
EXPOSE 443
EXPOSE 5222 

# ENV NODE_ENV=production
# CMD [ "npm", "run", "start-prod-server" ]