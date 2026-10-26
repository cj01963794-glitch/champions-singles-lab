FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/pokemon-showdown
RUN git init && git remote add origin https://github.com/smogon/pokemon-showdown.git && git fetch --depth 1 origin d849b220082e113d8a17303509fb44d420c543d5 && git checkout --detach FETCH_HEAD && npm install --omit=optional --no-audit --no-fund && npm run build
WORKDIR /app
COPY . .
ENV SHOWDOWN_PACKAGE_PATH=/opt/pokemon-showdown
# Stop deployment if the saved Gyarados/Primarina opener regresses.
RUN node --check engines/experimental.cjs
RUN node --test test/model-selector.test.cjs
RUN node --test test/experimental.test.cjs
RUN node --test test/experimental-historical.test.cjs
RUN node --test test/experimental-counterfactual.test.cjs
RUN node --test test/pain-split-ui.test.cjs
RUN node --test test/rotom-scrafty.test.cjs
RUN node --test test/rotom-salamence.test.cjs
RUN node --test test/metagross-scrafty-immunity.test.cjs
RUN node --test test/gyarados-primarina.test.cjs
RUN node --test test/floette-mimikyu.test.cjs
RUN node --test test/floette-mimikyu-plan.test.cjs
ENV PORT=10000
EXPOSE 10000
CMD ["node","server.cjs"]