FROM node:alpine

ENV BADGERBOT_DATADIR /data

RUN deluser --remove-home node

RUN mkdir /app && \
    mkdir /data

WORKDIR /app
ADD . .

RUN npm install --only=production --no-audit

CMD ["node", "bot.js"]
